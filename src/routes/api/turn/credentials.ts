/**
 * GET /api/turn/credentials — iceServers com credenciais temporárias (ou STUN-only).
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleTurnCredentials } from "@/server/turn-http";

export const Route = createFileRoute("/api/turn/credentials")({
  server: {
    handlers: {
      GET: ({ request }) => handleTurnCredentials(request),
    },
  },
});
