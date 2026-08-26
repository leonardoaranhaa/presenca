/**
 * Voz em tempo real (WebRTC mesh) no mesmo lugar.
 * Sinalização via RealtimeTransport (local / PartyKit / ws).
 *
 * Fluxo: join voice → getUserMedia → oferta/resposta/ICE com cada peer.
 * Áudio espacial simples: volume por distância XZ (opcional).
 */

import type { PeerPose, RealtimeMessage, RealtimeTransport, VoiceSignalPayload } from "./realtime";
import { loadRealtimeConfig } from "./realtime";
import { resolveIceServers } from "./ice-config";
import { MAX_PEERS_HARD, MAX_PEERS_SOFT, resolveVoiceTopology } from "./peer-limits";
import { getSfuVoiceClient } from "./sfu-client";
import { getLiveKitSfuClient, isLiveKitConfigured } from "./livekit-sfu";

type PeerLink = {
  pc: RTCPeerConnection;
  audio?: HTMLAudioElement;
  makingOffer: boolean;
  /** id menor = polite: cede numa colisão de ofertas (perfect negotiation) */
  polite: boolean;
  /** oferta descartada — os ICE candidates que chegarem a seguir são ignorados */
  ignoreOffer: boolean;
};

export type VoiceChatState = {
  active: boolean;
  muted: boolean;
  deafened: boolean;
  error: string | null;
  remotePeerIds: string[];
  topology: "mesh" | "sfu" | "capped-mesh";
  /** LiveKit active speakers (identities) */
  activeSpeakers: string[];
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
  private topology: "mesh" | "sfu" | "capped-mesh" = "mesh";
  private sfuActive = false;
  private sfuPoll: ReturnType<typeof setInterval> | null = null;

  constructor(private getTransport: () => RealtimeTransport | null) {}

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

  snapshot(): VoiceChatState {
    let activeSpeakers: string[] = [];
    if (this.sfuActive) {
      try {
        activeSpeakers = getLiveKitSfuClient().snapshot().activeSpeakers ?? [];
      } catch {
        activeSpeakers = [];
      }
    }
    return {
      active: this.active,
      muted: this.muted,
      deafened: this.deafened,
      error: this.error,
      remotePeerIds: [...this.peers.keys()],
      topology: this.topology,
      activeSpeakers,
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
    const refDist = 1.4; // volume 1
    const maxDist = 14; // silêncio
    for (const [id, link] of this.peers) {
      if (!link.audio) continue;
      if (this.deafened) {
        link.audio.volume = 0;
        continue;
      }
      const pos = this.peerPos.get(id);
      if (!pos) {
        link.audio.volume = 0.85;
        continue;
      }
      const d = Math.hypot(pos.x - this.selfPos.x, pos.z - this.selfPos.z);
      // atenuação suave (quase inversa com chão)
      let vol: number;
      if (d <= refDist) vol = 1;
      else if (d >= maxDist) vol = 0;
      else {
        const t = (d - refDist) / (maxDist - refDist);
        vol = Math.pow(1 - t, 1.35);
      }
      link.audio.volume = Math.max(0, Math.min(1, vol));
    }
  }

  async start(opts: { selfId: string; placeId: string; displayName: string }) {
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
    const cfg = loadRealtimeConfig();
    // peer count aproximado: lista do transporte + 1
    const n = Math.max(1, (transport.listPeers?.() ?? []).length + 1);
    const useLivekit =
      isLiveKitConfigured(cfg.sfuUrl, cfg.livekitUrl) &&
      (cfg.preferLivekit ||
        n >= 6 ||
        resolveVoiceTopology(n, cfg.sfuUrl || cfg.livekitUrl) === "sfu");
    this.topology = useLivekit ? "sfu" : resolveVoiceTopology(n, cfg.sfuUrl || cfg.livekitUrl);
    if (this.topology === "sfu" && useLivekit) {
      this.sfuActive = true;
      const lk = getLiveKitSfuClient();
      await lk.start({
        livekitUrl: cfg.livekitUrl || cfg.sfuUrl,
        selfId: this.selfId,
        room: this.placeId,
        displayName: this.displayName,
        localStream: this.localStream!,
      });
      this.startSfuPoll();
    } else if (this.topology === "sfu" && cfg.sfuUrl) {
      this.sfuActive = true;
      const sfu = getSfuVoiceClient();
      await sfu.start({
        sfuUrl: cfg.sfuUrl,
        selfId: this.selfId,
        room: this.placeId,
        displayName: this.displayName,
        localStream: this.localStream!,
      });
    }
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
    if (this.sfuActive) {
      await getLiveKitSfuClient().stop();
      await getSfuVoiceClient().stop();
      this.sfuActive = false;
    }
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
    if (this.sfuActive) {
      getLiveKitSfuClient().setMuted(muted);
      getSfuVoiceClient().setMuted(muted);
    }
    this.emit();
  }

  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applySpatial();
    this.emit();
  }

  private startSfuPoll() {
    this.stopSfuPoll();
    this.sfuPoll = setInterval(() => this.emit(), 400);
  }

  private stopSfuPoll() {
    if (this.sfuPoll != null) {
      clearInterval(this.sfuPoll);
      this.sfuPoll = null;
    }
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
        // Quem já estava na sala responde, senão quem chega nunca fica a
        // saber que os outros existem (só o join é difundido).
        this.send({
          kind: "voice-here",
          peerId: this.selfId,
          displayName: this.displayName,
          placeId: this.placeId,
          to: payload.peerId,
        });
        await this.ensurePeer(payload.peerId);
        break;
      case "voice-here":
        if (payload.to !== this.selfId) return;
        if (payload.placeId !== this.placeId) return;
        await this.ensurePeer(payload.peerId);
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

  /**
   * Cria (uma vez) a ligação com um peer.
   *
   * O papel é decidido pela comparação dos ids, igual dos dois lados: o id
   * menor é "polite" (cede numa colisão de ofertas) e o maior é quem oferece.
   * Assim nenhum par fica à espera do outro.
   */
  private async ensurePeer(peerId: string) {
    if (this.peers.has(peerId) || !this.localStream) return;
    // Malha limitada: não abrir mais ligações P2P além do soft limit
    if (this.topology === "capped-mesh" && this.peers.size >= MAX_PEERS_SOFT - 1) {
      return;
    }
    if (this.topology === "sfu") {
      // SFU trata a áudio; não criar mesh
      return;
    }
    if (this.peers.size >= MAX_PEERS_HARD - 1) return;
    const polite = this.selfId < peerId;
    const iceServers = await resolveIceServers();

    // resolveIceServers é assíncrono: outro sinal pode ter criado a ligação
    // entretanto, e duas RTCPeerConnection para o mesmo peer nunca fecham.
    if (this.peers.has(peerId) || !this.localStream || !this.active) return;

    const pc = new RTCPeerConnection({ iceServers });
    const link: PeerLink = { pc, makingOffer: false, polite, ignoreOffer: false };
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
      if (link.polite) return; // só o impolite inicia
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

    // addTrack acima já agenda onnegotiationneeded no lado impolite,
    // que é quem envia a oferta. Uma segunda oferta manual aqui criava
    // glare com a automática.
    this.emit();
  }

  private async handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    let link = this.peers.get(from);
    if (!link) {
      await this.ensurePeer(from);
      link = this.peers.get(from);
    }
    if (!link) return;
    const pc = link.pc;

    // Perfect negotiation: numa colisão, o impolite ignora a oferta e o
    // polite desfaz a sua (rollback) antes de aceitar a do outro. Sem o
    // rollback, setRemoteDescription rebenta em "have-local-offer".
    const collision = link.makingOffer || pc.signalingState !== "stable";
    link.ignoreOffer = collision && !link.polite;
    if (link.ignoreOffer) return;

    try {
      if (collision) {
        await pc.setLocalDescription({ type: "rollback" });
      }
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
      // Candidatos de uma oferta que ignorámos chegam sempre e falham: é esperado.
      if (!link.ignoreOffer) console.warn("[voice] ice", e);
    }
  }

  private async removePeer(peerId: string) {
    const link = this.peers.get(peerId);
    if (!link) return;
    if (link.audio) {
      link.audio.pause();
      link.audio.srcObject = null;
      link.audio = undefined;
    }
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

/** Instância opcional registada por VoiceControls. */
export let voiceChatSingleton: VoiceChat | null = null;
export function registerVoiceChat(vc: VoiceChat | null) {
  voiceChatSingleton = vc;
}
