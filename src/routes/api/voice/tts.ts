/**
 * POST /api/voice/tts
 * Body JSON: { text, voiceId, modelId? }
 * Response: audio/mpeg
 */
import { handleVoiceTts } from "@/server/voice-http";

export async function POST(request: Request) {
  return handleVoiceTts(request);
}

export default async function handler(request: Request) {
  return handleVoiceTts(request);
}
