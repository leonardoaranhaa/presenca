/**
 * GET /api/turn/credentials — iceServers com credenciais temporárias (ou STUN-only).
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleTurnCredentials } from "@/server/turn-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/turn/credentials")({
  server: {
    handlers: {
      GET: ({ request }) => comLog("turn", request, () => handleTurnCredentials(request)),
    },
  },
});
