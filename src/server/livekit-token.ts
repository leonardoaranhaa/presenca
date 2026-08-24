/**
 * Token de acesso LiveKit (JWT HS256) — sem dependência livekit-server-sdk.
 * Docs: https://docs.livekit.io/home/server/generating-tokens/
 */
import { checkRateLimit, clientKey, tooManyRequests } from "./rate-limit";
import { createHmac } from "node:crypto";

export type LiveKitTokenOpts = {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  room: string;
  /** segundos */
  ttlSec?: number;
  canPublish?: boolean;
  canSubscribe?: boolean;
};

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function createLiveKitAccessToken(opts: LiveKitTokenOpts): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.ttlSec ?? 6 * 3600);
  const header = { alg: "HS256", typ: "JWT" };
  const video: Record<string, unknown> = {
    roomJoin: true,
    room: opts.room,
    canPublish: opts.canPublish !== false,
    canSubscribe: opts.canSubscribe !== false,
    canPublishData: true,
  };
  const payload: Record<string, unknown> = {
    iss: opts.apiKey,
    sub: opts.identity,
    nbf: now - 10,
    exp,
    name: opts.name ?? opts.identity,
    video,
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = createHmac("sha256", opts.apiSecret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function getLiveKitEnv(): {
  url: string | null;
  apiKey: string | null;
  apiSecret: string | null;
} {
  const env = typeof process !== "undefined" ? process.env : {};
  return {
    url: env.LIVEKIT_URL?.trim() || env.VITE_LIVEKIT_URL?.trim() || null,
    apiKey: env.LIVEKIT_API_KEY?.trim() || null,
    apiSecret: env.LIVEKIT_API_SECRET?.trim() || null,
  };
}

/**
 * Emite a chave para entrar num lugar em tempo real.
 *
 * **Esta rota entrega acesso, não só custo.** Aceitava `room` e `identity` de
 * query params, sem verificação nenhuma, e devolvia um token com `roomJoin`,
 * `canPublish` e 6 horas de validade. Os nomes de sala vêm dos ids de lugar —
 * `place_casa_oliveira` — que são adivinháveis. Qualquer pessoa podia entrar
 * no lar de uma família com uma identidade inventada e publicar áudio lá
 * dentro.
 *
 * O que se pode fazer sem contas:
 *  - same-origin, como no TURN: fecha o caminho a partir de outro site
 *  - limite de pedidos: trava a enumeração de nomes de sala
 *  - validade curta: uma visita, não um dia de trabalho
 *
 * **Isto é mitigação, não solução.** Sem autenticação não há como saber se
 * quem pede pertence à família — um pedido directo, sem browser, continua a
 * passar. A correcção real exige contas, e está registada como dependência
 * em PLANO.md. Enquanto não existirem, o lar partilhado não deve ser
 * apresentado como privado.
 */
/**
 * Validade do token. Uma visita ao lar dura minutos, não seis horas — e o
 * cliente pede outro quando precisa. Encurtar reduz a janela em que um token
 * que vaze continua a servir.
 */
const TOKEN_TTL_SEC = 30 * 60;

export async function handleLiveKitToken(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Pedidos cross-origin do browser trazem Origin; os do próprio site não.
  const origin = request.headers.get("origin");
  if (origin) {
    const self = new URL(request.url).origin;
    if (origin !== self) {
      return Response.json({ error: "Origem não autorizada" }, { status: 403 });
    }
  }

  const limite = checkRateLimit("livekitToken", clientKey(request));
  if (!limite.allowed) return tooManyRequests("livekitToken", limite);

  const { url: lkUrl, apiKey, apiSecret } = getLiveKitEnv();
  if (!apiKey || !apiSecret) {
    return Response.json(
      {
        error: "LiveKit não configurado",
        hint: "Defina LIVEKIT_API_KEY e LIVEKIT_API_SECRET (e LIVEKIT_URL).",
      },
      { status: 503 },
    );
  }

  const u = new URL(request.url);
  const room = (u.searchParams.get("room") || "").trim();
  const identity = (u.searchParams.get("identity") || "").trim();
  const name = (u.searchParams.get("name") || identity).trim();

  if (!room || !identity) {
    return Response.json({ error: "Parâmetros room e identity são obrigatórios" }, { status: 400 });
  }

  // Sanitizar nomes de sala (LiveKit: alfanumérico, _, -)
  const safeRoom = room.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const safeId = identity.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

  const token = createLiveKitAccessToken({
    apiKey,
    apiSecret,
    identity: safeId,
    name: name.slice(0, 64),
    room: safeRoom,
    ttlSec: TOKEN_TTL_SEC,
  });

  return Response.json({
    token,
    url: lkUrl,
    room: safeRoom,
    identity: safeId,
    expiresIn: TOKEN_TTL_SEC,
  });
}
