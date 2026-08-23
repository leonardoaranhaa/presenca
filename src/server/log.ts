/**
 * Log estruturado das rotas.
 *
 * Havia 12 chamadas a `console` e mais nada: sem id de pedido, sem duração,
 * sem forma de ligar "a presença não respondeu" a uma linha de log. Quando
 * alguém reportar uma falha, é preciso conseguir encontrá-la.
 *
 * JSON numa linha porque é o que os agregadores (incluindo a Vercel) sabem
 * ler. Sem dependências: `console` já é recolhido pela plataforma.
 *
 * **Nunca registar conteúdo de memórias, mensagens ou media.** São dados de
 * família, e alguns são sensíveis. Só metadados: tamanhos, contagens, tempos.
 */

export type LogFields = Record<string, string | number | boolean | undefined>;

export function novoRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emitir(nivel: "info" | "warn" | "error", evento: string, campos: LogFields) {
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    evento,
    ...campos,
  });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.info(linha);
}

/**
 * Mede uma rota e regista o resultado.
 *
 * O `requestId` volta na resposta em `x-request-id`, para quem reporta um
 * problema poder dizer qual foi.
 */
export async function comLog(
  evento: string,
  req: Request,
  fn: (ctx: { requestId: string; log: (campos: LogFields) => void }) => Promise<Response>,
): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? novoRequestId();
  const inicio = Date.now();
  const extra: LogFields = {};

  try {
    const res = await fn({
      requestId,
      log: (campos) => Object.assign(extra, campos),
    });

    emitir(res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info", evento, {
      requestId,
      status: res.status,
      ms: Date.now() - inicio,
      ...extra,
    });

    // Response é imutável: clonar os headers para acrescentar o id.
    const headers = new Headers(res.headers);
    headers.set("x-request-id", requestId);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    emitir("error", evento, {
      requestId,
      status: 500,
      ms: Date.now() - inicio,
      erro: e instanceof Error ? e.message : String(e),
      ...extra,
    });
    return Response.json(
      { error: "Alguma coisa correu mal deste lado. Tente de novo em instantes.", requestId },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
