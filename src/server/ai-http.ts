/**
 * Adaptadores HTTP para /api/chat e /api/awaken.
 * Validação com zod: o corpo vem do browser e não é de confiança.
 */
import {
  awakenInputSchema,
  awakenPresence,
  chatInputSchema,
  chatWithPresence,
} from "./ai";

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

async function readJson(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function handleChat(req: Request): Promise<Response> {
  const raw = await readJson(req);
  if (raw === undefined) return badRequest("JSON inválido.");

  const parsed = chatInputSchema.safeParse(raw);
  if (!parsed.success) return badRequest("Pedido de conversa inválido.");

  const result = await chatWithPresence(parsed.data, req.signal);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }
  return Response.json({ text: result.text }, { headers: { "Cache-Control": "no-store" } });
}

export async function handleAwaken(req: Request): Promise<Response> {
  const raw = await readJson(req);
  if (raw === undefined) return badRequest("JSON inválido.");

  const parsed = awakenInputSchema.safeParse(raw);
  if (!parsed.success) return badRequest("Pedido de despertar inválido.");

  const result = await awakenPresence(parsed.data, req.signal);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 502 });
  }
  return Response.json({ soul: result.soul }, { headers: { "Cache-Control": "no-store" } });
}
