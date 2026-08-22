/**
 * POST /api/awaken — extrai o perfil (alma) a partir das memórias do cofre.
 * Body: { name, relationship, kind, bio, traits, speechNotes, favorites, memories, photoDataUrls }
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleAwaken } from "@/server/ai-http";

export const Route = createFileRoute("/api/awaken")({
  server: {
    handlers: {
      POST: ({ request }) => handleAwaken(request),
    },
  },
});
