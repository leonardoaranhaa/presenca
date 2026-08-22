/**
 * POST /api/voice/tts
 * Body: { text, voiceId, modelId? } → audio/mpeg
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleVoiceTts } from "@/server/voice-http";

export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: ({ request }) => handleVoiceTts(request),
    },
  },
});
