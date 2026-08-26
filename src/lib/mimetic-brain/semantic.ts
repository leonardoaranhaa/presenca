/**
 * Embeddings semânticos no cliente.
 * Tenta /api/embed; se falhar, devolve null (RAG fica BM25F + lexical).
 */

const cache = new Map<string, number[]>();
const MAX_CACHE = 400;

function cacheKey(text: string) {
  return text.trim().slice(0, 500);
}

export async function embedSemantic(text: string, signal?: AbortSignal): Promise<number[] | null> {
  const key = cacheKey(text);
  if (!key) return null;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: [key] }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { vectors?: number[][] };
    const vec = data.vectors?.[0];
    if (!vec?.length) return null;
    if (cache.size >= MAX_CACHE) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(key, vec);
    return vec;
  } catch {
    return null;
  }
}

export async function embedSemanticBatch(
  texts: string[],
  signal?: AbortSignal,
): Promise<(number[] | null)[]> {
  const cleaned = texts.map((t) => t.trim().slice(0, 500));
  const missing: { i: number; t: string }[] = [];
  const out: (number[] | null)[] = cleaned.map((t, i) => {
    if (!t) return null;
    const c = cache.get(t);
    if (c) return c;
    missing.push({ i, t });
    return null;
  });
  if (!missing.length) return out;

  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: missing.map((m) => m.t) }),
      signal,
    });
    if (!res.ok) return out;
    const data = (await res.json()) as { vectors?: number[][] };
    const vectors = data.vectors ?? [];
    missing.forEach((m, j) => {
      const v = vectors[j];
      if (v?.length) {
        cache.set(m.t, v);
        out[m.i] = v;
      }
    });
  } catch {
    /* keep nulls */
  }
  return out;
}

export function clearSemanticCache() {
  cache.clear();
}
