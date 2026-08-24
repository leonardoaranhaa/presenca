/**
 * GET  /api/avatar/jobs/:id — polling
 * POST /api/avatar/jobs/:id — completar com GLB (studio/admin)
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleCompleteAvatarJob, handleGetAvatarJob } from "@/server/avatar-http";
import { comLog } from "@/server/log";

export const Route = createFileRoute("/api/avatar/jobs/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        comLog("avatar-job-get", request, () => handleGetAvatarJob(request, params.id)),
      POST: ({ request, params }) =>
        comLog("avatar-job-complete", request, () => handleCompleteAvatarJob(request, params.id)),
    },
  },
});
