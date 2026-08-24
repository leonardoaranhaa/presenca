/**
 * Cliente SFU (Selective Forwarding Unit) para voz quando a malha WebRTC
 * deixa de escalar (≥ MAX_PEERS_SOFT).
 *
 * Produção: LiveKit / mediasoup / Cloudflare Calls.
 * Aqui: um único RTCPeerConnection para o endpoint SFU (sinalização JSON
 * via WebSocket do próprio SFU ou fallback no transporte PartyKit).
 *
 * Contrato mínimo do SFU (WebSocket):
 *   → { type: "join", room, peerId, displayName }
 *   ← { type: "offer", sdp } | { type: "answer", sdp } | { type: "ice", candidate }
 *   → { type: "answer"|"offer"|"ice", ... }
 *   ← { type: "ready" }
 */
import { resolveIceServers } from "./ice-config";

export type SfuClientState = {
  active: boolean;
  connected: boolean;
  error: string | null;
  topology: "sfu";
};

type Listener = (s: SfuClientState) => void;

export class SfuVoiceClient {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private active = false;
  private connected = false;
  private error: string | null = null;
  private listeners = new Set<Listener>();
  private selfId = "";
  private room = "";

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

  snapshot(): SfuClientState {
    return {
      active: this.active,
      connected: this.connected,
      error: this.error,
      topology: "sfu",
    };
  }

  async start(opts: {
    sfuUrl: string;
    selfId: string;
    room: string;
    displayName: string;
    localStream: MediaStream;
  }) {
    await this.stop();
    this.selfId = opts.selfId;
    this.room = opts.room;
    this.localStream = opts.localStream;
    this.error = null;
    this.active = true;
    this.emit();

    try {
      this.ws = new WebSocket(opts.sfuUrl);
    } catch (e) {
      this.error = e instanceof Error ? e.message : "SFU URL inválida";
      this.active = false;
      this.emit();
      return;
    }

    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({
          type: "join",
          room: opts.room,
          peerId: opts.selfId,
          displayName: opts.displayName,
        }),
      );
    };

    this.ws.onmessage = (ev) => {
      void this.onMessage(String(ev.data));
    };

    this.ws.onerror = () => {
      this.error = "Erro de ligação ao SFU.";
      this.emit();
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit();
    };
  }

  private async onMessage(raw: string) {
    let msg: {
      type?: string;
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "ready") {
      this.connected = true;
      this.emit();
      return;
    }

    if (msg.type === "offer" && msg.sdp) {
      await this.ensurePc();
      const pc = this.pc!;
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.ws?.send(JSON.stringify({ type: "answer", sdp: pc.localDescription }));
      this.connected = true;
      this.emit();
      return;
    }

    if (msg.type === "answer" && msg.sdp && this.pc) {
      await this.pc.setRemoteDescription(msg.sdp);
      this.connected = true;
      this.emit();
      return;
    }

    if (msg.type === "ice" && msg.candidate && this.pc) {
      try {
        await this.pc.addIceCandidate(msg.candidate);
      } catch {
        /* ignore */
      }
    }
  }

  private async ensurePc() {
    if (this.pc) return;
    const iceServers = await resolveIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.ws?.send(
        JSON.stringify({ type: "ice", candidate: ev.candidate.toJSON(), peerId: this.selfId }),
      );
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
        this.remoteAudio.autoplay = true;
        this.remoteAudio.setAttribute("playsinline", "true");
      }
      this.remoteAudio.srcObject = stream;
      void this.remoteAudio.play().catch(() => {});
    };

    // Cliente oferece se o SFU não enviar offer em 1.5s
    window.setTimeout(async () => {
      if (!this.pc || this.pc.remoteDescription) return;
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.ws?.send(JSON.stringify({ type: "offer", sdp: this.pc.localDescription }));
      } catch {
        /* ignore */
      }
    }, 1500);
  }

  setMuted(muted: boolean) {
    if (!this.localStream) return;
    for (const t of this.localStream.getAudioTracks()) t.enabled = !muted;
  }

  async stop() {
    try {
      this.ws?.send(JSON.stringify({ type: "leave", peerId: this.selfId, room: this.room }));
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.pc?.close();
    this.pc = null;
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    this.localStream = null;
    this.active = false;
    this.connected = false;
    this.emit();
  }
}

let sfuSingleton: SfuVoiceClient | null = null;
export function getSfuVoiceClient() {
  if (!sfuSingleton) sfuSingleton = new SfuVoiceClient();
  return sfuSingleton;
}
