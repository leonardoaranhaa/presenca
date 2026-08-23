/**
 * POST /api/chat — resposta da presença.
 * Body: { persona, retrieved?, history, message }
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleChat } from "@/server/ai-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => comLog("chat", request, () => handleChat(request)),
    },
  },
});
