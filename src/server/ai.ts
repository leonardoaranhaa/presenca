/**
 * Camada de IA — **apenas servidor**.
 *
 * Nunca importar este módulo de `src/components` ou `src/lib`: a chave da API
 * viveria no bundle do browser. O cliente fala com `/api/chat` e `/api/awaken`
 * através de `src/lib/ai-client.ts`.
 */

import { z } from "zod";
import { composeSystemPrompt } from "@/lib/prompt";

const DEFAULT_MODEL = "grok-4.5";
const DEFAULT_API_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Endpoint do fornecedor. Configurável para permitir apontar a um proxy, a um
 * self-host, ou a um stub local — sem isto não há forma de validar o fluxo de
 * conversa ponta a ponta sem gastar dinheiro no fornecedor real.
 * O formato é compatível com OpenAI.
 */
function apiUrl(): string {
  return process.env.AI_API_URL || DEFAULT_API_URL;
}

/** Erro apresentável ao utilizador (em PT), sem detalhes do fornecedor. */
export type AiFailure = { ok: false; error: string; status?: number };

/**
 * Dados da persona. O cliente **não** envia o systemPrompt: envia os factos e o
 * servidor compõe o prompt, para que os limites éticos entrem sempre.
 */
const personaPromptSchema = z.object({
  name: z.string().min(1).max(120),
  relationship: z.string().max(80).default(""),
  kind: z.enum(["living", "memorial"]),
  bio: z.string().max(4000).default(""),
  traits: z.array(z.string().max(60)).max(24).default([]),
  speechNotes: z.string().max(2000).default(""),
  favorites: z.string().max(2000).default(""),
  soul: z
    .object({
      summary: z.string().max(600).default(""),
      voice: z.string().max(400).default(""),
      mannerisms: z.array(z.string().max(120)).max(16).default([]),
      catchphrases: z.array(z.string().max(120)).max(16).default([]),
      values: z.array(z.string().max(120)).max(16).default([]),
    })
    .optional(),
  memories: z
    .array(
      z.object({
        kind: z.string().max(40),
        title: z.string().max(200),
        body: z.string().max(4000),
      }),
    )
    .max(60)
    .default([]),
});

export const chatInputSchema = z.object({
  persona: personaPromptSchema,
  /** Traços recuperados pelo cérebro mimético local. Contexto, não instruções. */
  retrieved: z.string().max(4000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "presence"]),
        text: z.string().max(2000),
      }),
    )
    .max(40)
    .default([]),
  message: z.string().min(1).max(2000),
});

export const awakenInputSchema = z.object({
  name: z.string().min(1).max(120),
  relationship: z.string().max(80).default(""),
  kind: z.enum(["living", "memorial"]),
  bio: z.string().max(4000).default(""),
  traits: z.array(z.string().max(60)).max(24).default([]),
  speechNotes: z.string().max(2000).default(""),
  favorites: z.string().max(2000).default(""),
  memories: z
    .array(
      z.object({
        kind: z.string().max(40),
        title: z.string().max(200),
        body: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
  photoDataUrls: z.array(z.string()).max(3).default([]),
});

export type ChatInput = z.infer<typeof chatInputSchema>;
export type AwakenInput = z.infer<typeof awakenInputSchema>;

export const soulSchema = z.object({
  summary: z.string().default(""),
  voice: z.string().default(""),
  mannerisms: z.array(z.string()).default([]),
  catchphrases: z.array(z.string()).default([]),
  values: z.array(z.string()).default([]),
});

export type Soul = z.infer<typeof soulSchema>;

type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

function apiKey(): string | undefined {
  return process.env.XAI_API_KEY || undefined;
}

function model(): string {
  return process.env.XAI_MODEL || DEFAULT_MODEL;
}

/** Chamada ao fornecedor (formato OpenAI). */
async function providerChat(
  messages: ProviderMessage[],
  maxTokens: number,
  signal?: AbortSignal,
): Promise<{ ok: true; text: string } | AiFailure> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error: "A voz da presença não está configurada neste ambiente.",
      status: 503,
    };
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model(),
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal,
    });
  } catch {
    return {
      ok: false,
      error: "A presença não conseguiu chegar até aqui. Tente de novo em instantes.",
      status: 502,
    };
  }

  if (!res.ok) {
    // O corpo do erro pode conter detalhes do fornecedor — fica no log, não na UI.
    const detail = await res.text().catch(() => "");
    console.error("[presenca:ai]", res.status, detail.slice(0, 300));
    return {
      ok: false,
      error: `A presença hesitou (${res.status}). Tente de novo em instantes.`,
      status: res.status === 429 ? 429 : 502,
    };
  }

  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const text = body?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    return { ok: false, error: "A presença ficou em silêncio. Tente de novo.", status: 502 };
  }
  return { ok: true, text };
}

export async function chatWithPresence(
  data: ChatInput,
  signal?: AbortSignal,
): Promise<{ ok: true; text: string } | AiFailure> {
  const message = data.message.trim();
  if (!message) return { ok: false, error: "Escreva algo para dizer.", status: 400 };

  const history: ProviderMessage[] = data.history.slice(-12).map((t) => ({
    role: t.role === "presence" ? "assistant" : "user",
    content: t.text,
  }));

  // O prompt é composto aqui, a partir dos dados validados: é a única forma de
  // garantir que os limites éticos estão presentes em todas as conversas.
  const systemPrompt = composeSystemPrompt(data.persona, data.retrieved);

  return providerChat(
    [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
    350,
    signal,
  );
}

/** Remove cercas markdown que o modelo por vezes acrescenta apesar da instrução. */
function stripJsonFence(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export async function awakenPresence(
  data: AwakenInput,
  signal?: AbortSignal,
): Promise<{ ok: true; soul: Soul } | AiFailure> {
  const memoryText = data.memories.map((m) => `- (${m.kind}) ${m.title}: ${m.body}`).join("\n");

  const instruction = `Analise as memórias de ${data.name} (${data.relationship}, ${
    data.kind === "memorial" ? "pessoa falecida, reconstrução memorial" : "persona viva"
  }).
Extraia um perfil fiel, sem inventar factos que não estejam no material.
Bio: ${data.bio}
Traços: ${data.traits.join(", ")}
Jeito de falar: ${data.speechNotes}
Gostos: ${data.favorites}
Memórias:
${memoryText || "(somente o texto acima)"}

Responda APENAS um JSON válido, sem markdown, com as chaves:
{
  "summary": "2 frases",
  "voice": "como fala",
  "mannerisms": ["..."],
  "catchphrases": ["..."],
  "values": ["..."]
}`;

  const photos = data.photoDataUrls.filter((u) => u.startsWith("data:image"));
  const content: unknown[] = [{ type: "text", text: instruction }];
  for (const url of photos) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const result = await providerChat(
    [
      {
        role: "system",
        content:
          "Você é um arquivista cuidadoso de memórias familiares. Nunca inventa biografia. JSON puro.",
      },
      { role: "user", content: photos.length ? content : instruction },
    ],
    700,
    signal,
  );

  if (!result.ok) return result;

  // O modelo pode devolver JSON malformado; nesse caso guarda-se o texto cru
  // como resumo em vez de perder a resposta inteira.
  try {
    const parsed = soulSchema.parse(JSON.parse(stripJsonFence(result.text)));
    return {
      ok: true,
      soul: {
        summary: parsed.summary.slice(0, 600),
        voice: parsed.voice.slice(0, 400),
        mannerisms: parsed.mannerisms.slice(0, 8),
        catchphrases: parsed.catchphrases.slice(0, 8),
        values: parsed.values.slice(0, 8),
      },
    };
  } catch {
    return {
      ok: true,
      soul: {
        summary: result.text.slice(0, 400),
        voice: data.speechNotes.slice(0, 400),
        mannerisms: [],
        catchphrases: [],
        values: data.traits.slice(0, 6),
      },
    };
  }
}
