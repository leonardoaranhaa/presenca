/**
 * POST /api/avatar/jobs — criar job de avatar
 * GET  /api/avatar/jobs?id= — não usado; ver $id
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleCreateAvatarJob } from "@/server/avatar-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/avatar/jobs")({
  server: {
    handlers: {
      POST: ({ request }) => comLog("avatar-jobs", request, () => handleCreateAvatarJob(request)),
    },
  },
});
