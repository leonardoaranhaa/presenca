import { z } from "zod";
import { embedTexts } from "./embed";
import { checkRateLimit, clientKey, tooManyRequests } from "./rate-limit";

/**
 * Cada pedido vai a um fornecedor pago de embeddings. Sem limite, a rota é um
 * amplificador de custo à conta de quem hospeda — o mesmo problema que
 * /api/chat tinha.
 */
const schema = z.object({
  texts: z.array(z.string().max(8000)).min(1).max(32),
});

export async function handleEmbed(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const limite = checkRateLimit("embed", clientKey(req));
  if (!limite.allowed) return tooManyRequests("embed", limite);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Pedido de embedding inválido." }, { status: 400 });
  }

  const result = await embedTexts(parsed.data.texts, req.signal);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 502 });
  }
  return Response.json({
    vectors: result.vectors,
    model: result.model,
    dim: result.dim,
  });
}
