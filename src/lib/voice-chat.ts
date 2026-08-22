/**
 * Voz em tempo real (WebRTC mesh) no mesmo lugar.
 * Sinalização via RealtimeTransport (local / PartyKit / ws).
 *
 * Fluxo: join voice → getUserMedia → oferta/resposta/ICE com cada peer.
 * Áudio espacial simples: volume por distância XZ (opcional).
 */

import type {
  PeerPose,
  RealtimeMessage,
  RealtimeTransport,
  VoiceSignalPayload,
} from "./realtime";
import { resolveIceServers } from "./ice-config";



type PeerLink = {
  pc: RTCPeerConnection;
  audio?: HTMLAudioElement;
  makingOffer: boolean;
  polite: boolean;
};

export type VoiceChatState = {
  active: boolean;
  muted: boolean;
  deafened: boolean;
  error: string | null;
  remotePeerIds: string[];
};

type Listener = (s: VoiceChatState) => void;

export class VoiceChat {
  private transport: RealtimeTransport | null = null;
  private selfId = "";
  private placeId = "";
  private displayName = "";
  private localStream: MediaStream | null = null;
  private peers = new Map<string, PeerLink>();
  private unsub: (() => void) | null = null;
  private muted = false;
  private deafened = false;
  private active = false;
  private error: string | null = null;
  private listeners = new Set<Listener>();
  /** posições para atenuação espacial */
  private selfPos = { x: 0, z: 0 };
  private peerPos = new Map<string, { x: number; z: number }>();
  private spatial = true;

  constructor(private getTransport: () => RealtimeTransport | null) {}

  onChange(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  snapshot(): VoiceChatState {
    return {
      active: this.active,
      muted: this.muted,
      deafened: this.deafened,
      error: this.error,
      remotePeerIds: [...this.peers.keys()],
    };
  }

  setSpatial(on: boolean) {
    this.spatial = on;
  }

  updatePoses(self: { x: number; z: number }, peers: PeerPose[]) {
    this.selfPos = self;
    this.peerPos.clear();
    for (const p of peers) this.peerPos.set(p.peerId, { x: p.x, z: p.z });
    if (this.spatial) this.applySpatial();
  }

  private applySpatial() {
    for (const [id, link] of this.peers) {
      if (!link.audio) continue;
      const pos = this.peerPos.get(id);
      if (!pos) {
        link.audio.volume = this.deafened ? 0 : 0.85;
        continue;
      }
      const d = Math.hypot(pos.x - this.selfPos.x, pos.z - this.selfPos.z);
      // 1.5 m = cheio; 12 m = quase mudo
      const vol = this.deafened ? 0 : Math.max(0.05, Math.min(1, 1.2 - d / 12));
      link.audio.volume = vol;
    }
  }

  async start(opts: {
    selfId: string;
    placeId: string;
    displayName: string;
  }) {
    if (this.active) return;
    this.selfId = opts.selfId;
    this.placeId = opts.placeId;
    this.displayName = opts.displayName;
    this.error = null;

    const transport = this.getTransport();
    if (!transport) {
      this.error = "Sem canal em tempo real. Entre num lugar primeiro.";
      this.emit();
      return;
    }
    this.transport = transport;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (this.muted) {
        for (const t of this.localStream.getAudioTracks()) t.enabled = false;
      }
    } catch {
      this.error = "Microfone negado ou indisponível.";
      this.emit();
      return;
    }

    this.active = true;
    this.unsub = transport.onMessage((msg) => {
      if (msg.type === "voice") void this.onSignal(msg.payload);
      if (msg.type === "leave") void this.removePeer(msg.payload.peerId);
      if (msg.type === "join" && this.active) {
        // novo corpo no lugar: se já estamos em voz, eles recebem nosso join
      }
    });

    this.send({
      kind: "voice-join",
      peerId: this.selfId,
      displayName: this.displayName,
      placeId: this.placeId,
    });

    this.emit();
  }

  async stop() {
    if (!this.active) return;
    this.send({
      kind: "voice-leave",
      peerId: this.selfId,
      placeId: this.placeId,
    });
    for (const id of [...this.peers.keys()]) await this.removePeer(id);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.unsub?.();
    this.unsub = null;
    this.active = false;
    this.emit();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.localStream) {
      for (const t of this.localStream.getAudioTracks()) t.enabled = !muted;
    }
    this.emit();
  }

  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applySpatial();
    this.emit();
  }

  private send(payload: VoiceSignalPayload) {
    this.transport?.send({ type: "voice", payload } as RealtimeMessage);
  }

  private async onSignal(payload: VoiceSignalPayload) {
    if (!this.active) return;
    switch (payload.kind) {
      case "voice-join":
        if (payload.peerId === this.selfId) return;
        if (payload.placeId !== this.placeId) return;
        // deterministic polite peer (menor id é polite)
        await this.ensurePeer(payload.peerId, this.selfId < payload.peerId);
        break;
      case "voice-leave":
        if (payload.peerId !== this.selfId) await this.removePeer(payload.peerId);
        break;
      case "voice-offer":
        if (payload.to !== this.selfId) return;
        await this.handleOffer(payload.from, payload.sdp);
        break;
      case "voice-answer":
        if (payload.to !== this.selfId) return;
        await this.handleAnswer(payload.from, payload.sdp);
        break;
      case "voice-ice":
        if (payload.to !== this.selfId) return;
        await this.handleIce(payload.from, payload.candidate);
        break;
    }
  }

  private async ensurePeer(peerId: string, polite: boolean) {
    if (this.peers.has(peerId) || !this.localStream) return;
    const iceServers = await resolveIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    const link: PeerLink = { pc, makingOffer: false, polite };
    this.peers.set(peerId, link);

    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.send({
        kind: "voice-ice",
        from: this.selfId,
        to: peerId,
        candidate: ev.candidate.toJSON(),
      });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      let audio = link.audio;
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.setAttribute("playsinline", "true");
        link.audio = audio;
      }
      audio.srcObject = stream;
      void audio.play().catch(() => {
        /* autoplay policy — user already clicked mic */
      });
      this.applySpatial();
    };

    pc.onnegotiationneeded = async () => {
      try {
        link.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        this.send({
          kind: "voice-offer",
          from: this.selfId,
          to: peerId,
          sdp: pc.localDescription!.toJSON(),
        });
      } catch (e) {
        console.warn("[voice] offer", e);
      } finally {
        link.makingOffer = false;
      }
    };

    // quem não é polite espera; quem é polite e tem id menor inicia
    if (!polite) {
      try {
        link.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        this.send({
          kind: "voice-offer",
          from: this.selfId,
          to: peerId,
          sdp: pc.localDescription!.toJSON(),
        });
      } catch (e) {
        console.warn("[voice] initial offer", e);
      } finally {
        link.makingOffer = false;
      }
    }

    this.emit();
  }

  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    let link = this.peers.get(from);
    if (!link) {
      await this.ensurePeer(from, this.selfId < from);
      link = this.peers.get(from);
    }
    if (!link) return;
    const pc = link.pc;
    const offerCollision =
      link.makingOffer || pc.signalingState !== "stable";
    if (offerCollision && !link.polite) return;
    try {
      await pc.setRemoteDescription(sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      this.send({
        kind: "voice-answer",
        from: this.selfId,
        to: from,
        sdp: pc.localDescription!.toJSON(),
      });
    } catch (e) {
      console.warn("[voice] answer", e);
    }
  }

  private async handleAnswer(from: string, sdp: RTCSessionDescriptionInit) {
    const link = this.peers.get(from);
    if (!link) return;
    try {
      await link.pc.setRemoteDescription(sdp);
    } catch (e) {
      console.warn("[voice] setRemote answer", e);
    }
  }

  private async handleIce(from: string, candidate: RTCIceCandidateInit) {
    const link = this.peers.get(from);
    if (!link) return;
    try {
      await link.pc.addIceCandidate(candidate);
    } catch (e) {
      console.warn("[voice] ice", e);
    }
  }

  private async removePeer(peerId: string) {
    const link = this.peers.get(peerId);
    if (!link) return;
    link.audio?.pause();
    link.audio = undefined;
    link.pc.close();
    this.peers.delete(peerId);
    this.emit();
  }
}

/** Singleton ligado ao transport do store. */
let voiceSingleton: VoiceChat | null = null;

export function getVoiceChat(getTransport: () => RealtimeTransport | null) {
  if (!voiceSingleton) voiceSingleton = new VoiceChat(getTransport);
  return voiceSingleton;
}
