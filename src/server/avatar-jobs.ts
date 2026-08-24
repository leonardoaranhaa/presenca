/**
 * Fila de jobs de avatar (fotos/vídeos → GLB).
 *
 * Com AVATAR_MESH_API_URL + KEY: worker chama image-to-3d (Meshy ou generic).
 * Sem provider: needs_provider (studio ou GLB manual).
 *
 * ## O Map vive só nesta instância
 *
 * O alvo de deploy é serverless (nitro → Vercel). Cada pedido pode cair numa
 * instância diferente, e as instâncias morrem entre pedidos: um job criado
 * num POST pode simplesmente não existir no GET seguinte.
 *
 * Por isso o caminho que **não** precisa de fornecedor externo decide-se
 * dentro do próprio POST e devolve já o estado terminal — nunca depende de um
 * segundo pedido. É o caminho de hoje, porque não há gerador configurado.
 *
 * O caminho com fornecedor (e o `completeAvatarJob` do studio, que só acontece
 * horas depois) precisa mesmo de estado partilhado. Enquanto não houver um KV
 * ou uma base de dados provisionada, esse caminho **não é fiável em produção**
 * — está registado no PLANO.md e o /api/status di-lo à UI.
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

  // Decidir aqui o que não precisa de rede: assim o POST devolve o estado
  // final e o cliente não tem de voltar a um servidor que pode não ter
  // memória nenhuma deste job.
  const terminal = decidirSemRede(job);
  if (terminal) return terminal;

  queueMicrotask(() => {
    void advanceJob(job.id);
  });
  return job;
}

/**
 * Estados que se decidem sem falar com ninguém. Devolve o job já terminal, ou
 * `undefined` se for preciso mesmo chamar o fornecedor.
 */
function decidirSemRede(job: ServerAvatarJob): ServerAvatarJob | undefined {
  const parar = (message: string) => {
    job.status = "needs_provider" as const;
    job.message = message;
    job.updatedAt = Date.now();
    jobs.set(job.id, job);
    return job;
  };

  // Studio nunca chama gerador automático — fica para a equipa.
  if (job.path === "studio") {
    return parar(
      "Pedido studio registado. A equipa modela offline; complete o job com POST …/jobs/:id { resultGlbUrl }.",
    );
  }

  if (!meshProviderConfigured()) {
    return parar(
      "Sem gerador 3D (AVATAR_MESH_API_URL + AVATAR_MESH_API_KEY). Associe um GLB ou use studio.",
    );
  }

  const temImagem = job.imageUrls?.some((u) => u.startsWith("https://") || u.startsWith("http://"));
  if (!temImagem) {
    return parar(
      "O gerador precisa de pelo menos uma image_url HTTPS pública. Data URLs locais não são enviadas ao Meshy. Faça upload para storage e reenvie o job com imageUrls.",
    );
  }

  return undefined;
}

async function advanceJob(id: string) {
  const job = jobs.get(id);
  if (!job || job.status !== "queued") return;

  job.status = "processing";
  job.updatedAt = Date.now();
  jobs.set(id, job);

  // `decidirSemRede` já garantiu que há fornecedor e imagem: só chega aqui
  // quem tem mesmo de sair para a rede.
  const imageUrl = job.imageUrls?.find((u) => u.startsWith("https://") || u.startsWith("http://"));
  if (!imageUrl) return;

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
