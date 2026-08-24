import { z } from "zod";
import { completeAvatarJob, createAvatarJob, getAvatarJob } from "./avatar-jobs";
import { checkRateLimit, clientKey, tooManyRequests } from "./rate-limit";

const createSchema = z.object({
  personaId: z.string().min(1).max(80),
  path: z.enum(["self_service", "studio"]),
  brief: z.string().max(4000).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  estimatedHeightM: z.number().min(1).max(2.5).optional(),
  photoCount: z.number().int().min(0).max(24),
  videoCount: z.number().int().min(0).max(4),
  /** URLs HTTPS públicas para o gerador descarregar (não enviar data: no servidor de produção) */
  imageUrls: z.array(z.string().max(2000)).max(8).optional(),
});

const completeSchema = z.object({
  resultGlbUrl: z.string().min(1).max(2000),
});

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function handleCreateAvatarJob(req: Request): Promise<Response> {
  try {
    const limite = checkRateLimit("avatar", clientKey(req));
    if (!limite.allowed) return tooManyRequests("avatar", limite);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return bad("JSON inválido.");
    }
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return bad(
        "Pedido de avatar inválido: " +
          parsed.error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join("; "),
      );
    }

    const d = parsed.data;
    if (d.photoCount + d.videoCount < 1) {
      return bad("Indique pelo menos uma foto ou vídeo (contagem).");
    }

    // URLs devem ser http(s) se enviadas — rejeitar data: no servidor
    if (d.imageUrls?.some((u) => u.startsWith("data:"))) {
      return bad(
        "Não envie data URLs ao servidor. Use imageUrls HTTPS (storage) ou associe GLB manualmente.",
      );
    }

    const job = createAvatarJob({
      personaId: d.personaId,
      path: d.path,
      brief: d.brief,
      contactEmail: d.contactEmail || undefined,
      estimatedHeightM: d.estimatedHeightM,
      photoCount: d.photoCount,
      videoCount: d.videoCount,
      imageUrls: d.imageUrls,
    });

    return Response.json({ job }, { status: 201 });
  } catch (e) {
    console.error("[presenca:avatar:create]", e);
    return Response.json({ error: "Falha interna ao criar o job de avatar." }, { status: 500 });
  }
}

export async function handleGetAvatarJob(_req: Request, id: string): Promise<Response> {
  try {
    if (!id || id.length > 80) return bad("Id inválido.");
    const job = getAvatarJob(id);
    if (!job) return bad("Job não encontrado.", 404);
    return Response.json({ job });
  } catch (e) {
    console.error("[presenca:avatar:get]", e);
    return Response.json({ error: "Falha ao ler o job." }, { status: 500 });
  }
}

export async function handleCompleteAvatarJob(req: Request, id: string): Promise<Response> {
  try {
    const limite = checkRateLimit("avatar", clientKey(req));
    if (!limite.allowed) return tooManyRequests("avatar", limite);

    if (!id || id.length > 80) return bad("Id inválido.");

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return bad("JSON inválido.");
    }
    const parsed = completeSchema.safeParse(raw);
    if (!parsed.success) return bad("GLB inválido.");

    const url = parsed.data.resultGlbUrl.trim();
    if (
      !url.toLowerCase().includes(".glb") &&
      !url.startsWith("blob:") &&
      !url.startsWith("data:")
    ) {
      // aviso suave — ainda permite paths /avatars/x.glb
    }

    const job = completeAvatarJob(id, url);
    if (!job) return bad("Job não encontrado.", 404);
    return Response.json({ job });
  } catch (e) {
    console.error("[presenca:avatar:complete]", e);
    return Response.json({ error: "Falha ao completar o job." }, { status: 500 });
  }
}
