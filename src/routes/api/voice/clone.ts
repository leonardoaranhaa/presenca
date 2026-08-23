/**
 * POST /api/voice/clone
 * Body: { personaId, name, consent, samples: dataUrl[] } → { voiceId }
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleVoiceClone } from "@/server/voice-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/voice/clone")({
  server: {
    handlers: {
      POST: ({ request }) => comLog("voz.clone", request, () => handleVoiceClone(request)),
    },
  },
});
