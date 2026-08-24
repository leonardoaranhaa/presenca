/**
 * GET /api/livekit/token?room=&identity=&name=
 * Emite JWT LiveKit para o cliente entrar na sala de voz do lugar.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleLiveKitToken } from "@/server/livekit-token";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/livekit/token")({
  server: {
    handlers: {
      GET: ({ request }) => comLog("livekit-token", request, () => handleLiveKitToken(request)),
    },
  },
});
