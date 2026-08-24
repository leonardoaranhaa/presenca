/**
 * Mock SFU mínimo — um peer só (eco / silent).
 * Produção: LiveKit ou mediasoup.
 *
 * node scripts/mock-sfu-server.mjs
 * Ajustes → Interconexão → SFU wss://localhost:8777 (use ws://127.0.0.1:8777)
 */
import { WebSocketServer } from "ws";

const port = Number(process.env.SFU_PORT || 8777);
const wss = new WebSocketServer({ port });
console.log(`[mock-sfu] ws://127.0.0.1:${port}`);

wss.on("connection", (ws) => {
  console.log("[mock-sfu] client");
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    console.log("[mock-sfu] ←", msg.type);
    if (msg.type === "join") {
      ws.send(JSON.stringify({ type: "ready", room: msg.room }));
    }
    // Ofertas/respostas: eco para o mesmo cliente (teste de sinalização)
    if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
      // num SFU real reencaminharia para o router WebRTC
      ws.send(JSON.stringify({ type: "ack", of: msg.type }));
    }
  });
});
