/**
 * GET /api/status — que capacidades estão configuradas neste ambiente.
 * Só booleanos: nunca devolve valores de chaves.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleStatus } from "@/server/status";

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: ({ request }) => handleStatus(request),
    },
  },
});
