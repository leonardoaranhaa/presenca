/**
 * Server-side AI helpers for Presença.
 * Em ambientes TanStack Start, use createServerFn.
 * Aqui fica a lógica pura para você adaptar ao seu backend.
 */

type ChatTurn = { role: "user" | "presence"; text: string };

export type ChatInput = {
  name: string;
  systemPrompt: string;
  history: ChatTurn[];
  message: string;
};

export type AwakenInput = {
  name: string;
  relationship: string;
  kind: "living" | "memorial";
  bio: string;
  traits: string[];
  speechNotes: string;
  favorites: string;
  memories: { kind: string; title: string; body: string }[];
  photoDataUrls: string[];
};

async function grokChat(
  messages: { role: "system" | "user" | "assistant"; content: unknown }[],
  maxTokens: number,
) {
  const apiKey = typeof process !== "undefined" ? process.env.XAI_API_KEY : undefined;
  if (!apiKey) {
    return {
      ok: false as const,
      error: "A voz da presença não está disponível neste ambiente.",
    };
  }

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    return {
      ok: false as const,
      error: `A presença hesitou (${res.status}). Tente de novo em instantes.`,
    };
  }
  const body = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return { ok: true as const, text: body.choices[0]?.message.content?.trim() ?? "" };
}

export async function chatWithPresence(data: ChatInput) {
  const message = data.message.trim().slice(0, 2000);
  if (!message) return { ok: false as const, error: "Escreva algo para dizer." };
  const history = data.history.slice(-12).map((t) => ({
    role: t.role === "presence" ? ("assistant" as const) : ("user" as const),
    content: t.text.slice(0, 2000),
  }));
  return grokChat(
    [
      { role: "system", content: data.systemPrompt.slice(0, 12000) },
      ...history,
      { role: "user", content: message },
    ],
    350,
  );
}

export async function awakenPresence(data: AwakenInput) {
  const photos = data.photoDataUrls.slice(0, 3);
  const memoryText = data.memories
    .slice(0, 20)
    .map((m) => `- (${m.kind}) ${m.title}: ${m.body}`)
    .join("\n");

  const instruction = `Analise as memórias de ${data.name} (${data.relationship}, ${data.kind === "memorial" ? "pessoa falecida, reconstrução memorial" : "persona viva"}).
Extraia um perfil fiel, sem inventar fatos que não estejam no material.
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

  const content: unknown[] = [{ type: "text", text: instruction }];
  for (const url of photos) {
    if (url.startsWith("data:image")) {
      content.push({ type: "image_url", image_url: { url } });
    }
  }

  const result = await grokChat(
    [
      {
        role: "system",
        content:
          "Você é um arquivista cuidadoso de memórias familiares. Nunca inventa biografia. JSON puro.",
      },
      { role: "user", content: photos.length ? content : instruction },
    ],
    700,
  );

  if (!result.ok) return result;

  try {
    const jsonText = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(jsonText) as {
      summary?: string;
      voice?: string;
      mannerisms?: string[];
      catchphrases?: string[];
      values?: string[];
    };
    return {
      ok: true as const,
      soul: {
        summary: String(parsed.summary ?? "").slice(0, 600),
        voice: String(parsed.voice ?? "").slice(0, 400),
        mannerisms: (parsed.mannerisms ?? []).map(String).slice(0, 8),
        catchphrases: (parsed.catchphrases ?? []).map(String).slice(0, 8),
        values: (parsed.values ?? []).map(String).slice(0, 8),
      },
    };
  } catch {
    return {
      ok: true as const,
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
