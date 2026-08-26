/**
 * POST /api/embed — embeddings semânticos para a recuperação de memórias.
 * Body: { texts: string[] } → { vectors, model, dim }
 *
 * Estava declarada com `export function POST` + `export default`, formato que
 * o TanStack Start não reconhece: a rota nunca entrava no routeTree e
 * respondia 404 em silêncio. A recuperação semântica caía sempre no ramo
 * lexical sem ninguém dar por isso — é o mesmo erro que já custou as cinco
 * rotas originais, e está documentado no CLAUDE.md.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleEmbed } from "@/server/embed-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/embed")({
  server: {
    handlers: {
      POST: ({ request }) => comLog("embed", request, () => handleEmbed(request)),
    },
  },
});
