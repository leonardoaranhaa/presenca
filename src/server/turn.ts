/**
 * Credenciais TURN temporárias (coturn REST / use-auth-secret).
 *
 * coturn:
 *   --use-auth-secret
 *   --static-auth-secret=SEU_SECRET
 *
 * username = unix_expiry
 * password = base64(HMAC-SHA1(secret, username))
 *
 * Env:
 *   TURN_SECRET          — obrigatório para credenciais dinâmicas
 *   TURN_URLS            — turn:host:3478,turns:host:5349
 *   TURN_REALM           — opcional (informativo)
 *   TURN_TTL_SECONDS     — default 3600
 *   TURN_STATIC_USERNAME / TURN_STATIC_CREDENTIAL — fallback legado
 *
 * Só variáveis de servidor: as VITE_* são expostas ao browser e não devem
 * decidir o que o servidor emite.
 */

export type TurnCredentialsResponse = {
  iceServers: RTCIceServer[];
  ttl: number;
  expiresAt: number;
  mode: "ephemeral" | "static" | "stun-only";
};

function env(name: string): string | undefined {
  try {
    return process.env[name] || undefined;
  } catch {
    return undefined;
  }
}

function parseUrls(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  // Node crypto preferido
  try {
    const { createHmac } = await import("node:crypto");
    return createHmac("sha1", secret).update(message).digest("base64");
  } catch {
    // Web Crypto (edge)
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    const bytes = new Uint8Array(sig);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }
}

const STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export async function issueTurnCredentials(): Promise<TurnCredentialsResponse> {
  const urls = parseUrls(env("TURN_URLS"));
  const secret = env("TURN_SECRET");
  const ttl = Math.max(60, Number(env("TURN_TTL_SECONDS") || 3600));
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  if (secret && urls.length) {
    const username = String(expiresAt);
    const credential = await hmacSha1Base64(secret, username);
    return {
      mode: "ephemeral",
      ttl,
      expiresAt,
      iceServers: [
        ...STUN,
        {
          urls: urls.length === 1 ? urls[0]! : urls,
          username,
          credential,
        },
      ],
    };
  }

  const staticUser = env("TURN_STATIC_USERNAME");
  const staticCred = env("TURN_STATIC_CREDENTIAL");
  if (urls.length && staticUser && staticCred) {
    return {
      mode: "static",
      ttl,
      expiresAt,
      iceServers: [
        ...STUN,
        {
          urls: urls.length === 1 ? urls[0]! : urls,
          username: staticUser,
          credential: staticCred,
        },
      ],
    };
  }

  return {
    mode: "stun-only",
    ttl: 0,
    expiresAt: 0,
    iceServers: [...STUN],
  };
}
