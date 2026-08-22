/**
 * POST /api/voice/tts
 * Body: { text, voiceId, modelId? } → audio/mpeg
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleVoiceTts } from "@/server/voice-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: ({ request }) => comLog("voz.tts", request, () => handleVoiceTts(request)),
    },
  },
});
