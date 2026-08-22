/**
 * POST /api/chat — resposta da presença.
 * Body: { name, systemPrompt, history, message }
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleChat } from "@/server/ai-http";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleChat(request),
    },
  },
});
