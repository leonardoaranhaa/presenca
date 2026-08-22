/**
 * Adaptadores HTTP para /api/voice/*.
 * Monte no servidor da sua stack (TanStack Start server routes, Hono, etc.).
 */
import { cloneVoice, synthesizeSpeech } from "./voice";

export async function handleVoiceClone(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const body = await req.json();
    const result = await cloneVoice({
      personaId: String(body.personaId || ""),
      name: String(body.name || "Presença"),
      samples: Array.isArray(body.samples) ? body.samples.map(String) : [],
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status || 400 });
    }
    return Response.json({ voiceId: result.voiceId });
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
}

export async function handleVoiceTts(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const body = await req.json();
    const result = await synthesizeSpeech({
      text: String(body.text || ""),
      voiceId: String(body.voiceId || ""),
      modelId: body.modelId ? String(body.modelId) : undefined,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status || 400 });
    }
    return new Response(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
}
