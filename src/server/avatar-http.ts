import { z } from "zod";
import {
  completeAvatarJob,
  createAvatarJob,
  getAvatarJob,
  type ServerAvatarJob,
} from "./avatar-jobs";
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

/**
 * O que sai para o cliente.
 *
 * `contactEmail` e `imageUrls` entram no job mas não voltam: o id é um UUID,
 * não uma sessão — quem o tiver não devia poder ler o email de contacto de
 * quem pediu o avatar. O cliente já sabe o que enviou.
 */
function jobPublico(job: ServerAvatarJob) {
  const { contactEmail: _email, imageUrls: _urls, ...publico } = job;
  return publico;
}

/**
 * O endpoint que completa um job injeta um URL de GLB que a app vai carregar
 * dentro do lar da família. Sem prova de que quem chama é a equipa, qualquer
 * pessoa com o id do job punha lá o modelo que quisesse.
 *
 * Sem `AVATAR_ADMIN_TOKEN` definido recusa — falhar fechado. O caminho studio
 * fica indisponível até alguém configurar o segredo, o que é o comportamento
 * correto: melhor indisponível do que aberto.
 */
function adminAutorizado(req: Request): boolean {
  const esperado = process.env.AVATAR_ADMIN_TOKEN?.trim();
  if (!esperado) return false;
  const dado = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!dado || dado.length !== esperado.length) return false;
  // Comparação de tempo constante: um `===` vaza o prefixo correto pelo tempo.
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ dado.charCodeAt(i);
  return diff === 0;
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

    return Response.json({ job: jobPublico(job) }, { status: 201 });
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
    return Response.json({ job: jobPublico(job) });
  } catch (e) {
    console.error("[presenca:avatar:get]", e);
    return Response.json({ error: "Falha ao ler o job." }, { status: 500 });
  }
}

export async function handleCompleteAvatarJob(req: Request, id: string): Promise<Response> {
  try {
    const limite = checkRateLimit("avatar", clientKey(req));
    if (!limite.allowed) return tooManyRequests("avatar", limite);

    if (!adminAutorizado(req)) {
      return bad("Completar um job de avatar exige credencial de equipa.", 401);
    }

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
    // Só HTTPS ou um caminho do próprio site: o URL vai parar a um `useGLTF`
    // no browser da família, por isso não pode ser `javascript:` nem um
    // `data:` arbitrário vindo de fora.
    if (!/^https:\/\//i.test(url) && !url.startsWith("/")) {
      return bad("O GLB tem de ser um URL https:// ou um caminho do próprio site.");
    }

    const job = completeAvatarJob(id, url);
    if (!job) return bad("Job não encontrado.", 404);
    return Response.json({ job: jobPublico(job) });
  } catch (e) {
    console.error("[presenca:avatar:complete]", e);
    return Response.json({ error: "Falha ao completar o job." }, { status: 500 });
  }
}
