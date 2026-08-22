import { issueTurnCredentials } from "./turn";

/**
 * Emite credenciais TURN.
 *
 * O endpoint estava aberto: `Access-Control-Allow-Origin: *` sem qualquer
 * verificação, o que permite a qualquer site emitir credenciais válidas para
 * o coturn da instalação e usá-lo como relay à conta de quem o hospeda.
 * Passa a ser same-origin: só o próprio Presença o consome (via
 * resolveIceServers, sempre do mesmo domínio), portanto não há razão para
 * anunciar CORS a terceiros.
 */
export async function handleTurnCredentials(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Pedidos cross-origin do browser trazem Origin; os do próprio site (ou
  // server-side) não trazem, ou trazem a própria origem.
  const origin = req.headers.get("origin");
  if (origin) {
    const self = new URL(req.url).origin;
    if (origin !== self) {
      return Response.json({ error: "Origem não autorizada" }, { status: 403 });
    }
  }

  try {
    const result = await issueTurnCredentials();
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        // Sem Access-Control-Allow-Origin: same-origin apenas.
        Vary: "Origin",
      },
    });
  } catch (e) {
    console.error("[turn]", e);
    return Response.json({ error: "Falha ao emitir credenciais TURN" }, { status: 500 });
  }
}
