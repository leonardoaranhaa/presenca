/**
 * ICE (STUN + TURN) para WebRTC.
 *
 * STUN: descoberta de IP público (já incluído).
 * TURN: retransmite áudio quando NAT/firewall bloqueia P2P.
 *
 * Configuração (por ordem de prioridade):
 * 1. localStorage `presenca_ice`
 * 2. VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL
 * 3. só STUN público
 *
 * Exemplos de fornecedores:
 * - Metered.ca (plano free)
 * - Twilio Network Traversal
 * - coturn self-hosted: turn:seu.dominio:3478
 */

export type IceStoredConfig = {
  /** URLs separadas por vírgula: turn:host:3478,turns:host:5349 */
  turnUrls: string;
  username: string;
  credential: string;
  /** desliga TURN mesmo se configurado */
  enabled: boolean;
};

const STORAGE_KEY = "presenca_ice";

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function loadIceConfig(): IceStoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw)
      return { enabled: true, turnUrls: "", username: "", credential: "", ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  const env = (
    import.meta as unknown as {
      env?: {
        VITE_TURN_URLS?: string;
        VITE_TURN_USERNAME?: string;
        VITE_TURN_CREDENTIAL?: string;
      };
    }
  ).env;
  if (env?.VITE_TURN_URLS) {
    return {
      enabled: true,
      turnUrls: env.VITE_TURN_URLS,
      username: env.VITE_TURN_USERNAME ?? "",
      credential: env.VITE_TURN_CREDENTIAL ?? "",
    };
  }
  return { enabled: false, turnUrls: "", username: "", credential: "" };
}

export function saveIceConfig(cfg: IceStoredConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function buildIceServers(cfg?: IceStoredConfig): RTCIceServer[] {
  const c = cfg ?? (typeof window !== "undefined" ? loadIceConfig() : null);
  const servers: RTCIceServer[] = [...DEFAULT_STUN];
  if (!c?.enabled || !c.turnUrls.trim()) return servers;

  const urls = c.turnUrls
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return servers;

  const turn: RTCIceServer = {
    urls: urls.length === 1 ? urls[0]! : urls,
  };
  if (c.username) turn.username = c.username;
  if (c.credential) turn.credential = c.credential;
  servers.push(turn);
  return servers;
}

/** Diagnóstico simples no console. */
export function logIceConfig() {
  const cfg = loadIceConfig();
  const servers = buildIceServers(cfg);
  console.info("[presenca ice]", {
    turnEnabled: cfg.enabled && !!cfg.turnUrls,
    serverCount: servers.length,
    urls: servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls])),
  });
}

export const TURN_SETUP_DOC = `
TURN — guia rápido
──────────────────
1) Self-host (coturn):
   docker run -d --network=host instrumentisto/coturn \\
     -n --log-file=stdout \\
     --external-ip=$(curl -4 ifconfig.me) \\
     --user=presenca:senha_forte \\
     --realm=presenca.local

   URLs: turn:SEU_IP:3478
   user / credential: presenca / senha_forte

2) Metered.ca (free tier):
   Dashboard → TURN → copiar URLs + user/credential

3) Env no Vite:
   VITE_TURN_URLS=turn:host:3478,turns:host:5349
   VITE_TURN_USERNAME=...
   VITE_TURN_CREDENTIAL=...

4) App → Lugares → Interconexão → secção TURN → Guardar

Sem TURN: STUN Google ainda funciona em muitos NATs caseiros.
Com TURN: redes móveis / corporativas passam a conectar.
`;

export type ApiTurnResponse = {
  iceServers: RTCIceServer[];
  ttl: number;
  expiresAt: number;
  mode: "ephemeral" | "static" | "stun-only";
};

let cachedApi: { servers: RTCIceServer[]; expiresAtMs: number } | null = null;

/**
 * Obtém ICE servers: API (credenciais temporárias) → cache → localStorage/env → STUN.
 */
export async function resolveIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cachedApi && cachedApi.expiresAtMs > now + 30_000) {
    return cachedApi.servers;
  }

  try {
    const res = await fetch("/api/turn/credentials", { method: "GET", cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ApiTurnResponse;
      if (data.iceServers?.length) {
        const ttlMs = (data.ttl || 3600) * 1000;
        cachedApi = {
          servers: data.iceServers,
          expiresAtMs: now + Math.min(ttlMs, 50 * 60 * 1000),
        };
        return data.iceServers;
      }
    }
  } catch {
    /* API indisponível — fallback local */
  }

  // Merge local TURN on top of STUN if user configured UI
  return buildIceServers();
}

export function clearIceCache() {
  cachedApi = null;
}
