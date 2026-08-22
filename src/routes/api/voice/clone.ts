/**
 * POST /api/voice/clone
 * Body: { personaId, name, samples: dataUrl[] } → { voiceId }
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleVoiceClone } from "@/server/voice-http";

export const Route = createFileRoute("/api/voice/clone")({
  server: {
    handlers: {
      POST: ({ request }) => handleVoiceClone(request),
    },
  },
});
