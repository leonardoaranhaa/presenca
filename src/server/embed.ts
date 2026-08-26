/**
 * Embeddings semânticos — servidor.
 *
 * Env (por ordem):
 *   EMBEDDING_API_URL + EMBEDDING_API_KEY + EMBEDDING_MODEL
 *   fallback: XAI_API_KEY → https://api.x.ai/v1/embeddings (se o fornecedor expuser)
 *
 * Sem config: devolve null e o cliente fica só com BM25F + lexical.
 */

export type EmbedResult =
  | { ok: true; vectors: number[][]; model: string; dim: number }
  | { ok: false; error: string; status?: number };

function embeddingConfig() {
  const url =
    process.env.EMBEDDING_API_URL ||
    (process.env.XAI_API_KEY ? "https://api.x.ai/v1/embeddings" : undefined);
  const key = process.env.EMBEDDING_API_KEY || process.env.XAI_API_KEY;
  const model =
    process.env.EMBEDDING_MODEL || process.env.XAI_EMBEDDING_MODEL || "text-embedding-3-small";
  return { url, key, model };
}

export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<EmbedResult> {
  const cleaned = texts.map((t) => t.trim().slice(0, 8000)).filter(Boolean);
  if (!cleaned.length) {
    return { ok: false, error: "Nenhum texto para embedding.", status: 400 };
  }

  const { url, key, model } = embeddingConfig();
  if (!url || !key) {
    return {
      ok: false,
      error: "Embeddings semânticos não configurados (EMBEDDING_* ou XAI_API_KEY).",
      status: 503,
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        input: cleaned.length === 1 ? cleaned[0] : cleaned,
      }),
      signal,
    });
  } catch {
    return { ok: false, error: "Falha de rede no serviço de embeddings.", status: 502 };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[presenca:embed]", res.status, detail.slice(0, 300));
    return {
      ok: false,
      error: `Embeddings indisponíveis (${res.status}).`,
      status: res.status === 429 ? 429 : 502,
    };
  }

  const body = (await res.json().catch(() => null)) as {
    data?: { embedding?: number[]; index?: number }[];
    model?: string;
  } | null;

  const data = body?.data;
  if (!data?.length) {
    return { ok: false, error: "Resposta de embedding vazia.", status: 502 };
  }

  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = ordered.map((d) => d.embedding ?? []);
  if (vectors.some((v) => !v.length)) {
    return { ok: false, error: "Vetor de embedding inválido.", status: 502 };
  }

  return {
    ok: true,
    vectors,
    model: body?.model || model,
    dim: vectors[0]!.length,
  };
}
