/**
 * Limite de pedidos para as rotas que custam dinheiro.
 *
 * As quatro rotas de IA e voz gastam a quota de quem hospeda a cada chamada, e
 * não há autenticação: sem limite, um script esgota o saldo em minutos. Esta é
 * a defesa mínima enquanto não existirem contas.
 *
 * Janela deslizante em memória. Escolha deliberada, com as limitações
 * assumidas:
 *
 *  - **Não sobrevive a reinícios** e **não é partilhado entre instâncias.** Em
 *    serverless, cada instância tem o seu contador, portanto o limite real é
 *    `limite × instâncias`. Trava o abuso trivial, não um atacante decidido.
 *  - Quando houver contas, o limite deve passar a ser por utilizador e ficar
 *    num armazenamento partilhado (Redis/Upstash).
 *
 * Não usa dependências novas de propósito: o custo de operar Redis hoje não se
 * justifica para o tamanho do problema.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Pedidos ainda disponíveis na janela. */
  remaining: number;
  /** Segundos até a janela reabrir (só quando bloqueado). */
  retryAfter: number;
};

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/** Impede o mapa de crescer sem limite com IPs que nunca voltam. */
const MAX_BUCKETS = 10_000;

export type RateLimitRule = {
  /** Pedidos permitidos por janela. */
  limit: number;
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
};

/**
 * Limites por rota. `awaken` e `clone` são mais caros e mais raros:
 * uma família desperta uma presença uma vez, não vinte por minuto.
 */
export const RATE_LIMITS = {
  avatar: { limit: 20, windowMs: 60_000 },
  chat: { limit: 20, windowMs: 60_000 },
  awaken: { limit: 5, windowMs: 10 * 60_000 },
  tts: { limit: 30, windowMs: 60_000 },
  voiceClone: { limit: 3, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Identifica o autor do pedido.
 *
 * Atrás de um proxy (Vercel, Cloudflare) o IP real vem em cabeçalhos. Não são
 * de confiança absoluta — quem chama diretamente pode forjá-los — mas são o
 * melhor sinal disponível sem contas, e o suficiente para travar abuso trivial.
 */
export function clientKey(req: Request): string {
  const h = req.headers;
  const ip =
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("cf-connecting-ip") ||
    "desconhecido";
  return ip;
}

export function checkRateLimit(
  name: RateLimitName,
  key: string,
  now = Date.now(),
): RateLimitResult {
  const rule = RATE_LIMITS[name];
  const id = `${name}:${key}`;

  if (buckets.size > MAX_BUCKETS) pruneOldest(now);

  let bucket = buckets.get(id);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(id, bucket);
  }

  const inicio = now - rule.windowMs;
  bucket.hits = bucket.hits.filter((t) => t > inicio);

  if (bucket.hits.length >= rule.limit) {
    const maisAntigo = bucket.hits[0]!;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((maisAntigo + rule.windowMs - now) / 1000)),
    };
  }

  bucket.hits.push(now);
  return { allowed: true, remaining: rule.limit - bucket.hits.length, retryAfter: 0 };
}

/** Resposta 429 com os cabeçalhos que um cliente educado sabe ler. */
export function tooManyRequests(name: RateLimitName, r: RateLimitResult): Response {
  return Response.json(
    {
      error:
        "Demasiados pedidos em pouco tempo. A presença precisa de um instante — tente daqui a pouco.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(r.retryAfter),
        "RateLimit-Limit": String(RATE_LIMITS[name].limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(r.retryAfter),
      },
    },
  );
}

function pruneOldest(now: number) {
  for (const [id, b] of buckets) {
    if (!b.hits.length || now - b.hits[b.hits.length - 1]! > 60 * 60_000) {
      buckets.delete(id);
    }
  }
  // Se ainda estiver cheio, limpa tudo: perder contadores é preferível a
  // consumir memória sem limite.
  if (buckets.size > MAX_BUCKETS) buckets.clear();
}

/** Só para testes: limpa o estado entre casos. */
export function resetRateLimits() {
  buckets.clear();
}
