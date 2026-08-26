/**
 * Voz via LiveKit SFU (produção) + active speaker.
 *
 * Requer: npm i livekit-client
 * Servidor: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 * Token: GET /api/livekit/token
 */

export type LiveKitSfuState = {
  active: boolean;
  connected: boolean;
  error: string | null;
  topology: "sfu";
  provider: "livekit";
  remoteCount: number;
  /** identities dos speakers activos (ordenados por nível) */
  activeSpeakers: string[];
};

type Listener = (s: LiveKitSfuState) => void;

type LiveKitRoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void> | void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  localParticipant: {
    setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>;
    publishTrack?: (track: MediaStreamTrack, opts?: unknown) => Promise<unknown>;
  };
  remoteParticipants: Map<string, unknown>;
};

type RemoteAudio = {
  el: HTMLAudioElement;
  identity: string;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer> | null;
};

/** Quantos remotos mantêm volume pleno; restantes atenuados. */
const MAX_FULL_VOLUME_SPEAKERS = 3;
const QUIET_VOLUME = 0.12;
const FULL_VOLUME = 1;

export class LiveKitSfuClient {
  private room: LiveKitRoomLike | null = null;
  private localStream: MediaStream | null = null;
  private remotes = new Map<string, RemoteAudio>();
  private active = false;
  private connected = false;
  private error: string | null = null;
  private remoteCount = 0;
  private activeSpeakers: string[] = [];
  private listeners = new Set<Listener>();
  private muted = false;
  private audioCtx: AudioContext | null = null;
  private levelTimer: number | null = null;
  private preferIdentities: string[] = [];

  onChange(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  snapshot(): LiveKitSfuState {
    return {
      active: this.active,
      connected: this.connected,
      error: this.error,
      topology: "sfu",
      provider: "livekit",
      remoteCount: this.remoteCount,
      activeSpeakers: [...this.activeSpeakers],
    };
  }

  async start(opts: {
    livekitUrl?: string;
    selfId: string;
    room: string;
    displayName: string;
    localStream: MediaStream;
  }) {
    await this.stop();
    this.localStream = opts.localStream;
    this.error = null;
    this.active = true;
    this.emit();

    let RoomCtor: new () => LiveKitRoomLike;
    let RoomEvent: Record<string, string>;
    let Track: { Kind: { Audio: string } };
    try {
      const mod = await import("livekit-client");
      RoomCtor = mod.Room as unknown as new () => LiveKitRoomLike;
      RoomEvent = mod.RoomEvent as unknown as Record<string, string>;
      Track = mod.Track as unknown as { Kind: { Audio: string } };
    } catch {
      this.error = "Pacote livekit-client em falta. Execute: npm i livekit-client";
      this.active = false;
      this.emit();
      return;
    }

    let token: string;
    let url = opts.livekitUrl?.trim() || "";
    try {
      const q = new URLSearchParams({
        room: opts.room,
        identity: opts.selfId,
        name: opts.displayName,
      });
      const res = await fetch(`/api/livekit/token?${q}`);
      const data = (await res.json()) as {
        token?: string;
        url?: string | null;
        error?: string;
        hint?: string;
      };
      if (!res.ok || !data.token) {
        this.error = data.error || data.hint || `Token LiveKit HTTP ${res.status}`;
        this.active = false;
        this.emit();
        return;
      }
      token = data.token;
      if (!url && data.url) url = data.url;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Falha ao obter token LiveKit";
      this.active = false;
      this.emit();
      return;
    }

    if (!url) {
      this.error = "LIVEKIT_URL em falta (servidor) ou livekitUrl na config do cliente.";
      this.active = false;
      this.emit();
      return;
    }

    const room = new RoomCtor();
    this.room = room;

    room.on(RoomEvent.Connected ?? "connected", () => {
      this.connected = true;
      this.error = null;
      this.emit();
    });
    room.on(RoomEvent.Disconnected ?? "disconnected", () => {
      this.connected = false;
      this.emit();
    });

    // ActiveSpeakersChanged (LiveKit nativo)
    const asEvent = RoomEvent.ActiveSpeakersChanged ?? "activeSpeakersChanged";
    room.on(asEvent, (...args: unknown[]) => {
      const list = args[0] as { identity?: string }[] | undefined;
      if (Array.isArray(list)) {
        this.preferIdentities = list.map((p) => p.identity).filter((id): id is string => !!id);
        this.applyActiveSpeakerVolumes();
        this.activeSpeakers = this.preferIdentities.slice(0, MAX_FULL_VOLUME_SPEAKERS);
        this.emit();
      }
    });

    room.on(RoomEvent.TrackSubscribed ?? "trackSubscribed", (...args: unknown[]) => {
      const track = args[0] as {
        kind?: string;
        attach?: () => HTMLMediaElement;
        sid?: string;
      };
      const participant = args[2] as { identity?: string } | undefined;
      if (track?.kind !== (Track?.Kind?.Audio ?? "audio")) return;
      const el = (track.attach?.() ?? document.createElement("audio")) as HTMLAudioElement;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      void el.play().catch(() => {});
      const id = participant?.identity ?? track.sid ?? `r-${this.remotes.size}`;
      const remote: RemoteAudio = {
        el,
        identity: id,
        analyser: null,
        data: null,
      };
      this.wireAnalyser(remote);
      this.remotes.set(id, remote);
      this.remoteCount = this.remotes.size;
      this.applyActiveSpeakerVolumes();
      this.emit();
    });

    room.on(RoomEvent.TrackUnsubscribed ?? "trackUnsubscribed", (...args: unknown[]) => {
      const track = args[0] as { sid?: string; detach?: () => void };
      const participant = args[2] as { identity?: string } | undefined;
      track?.detach?.();
      const id = participant?.identity;
      if (id && this.remotes.has(id)) {
        const r = this.remotes.get(id)!;
        r.el.srcObject = null;
        this.remotes.delete(id);
      }
      this.remoteCount = this.remotes.size;
      this.applyActiveSpeakerVolumes();
      this.emit();
    });

    try {
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(!this.muted);
      const mic = opts.localStream.getAudioTracks()[0];
      if (mic && typeof room.localParticipant.publishTrack === "function") {
        try {
          await room.localParticipant.publishTrack(mic);
        } catch {
          /* setMicrophoneEnabled pode bastar */
        }
      }
      this.connected = true;
      this.startLevelLoop();
      this.emit();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Falha ao ligar LiveKit";
      this.active = false;
      this.connected = false;
      this.emit();
    }
  }

  private ensureAudioCtx() {
    if (this.audioCtx) return this.audioCtx;
    try {
      this.audioCtx = new AudioContext();
    } catch {
      return null;
    }
    return this.audioCtx;
  }

  private wireAnalyser(remote: RemoteAudio) {
    const ctx = this.ensureAudioCtx();
    if (!ctx || !remote.el) return;
    try {
      const src = ctx.createMediaElementSource(remote.el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      remote.analyser = analyser;
      remote.data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      /* MediaElementSource só uma vez por element — ignore */
    }
  }

  private levelOf(remote: RemoteAudio): number {
    if (!remote.analyser || !remote.data) return 0;
    remote.analyser.getByteFrequencyData(remote.data);
    let sum = 0;
    for (let i = 0; i < remote.data.length; i++) sum += remote.data[i]!;
    return sum / (remote.data.length * 255);
  }

  private applyActiveSpeakerVolumes() {
    const entries = [...this.remotes.entries()];
    if (entries.length <= MAX_FULL_VOLUME_SPEAKERS) {
      for (const [, r] of entries) r.el.volume = FULL_VOLUME;
      this.activeSpeakers = entries.map(([id]) => id);
      return;
    }

    // Preferir lista LiveKit; senão ranking por analyser
    let ranked: string[];
    if (this.preferIdentities.length) {
      const set = new Set(this.preferIdentities);
      const preferred = this.preferIdentities.filter((id) => this.remotes.has(id));
      const rest = entries.map(([id]) => id).filter((id) => !set.has(id));
      ranked = [...preferred, ...rest];
    } else {
      ranked = entries
        .map(([id, r]) => ({ id, level: this.levelOf(r) }))
        .sort((a, b) => b.level - a.level)
        .map((x) => x.id);
    }

    const loud = new Set(ranked.slice(0, MAX_FULL_VOLUME_SPEAKERS));
    for (const [id, r] of entries) {
      r.el.volume = loud.has(id) ? FULL_VOLUME : QUIET_VOLUME;
    }
    this.activeSpeakers = ranked.slice(0, MAX_FULL_VOLUME_SPEAKERS);
  }

  private startLevelLoop() {
    this.stopLevelLoop();
    const tick = () => {
      if (!this.active) return;
      if (!this.preferIdentities.length) {
        this.applyActiveSpeakerVolumes();
        this.emit();
      }
      this.levelTimer = window.setTimeout(tick, 250);
    };
    this.levelTimer = window.setTimeout(tick, 250);
  }

  private stopLevelLoop() {
    if (this.levelTimer != null) {
      clearTimeout(this.levelTimer);
      this.levelTimer = null;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.localStream) {
      for (const t of this.localStream.getAudioTracks()) t.enabled = !muted;
    }
    void this.room?.localParticipant.setMicrophoneEnabled(!muted);
  }

  async stop() {
    this.stopLevelLoop();
    try {
      await this.room?.disconnect();
    } catch {
      /* ignore */
    }
    this.room = null;
    for (const r of this.remotes.values()) {
      r.el.srcObject = null;
      r.el.remove();
    }
    this.remotes.clear();
    try {
      await this.audioCtx?.close();
    } catch {
      /* ignore */
    }
    this.audioCtx = null;
    this.localStream = null;
    this.active = false;
    this.connected = false;
    this.remoteCount = 0;
    this.activeSpeakers = [];
    this.preferIdentities = [];
    this.emit();
  }
}

let lkSingleton: LiveKitSfuClient | null = null;
export function getLiveKitSfuClient() {
  if (!lkSingleton) lkSingleton = new LiveKitSfuClient();
  return lkSingleton;
}

export function isLiveKitConfigured(sfuUrl?: string | null, livekitUrl?: string | null): boolean {
  const u = (livekitUrl || sfuUrl || "").toLowerCase();
  if (!u) return false;
  return (
    u.includes("livekit") ||
    u.includes("lk.cloud") ||
    u.startsWith("wss://") ||
    u.startsWith("ws://")
  );
}
