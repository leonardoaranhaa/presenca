/**
 * Interconexão em tempo real.
 *
 * - local: BroadcastChannel (mesmas abas / mesmo browser)
 * - partykit: WebSocket nativo → wss://HOST/parties/presenca/ROOM
 * - ws: WebSocket genérico (mesmo protocolo JSON)
 *
 * Party server: party/presenca.ts + partykit.json
 */

export type PeerPose = {
  peerId: string;
  displayName: string;
  placeId: string;
  x: number;
  z: number;
  yaw: number;
  personaId?: string;
  /** URL pública opcional do corpo digital */
  bodyGlbUrl?: string;
  updatedAt: number;
};

export type VoiceSignalPayload =
  | {
      kind: "voice-join";
      peerId: string;
      displayName: string;
      placeId: string;
    }
  | {
      kind: "voice-leave";
      peerId: string;
      placeId: string;
    }
  | {
      kind: "voice-offer";
      from: string;
      to: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      kind: "voice-answer";
      from: string;
      to: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      kind: "voice-ice";
      from: string;
      to: string;
      candidate: RTCIceCandidateInit;
    };

export type RealtimeMessage =
  | { type: "pose"; payload: PeerPose }
  | { type: "chat"; payload: { peerId: string; text: string; at: number } }
  | { type: "leave"; payload: { peerId: string; placeId: string } }
  | { type: "join"; payload: PeerPose }
  | { type: "sync"; payload: { peers: PeerPose[] } }
  | { type: "voice"; payload: VoiceSignalPayload };

type Handler = (msg: RealtimeMessage) => void;

export interface RealtimeTransport {
  connect(placeId: string, self: PeerPose): void;
  disconnect(): void;
  send(msg: RealtimeMessage): void;
  onMessage(fn: Handler): () => void;
  listPeers(): PeerPose[];
  readonly status: "disconnected" | "connecting" | "connected" | "error";
}

export type RealtimeConfig = {
  provider: "local" | "partykit" | "ws";
  /** ex: my-project.username.partykit.dev */
  host?: string;
  /** path party name — default presenca */
  party?: string;
  /** WebSocket URL completa (provider ws) */
  wsUrl?: string;
};

const STORAGE_KEY = "presenca_realtime";

export function loadRealtimeConfig(): RealtimeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { provider: "local", ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  const envHost =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: { VITE_PARTYKIT_HOST?: string } }).env
          ?.VITE_PARTYKIT_HOST
      : undefined;
  if (envHost) return { provider: "partykit", host: envHost, party: "presenca" };
  return { provider: "local" };
}

export function saveRealtimeConfig(cfg: RealtimeConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function createHandlerSet() {
  const handlers = new Set<Handler>();
  return {
    handlers,
    emit(msg: RealtimeMessage) {
      for (const h of handlers) h(msg);
    },
    onMessage(fn: Handler) {
      handlers.add(fn);
      return () => handlers.delete(fn);
    },
  };
}

/** Transporte local: abas do mesmo browser. */
export function createLocalTransport(): RealtimeTransport {
  let channel: BroadcastChannel | null = null;
  let placeId = "";
  let selfId = "";
  const peers = new Map<string, PeerPose>();
  const { emit, onMessage } = createHandlerSet();
  let status: RealtimeTransport["status"] = "disconnected";

  return {
    get status() {
      return status;
    },
    connect(pid, self) {
      placeId = pid;
      selfId = self.peerId;
      peers.clear();
      channel?.close();
      if (typeof BroadcastChannel === "undefined") {
        status = "error";
        return;
      }
      status = "connected";
      channel = new BroadcastChannel(`presenca-place:${pid}`);
      channel.onmessage = (ev: MessageEvent<RealtimeMessage>) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === "pose" || msg.type === "join") {
          if (msg.payload.peerId === selfId) return;
          peers.set(msg.payload.peerId, msg.payload);
        }
        if (msg.type === "leave") peers.delete(msg.payload.peerId);
        if (msg.type === "sync") {
          peers.clear();
          for (const p of msg.payload.peers) {
            if (p.peerId !== selfId) peers.set(p.peerId, p);
          }
        }
        emit(msg);
      };
      channel.postMessage({ type: "join", payload: self } satisfies RealtimeMessage);
    },
    disconnect() {
      if (channel && selfId) {
        channel.postMessage({
          type: "leave",
          payload: { peerId: selfId, placeId },
        } satisfies RealtimeMessage);
      }
      channel?.close();
      channel = null;
      peers.clear();
      status = "disconnected";
    },
    send(msg) {
      channel?.postMessage(msg);
      if (msg.type === "pose" || msg.type === "join") {
        peers.set(msg.payload.peerId, msg.payload);
      }
    },
    onMessage,
    listPeers() {
      return [...peers.values()].filter((p) => p.peerId !== selfId);
    },
  };
}

/**
 * WebSocket / PartyKit.
 * PartyKit URL: wss://{host}/parties/{party}/{room}
 */
export function createSocketTransport(wsUrlBuilder: (room: string) => string): RealtimeTransport {
  let ws: WebSocket | null = null;
  let placeId = "";
  let selfId = "";
  let selfPose: PeerPose | null = null;
  const peers = new Map<string, PeerPose>();
  const { emit, onMessage } = createHandlerSet();
  let status: RealtimeTransport["status"] = "disconnected";
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function handlePayload(raw: string) {
    let msg: RealtimeMessage;
    try {
      msg = JSON.parse(raw) as RealtimeMessage;
    } catch {
      return;
    }
    if (msg.type === "pose" || msg.type === "join") {
      if (msg.payload.peerId === selfId) return;
      peers.set(msg.payload.peerId, msg.payload);
    } else if (msg.type === "leave") {
      peers.delete(msg.payload.peerId);
    } else if (msg.type === "sync") {
      peers.clear();
      for (const p of msg.payload.peers) {
        if (p.peerId !== selfId) peers.set(p.peerId, p);
      }
    }
    emit(msg);
  }

  return {
    get status() {
      return status;
    },
    connect(pid, self) {
      placeId = pid;
      selfId = self.peerId;
      selfPose = self;
      peers.clear();
      ws?.close();
      status = "connecting";
      const url = wsUrlBuilder(pid);
      try {
        ws = new WebSocket(url);
      } catch {
        status = "error";
        console.warn("[presenca] WebSocket falhou, URL:", url);
        return;
      }
      ws.onopen = () => {
        status = "connected";
        ws?.send(JSON.stringify({ type: "join", payload: self } satisfies RealtimeMessage));
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN && selfPose) {
            ws.send(
              JSON.stringify({
                type: "pose",
                payload: { ...selfPose, updatedAt: Date.now() },
              } satisfies RealtimeMessage),
            );
          }
        }, 2000);
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") handlePayload(ev.data);
      };
      ws.onerror = () => {
        status = "error";
      };
      ws.onclose = () => {
        status = "disconnected";
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
      };
    },
    disconnect() {
      if (ws?.readyState === WebSocket.OPEN && selfId) {
        ws.send(
          JSON.stringify({
            type: "leave",
            payload: { peerId: selfId, placeId },
          } satisfies RealtimeMessage),
        );
      }
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      ws?.close();
      ws = null;
      peers.clear();
      status = "disconnected";
    },
    send(msg) {
      if (msg.type === "pose") selfPose = msg.payload;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    onMessage,
    listPeers() {
      const now = Date.now();
      return [...peers.values()].filter(
        (p) => p.peerId !== selfId && now - p.updatedAt < 15000,
      );
    },
  };
}

export function createPartyTransport(host: string, party = "presenca"): RealtimeTransport {
  const clean = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return createSocketTransport(
    (room) =>
      `${location.protocol === "https:" ? "wss" : "ws"}://${clean}/parties/${party}/${encodeURIComponent(room)}`,
  );
}

export function createWsTransport(baseUrl: string): RealtimeTransport {
  const base = baseUrl.replace(/\/$/, "");
  return createSocketTransport((room) => {
    const sep = base.includes("?") ? "&" : base.endsWith("/room") ? "/" : "/";
    if (base.includes("{room}")) return base.replace("{room}", encodeURIComponent(room));
    return `${base}${sep}${encodeURIComponent(room)}`;
  });
}

export function createRealtime(opts?: RealtimeConfig): RealtimeTransport {
  const cfg = opts ?? loadRealtimeConfig();
  if (cfg.provider === "partykit" && cfg.host) {
    return createPartyTransport(cfg.host, cfg.party || "presenca");
  }
  if (cfg.provider === "ws" && cfg.wsUrl) {
    return createWsTransport(cfg.wsUrl);
  }
  return createLocalTransport();
}
