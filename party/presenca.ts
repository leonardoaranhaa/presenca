/**
 * PartyKit server — sala = placeId do Presença.
 *
 * Deploy:
 *   npx partykit dev
 *   npx partykit deploy
 *
 * Client: provider partykit + host do projeto.
 */

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

type Msg =
  | { type: "pose"; payload: PeerPose }
  | { type: "join"; payload: PeerPose }
  | { type: "leave"; payload: { peerId: string; placeId: string } }
  | { type: "chat"; payload: { peerId: string; text: string; at: number } }
  | { type: "sync"; payload: { peers: PeerPose[] } };

type Conn = {
  id: string;
  peerId?: string;
  send: (data: string) => void;
};

// API mínima compatível com PartyKit Party hooks
export default class PresencaParty {
  peers = new Map<string, PeerPose>();
  connections = new Map<string, Conn>();

  constructor(private room: { id: string; broadcast: (msg: string, without?: string[]) => void }) {}

  onConnect(conn: { id: string; send: (d: string) => void }) {
    this.connections.set(conn.id, { id: conn.id, send: (d) => conn.send(d) });
    // sync estado atual
    const list = [...this.peers.values()];
    conn.send(JSON.stringify({ type: "sync", payload: { peers: list } } satisfies Msg));
  }

  onClose(conn: { id: string }) {
    const c = this.connections.get(conn.id);
    this.connections.delete(conn.id);
    if (c?.peerId) {
      this.peers.delete(c.peerId);
      this.room.broadcast(
        JSON.stringify({
          type: "leave",
          payload: { peerId: c.peerId, placeId: this.room.id },
        } satisfies Msg),
        [conn.id],
      );
    }
  }

  onMessage(message: string, sender: { id: string; send: (d: string) => void }) {
    let msg: Msg;
    try {
      msg = JSON.parse(message) as Msg;
    } catch {
      return;
    }
    const c = this.connections.get(sender.id);
    if (msg.type === "join" || msg.type === "pose") {
      this.peers.set(msg.payload.peerId, msg.payload);
      if (c) c.peerId = msg.payload.peerId;
    }
    if (msg.type === "leave") {
      this.peers.delete(msg.payload.peerId);
    }
    // rebroadcast
    this.room.broadcast(message, [sender.id]);
  }
}
