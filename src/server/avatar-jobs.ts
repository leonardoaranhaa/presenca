/**
 * Fila de jobs de avatar (fotos/vídeos → GLB).
 *
 * Com AVATAR_MESH_API_URL + KEY: worker chama image-to-3d (Meshy ou generic).
 * Sem provider: needs_provider (studio ou GLB manual).
 */

import { randomUUID } from "node:crypto";
import { meshProviderConfigured, startImageToMesh, waitForMesh } from "./avatar-mesh-provider";

export type ServerAvatarJobStatus = "queued" | "processing" | "needs_provider" | "ready" | "failed";

export type ServerAvatarJob = {
  id: string;
  personaId: string;
  path: "self_service" | "studio";
  status: ServerAvatarJobStatus;
  brief?: string;
  contactEmail?: string;
  estimatedHeightM?: number;
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  /** URLs públicas HTTPS das imagens (para o fornecedor descarregar) */
  imageUrls?: string[];
  externalId?: string;
  createdAt: number;
  updatedAt: number;
  resultGlbUrl?: string;
  message?: string;
};

const jobs = new Map<string, ServerAvatarJob>();
const MAX_JOBS = 500;

export function createAvatarJob(input: {
  personaId: string;
  path: "self_service" | "studio";
  brief?: string;
  contactEmail?: string;
  estimatedHeightM?: number;
  photoCount: number;
  videoCount: number;
  imageUrls?: string[];
}): ServerAvatarJob {
  if (jobs.size >= MAX_JOBS) {
    const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) jobs.delete(oldest.id);
  }

  const now = Date.now();
  const job: ServerAvatarJob = {
    id: randomUUID(),
    personaId: input.personaId,
    path: input.path,
    status: "queued",
    brief: input.brief,
    contactEmail: input.contactEmail,
    estimatedHeightM: input.estimatedHeightM,
    mediaCount: input.photoCount + input.videoCount,
    photoCount: input.photoCount,
    videoCount: input.videoCount,
    imageUrls: input.imageUrls?.slice(0, 8),
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  queueMicrotask(() => {
    void advanceJob(job.id);
  });
  return job;
}

async function advanceJob(id: string) {
  const job = jobs.get(id);
  if (!job || job.status !== "queued") return;

  job.status = "processing";
  job.updatedAt = Date.now();
  jobs.set(id, job);

  // Studio nunca chama gerador automático — fica para a equipa
  if (job.path === "studio") {
    job.status = "needs_provider";
    job.message =
      "Pedido studio registado. A equipa modela offline; complete o job com POST …/jobs/:id { resultGlbUrl }.";
    job.updatedAt = Date.now();
    jobs.set(id, job);
    return;
  }

  if (!meshProviderConfigured()) {
    job.status = "needs_provider";
    job.message =
      "Sem gerador 3D (AVATAR_MESH_API_URL + AVATAR_MESH_API_KEY). Associe um GLB ou use studio.";
    job.updatedAt = Date.now();
    jobs.set(id, job);
    return;
  }

  const imageUrl = job.imageUrls?.find((u) => u.startsWith("https://") || u.startsWith("http://"));
  if (!imageUrl) {
    job.status = "needs_provider";
    job.message =
      "O gerador precisa de pelo menos uma image_url HTTPS pública. Data URLs locais não são enviadas ao Meshy. Faça upload para storage e reenvie o job com imageUrls.";
    job.updatedAt = Date.now();
    jobs.set(id, job);
    return;
  }

  const started = await startImageToMesh({
    imageUrl,
    prompt: job.brief,
  });
  if (!started.ok) {
    job.status = "failed";
    job.message = started.error;
    job.updatedAt = Date.now();
    jobs.set(id, job);
    return;
  }

  job.externalId = started.externalId;
  job.message = `Tarefa externa ${started.externalId} — a processar…`;
  job.updatedAt = Date.now();
  jobs.set(id, job);

  const result = await waitForMesh(started.externalId, {
    timeoutMs: Number(process.env.AVATAR_MESH_TIMEOUT_MS || 180_000),
    intervalMs: 3000,
  });

  const j = jobs.get(id);
  if (!j) return;

  if (!result.ok) {
    j.status = "failed";
    j.message = result.error;
  } else if (result.status === "ready" && result.glbUrl) {
    j.status = "ready";
    j.resultGlbUrl = result.glbUrl;
    j.message = "GLB gerado pelo fornecedor.";
  } else {
    j.status = "failed";
    j.message = result.detail || "Gerador falhou sem GLB.";
  }
  j.updatedAt = Date.now();
  jobs.set(id, j);
}

export function getAvatarJob(id: string): ServerAvatarJob | undefined {
  return jobs.get(id);
}

export function completeAvatarJob(id: string, resultGlbUrl: string): ServerAvatarJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  job.status = "ready";
  job.resultGlbUrl = resultGlbUrl;
  job.updatedAt = Date.now();
  job.message = "GLB pronto (completo manualmente).";
  jobs.set(id, job);
  return job;
}
