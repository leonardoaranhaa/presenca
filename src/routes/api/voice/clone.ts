/**
 * POST /api/voice/clone
 *
 * TanStack Start: exporte um server handler / createAPIFileRoute conforme a versão.
 * Vite plugin alternativo: use este módulo com handleVoiceClone de voice-http.
 */
import { handleVoiceClone } from "@/server/voice-http";

export async function POST(request: Request) {
  return handleVoiceClone(request);
}

/** Compat: alguns adapters esperam default export */
export default async function handler(request: Request) {
  return handleVoiceClone(request);
}
