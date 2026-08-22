/**
 * PartyKit server — uma sala por `placeId` do Presença.
 *
 * Deploy:
 *   npx partykit dev
 *   npx partykit deploy
 *
 * Cliente: provider "partykit" + host do projeto (ver lib/realtime.ts).
 */
import type * as Party from "partykit/server";

type PeerPose = {
  peerId: string;
  displayName: string;
  placeId: string;
  x: number;
  z: number;
  yaw: number;
  personaId?: string;
  bodyGlbUrl?: string;
  updatedAt: number;
};

/**
 * Sinalização de voz WebRTC. As variantes com `to` são dirigidas a um peer;
 * o servidor entrega-as só a esse, em vez de difundir a sala inteira.
 */
type VoiceSignal =
  | { kind: "voice-join"; peerId: string; displayName: string; placeId: string }
  | { kind: "voice-here"; peerId: string; displayName: string; placeId: string; to: string }
  | { kind: "voice-leave"; peerId: string; placeId: string }
  | { kind: "voice-offer"; from: string; to: string; sdp: unknown }
  | { kind: "voice-answer"; from: string; to: string; sdp: unknown }
  | { kind: "voice-ice"; from: string; to: string; candidate: unknown };

type Msg =
  | { type: "pose"; payload: PeerPose }
  | { type: "join"; payload: PeerPose }
  | { type: "leave"; payload: { peerId: string; placeId: string } }
  | { type: "chat"; payload: { peerId: string; text: string; at: number } }
  | { type: "sync"; payload: { peers: PeerPose[] } }
  | { type: "voice"; payload: VoiceSignal };

/** Um peer é considerado ausente se não publica pose há este tempo. */
const STALE_MS = 15_000;

type ConnState = { peerId?: string };

export default class PresencaParty implements Party.Server {
  private peers = new Map<string, PeerPose>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection<ConnState>) {
    this.prune();
    conn.send(
      JSON.stringify({
        type: "sync",
        payload: { peers: [...this.peers.values()] },
      } satisfies Msg),
    );
  }

  onClose(conn: Party.Connection<ConnState>) {
    const peerId = conn.state?.peerId;
    if (!peerId) return;
    this.peers.delete(peerId);
    this.room.broadcast(
      JSON.stringify({
        type: "leave",
        payload: { peerId, placeId: this.room.id },
      } satisfies Msg),
      [conn.id],
    );
  }

  onMessage(message: string, sender: Party.Connection<ConnState>) {
    let msg: Msg;
    try {
      msg = JSON.parse(message) as Msg;
    } catch {
      return;
    }

    switch (msg.type) {
      case "join":
      case "pose": {
        this.peers.set(msg.payload.peerId, msg.payload);
        // Liga a ligação ao peerId para que onClose saiba quem saiu.
        sender.setState({ peerId: msg.payload.peerId });
        break;
      }
      case "leave": {
        this.peers.delete(msg.payload.peerId);
        break;
      }
      case "voice": {
        // Entrega dirigida: offer/answer/ice/here só interessam ao destinatário.
        const to = "to" in msg.payload ? msg.payload.to : undefined;
        if (to) {
          const target = this.findConnectionByPeerId(to);
          target?.send(message);
          return;
        }
        break;
      }
      case "chat":
      case "sync":
        break;
    }

    this.room.broadcast(message, [sender.id]);
  }

  private findConnectionByPeerId(peerId: string): Party.Connection<ConnState> | undefined {
    for (const conn of this.room.getConnections<ConnState>()) {
      if (conn.state?.peerId === peerId) return conn;
    }
    return undefined;
  }

  /** Remove poses de peers que caíram sem enviar "leave" (aba fechada, rede). */
  private prune() {
    const now = Date.now();
    for (const [id, pose] of this.peers) {
      if (now - pose.updatedAt > STALE_MS) this.peers.delete(id);
    }
  }
}
