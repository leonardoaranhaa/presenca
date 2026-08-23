/**
 * Adaptadores HTTP para /api/voice/*.
 *
 * Validação com zod: o corpo vem do browser e não é de confiança.
 */
import { z } from "zod";
import { POLICY_VERSION } from "@/lib/lgpd";
import { cloneVoice, synthesizeSpeech } from "./voice";
import { checkRateLimit, clientKey, tooManyRequests } from "./rate-limit";

/** ~5 MB por amostra depois de descodificada; ~15 MB no pedido inteiro. */
const MAX_SAMPLE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

/** base64 gasta ~4 caracteres por cada 3 bytes. */
function decodedBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  if (i < 0) return 0;
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

const audioDataUrl = z
  .string()
  .regex(/^data:audio\/[a-z0-9.+-]+;base64,/i, "Amostra tem de ser áudio em data URL")
  .refine((s) => decodedBytes(s) <= MAX_SAMPLE_BYTES, "Amostra acima de 5 MB");

/**
 * Registo de consentimento que acompanha o pedido de clone.
 *
 * A voz é dado biométrico. O inventário em `src/lib/lgpd.ts` classifica-a como
 * sensível, com base legal "consent" — mas até aqui o consentimento era
 * verificado só no browser, o que o tornava decorativo: qualquer pedido criava
 * uma voz na conta do fornecedor de quem hospeda.
 *
 * Isto é uma **declaração do cliente**, não uma prova: sem contas, o servidor
 * não tem como verificar quem declarou. O que ganha é (a) tornar o
 * consentimento explícito e auditável no pedido, como a LGPD exige que seja
 * demonstrável, e (b) fechar o caminho acidental. Prova a sério exige
 * autenticação — está registado como dependência em PLANO.md.
 */
const consentSchema = z.object({
  /** PrivacyPrefs.allowVoiceClone */
  allowVoiceClone: z.literal(true, {
    message: "É preciso ativar o clone de voz nas preferências de privacidade.",
  }),
  /** PrivacyPrefs.memorialFamilyAuthority — a família declara legitimidade. */
  memorialFamilyAuthority: z.literal(true, {
    message: "É preciso declarar legitimidade familiar para clonar esta voz.",
  }),
  /** Versão da política aceite, para o aceite não valer para sempre. */
  policyVersion: z.string(),
  acceptedAt: z.number().int().positive(),
});

const cloneSchema = z
  .object({
    personaId: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    consent: consentSchema,
    samples: z.array(audioDataUrl).min(1).max(5),
  })
  .refine(
    (b) => b.samples.reduce((t, s) => t + decodedBytes(s), 0) <= MAX_TOTAL_BYTES,
    "Amostras somam mais de 15 MB",
  );

const ttsSchema = z.object({
  text: z.string().min(1).max(1200),
  voiceId: z.string().min(1).max(120),
  modelId: z.string().max(80).optional(),
});

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

async function readJson(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function handleVoiceClone(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const limite = checkRateLimit("voiceClone", clientKey(req));
  if (!limite.allowed) return tooManyRequests("voiceClone", limite);

  const raw = await readJson(req);
  if (raw === undefined) return badRequest("JSON inválido.");

  const parsed = cloneSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Pedido de clone inválido.");
  }

  // Um aceite de uma versão antiga da política não vale para dado sensível.
  if (parsed.data.consent.policyVersion !== POLICY_VERSION) {
    return Response.json(
      {
        error: "A política de privacidade mudou. É preciso aceitar de novo antes de clonar a voz.",
      },
      { status: 409 },
    );
  }

  console.info("[presenca:voz] clone autorizado", {
    personaId: parsed.data.personaId,
    amostras: parsed.data.samples.length,
    politica: parsed.data.consent.policyVersion,
  });

  const result = await cloneVoice({
    personaId: parsed.data.personaId,
    name: parsed.data.name,
    samples: parsed.data.samples,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 400 });
  }
  return Response.json({ voiceId: result.voiceId });
}

export async function handleVoiceTts(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const limite = checkRateLimit("tts", clientKey(req));
  if (!limite.allowed) return tooManyRequests("tts", limite);

  const raw = await readJson(req);
  if (raw === undefined) return badRequest("JSON inválido.");

  const parsed = ttsSchema.safeParse(raw);
  if (!parsed.success) return badRequest("Pedido de fala inválido.");

  const result = await synthesizeSpeech(parsed.data);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 400 });
  }
  return new Response(result.audio, {
    status: 200,
    headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
  });
}
