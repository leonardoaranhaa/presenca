/**
 * Cliente da IA — corre no browser.
 *
 * A chave da API fica no servidor; aqui só há fetch para /api/*.
 * O contrato de retorno é discriminado por `ok` para que a UI nunca
 * tenha de olhar para códigos HTTP.
 */

import type { PersonaPrompt } from "./prompt";

export type ChatTurn = { role: "user" | "presence"; text: string };

export type Soul = {
  summary: string;
  voice: string;
  mannerisms: string[];
  catchphrases: string[];
  values: string[];
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

const OFFLINE =
  "A presença não está disponível agora. A conversa fica guardada e pode tentar de novo.";

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<Ok<T> | Err> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, error: OFFLINE };
  }

  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!res.ok) {
    return { ok: false, error: data?.error ?? OFFLINE };
  }
  if (!data) {
    return { ok: false, error: OFFLINE };
  }
  return { ok: true, ...data };
}

/**
 * O cliente envia os factos da persona, não o systemPrompt.
 *
 * O prompt é composto no servidor (`src/lib/prompt.ts`), para que os limites
 * éticos estejam garantidos em todas as conversas em vez de dependerem de o
 * browser os incluir.
 */
export function chatWithPresence(
  input: {
    persona: PersonaPrompt;
    /** Traços recuperados localmente pelo cérebro mimético para esta fala. */
    retrieved?: string;
    history: ChatTurn[];
    message: string;
  },
  signal?: AbortSignal,
) {
  return postJson<{ text: string }>("/api/chat", input, signal);
}

export function awakenPresence(
  input: {
    name: string;
    relationship: string;
    kind: "living" | "memorial";
    bio: string;
    traits: string[];
    speechNotes: string;
    favorites: string;
    memories: { kind: string; title: string; body: string }[];
    photoDataUrls: string[];
  },
  signal?: AbortSignal,
) {
  return postJson<{ soul: Soul }>("/api/awaken", input, signal);
}
