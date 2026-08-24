import { embedTexts } from "./embed";

export async function handleEmbed(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  let body: { texts?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const texts = Array.isArray(body.texts) ? body.texts.map((t) => String(t)).slice(0, 32) : [];
  const result = await embedTexts(texts, req.signal);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 502 });
  }
  return Response.json({
    vectors: result.vectors,
    model: result.model,
    dim: result.dim,
  });
}
