/**
 * POST /api/embed
 * Body: { texts: string[] }
 * Response: { vectors: number[][], model, dim } | { error }
 */
import { handleEmbed } from "@/server/embed-http";

export async function POST(request: Request) {
  return handleEmbed(request);
}

export default async function handler(request: Request) {
  return handleEmbed(request);
}
