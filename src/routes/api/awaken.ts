/**
 * POST /api/awaken — extrai o perfil (alma) a partir das memórias do cofre.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleAwaken } from "@/server/ai-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/awaken")({
  server: {
    handlers: {
      POST: ({ request }) => comLog("awaken", request, () => handleAwaken(request)),
    },
  },
});
