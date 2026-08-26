/**
 * Mock do firmware do traje — responde hello_ack.
 * Uso: npx --yes ws (ou npm i ws) && node scripts/mock-suit-server.mjs
 */
import { WebSocketServer } from "ws";

const port = Number(process.env.SUIT_PORT || 8765);
const wss = new WebSocketServer({ port });

console.log(`[mock-suit] listening ws://127.0.0.1:${port}`);

wss.on("connection", (ws) => {
  console.log("[mock-suit] client connected");
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    console.log("[mock-suit] ←", msg.type || msg);
    if (msg.type === "hello") {
      ws.send(
        JSON.stringify({
          type: "hello_ack",
          ok: true,
          protocol: "presenca-suit-v1",
          regions: ["chest", "back", "shoulders", "left_arm", "right_arm"],
        }),
      );
      console.log("[mock-suit] → hello_ack");
    }
    if (msg.type === "haptic_pattern") {
      ws.send(JSON.stringify({ type: "haptic_ack", gesture: msg.gesture }));
    }
  });
  ws.on("close", () => console.log("[mock-suit] client left"));
});
