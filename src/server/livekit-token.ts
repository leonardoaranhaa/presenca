/**
 * Token de acesso LiveKit (JWT HS256) — sem dependência livekit-server-sdk.
 * Docs: https://docs.livekit.io/home/server/generating-tokens/
 */
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

export async function handleLiveKitToken(request: Request): Promise<Response> {
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
    ttlSec: 6 * 3600,
  });

  return Response.json({
    token,
    url: lkUrl,
    room: safeRoom,
    identity: safeId,
    expiresIn: 6 * 3600,
  });
}
