/**
 * GET|POST /api/turn/credentials
 * Devolve iceServers com credenciais temporárias (ou STUN-only).
 */
import { handleTurnCredentials } from "@/server/turn-http";

export async function GET(request: Request) {
  return handleTurnCredentials(request);
}

export async function POST(request: Request) {
  return handleTurnCredentials(request);
}

export default async function handler(request: Request) {
  return handleTurnCredentials(request);
}
