/**
 * Pipeline de avatar a partir de fotos e vídeos.
 *
 * Dois caminhos no mesmo modelo:
 * 1. self_service — media no aparelho; no futuro worker/IA gera GLB
 * 2. studio — encomenda: a equipa modela e devolve GLB para a família inserir
 *
 * Hoje: validação, armazenamento local do pedido, checklist de captura,
 * e "simulação" de fila. A integração com Meshy/Rodin/Replicate/etc. entra
 * em processAvatarJob quando houver API.
 */

import type { AvatarBuildJob, AvatarBuildStatus, AvatarMediaRef, BodyScan, Persona } from "./types";
import { uid } from "./utils";

const MAX_PHOTOS = 24;
const MAX_VIDEOS = 4;
const MAX_FILE_MB = 25;

export const CAPTURE_GUIDE = [
  "Rosto de frente, boa luz, sem óculos escuros se possível",
  "Perfil esquerdo e direito (ou ¾)",
  "Corpo inteiro de frente (pés à cabeça) se quiser proporção correcta",
  "Vídeo curto a andar à volta da pessoa (10–20 s) melhora o volume",
  "Evitar filtros pesados e fotos muito antigas misturadas com recentes no mesmo pedido — ou indique a idade a representar no brief",
] as const;

export function validateMediaFile(file: File): string | null {
  const mb = file.size / (1024 * 1024);
  if (mb > MAX_FILE_MB) return `Ficheiro demasiado grande (máx. ${MAX_FILE_MB} MB nesta demo).`;
  const n = file.name.toLowerCase();
  const ok =
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".webp") ||
    n.endsWith(".mp4") ||
    n.endsWith(".webm") ||
    n.endsWith(".mov");
  if (!ok) return "Use foto (jpg/png/webp) ou vídeo (mp4/webm/mov).";
  return null;
}

export function kindFromFile(file: File): "photo" | "video" {
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name)) {
    return "video";
  }
  return "photo";
}

export function createDraftJob(personaId: string): AvatarBuildJob {
  const now = Date.now();
  return {
    id: uid("avjob"),
    personaId,
    status: "draft",
    path: "self_service",
    media: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function jobFromPersona(persona: Persona): AvatarBuildJob {
  return persona.bodyScan?.buildJob ?? createDraftJob(persona.id);
}

export function countMedia(job: AvatarBuildJob) {
  const photos = job.media.filter((m) => m.kind === "photo").length;
  const videos = job.media.filter((m) => m.kind === "video").length;
  return { photos, videos };
}

export function canQueue(job: AvatarBuildJob): { ok: true } | { ok: false; reason: string } {
  const { photos, videos } = countMedia(job);
  if (photos + videos === 0) {
    return { ok: false, reason: "Adicione pelo menos uma foto ou um vídeo." };
  }
  if (photos > MAX_PHOTOS) {
    return { ok: false, reason: `Máximo de ${MAX_PHOTOS} fotos por pedido.` };
  }
  if (videos > MAX_VIDEOS) {
    return { ok: false, reason: `Máximo de ${MAX_VIDEOS} vídeos por pedido.` };
  }
  return { ok: true };
}

export function queueSelfService(job: AvatarBuildJob): AvatarBuildJob {
  const check = canQueue(job);
  if (!check.ok) throw new Error(check.reason);
  return {
    ...job,
    path: "self_service",
    status: "queued_local",
    updatedAt: Date.now(),
    errorMessage: undefined,
  };
}

export function queueStudio(
  job: AvatarBuildJob,
  opts: { brief?: string; contactEmail?: string; heightM?: number },
): AvatarBuildJob {
  const check = canQueue(job);
  if (!check.ok) throw new Error(check.reason);
  return {
    ...job,
    path: "studio",
    status: "queued_studio",
    brief: opts.brief?.trim() || job.brief,
    contactEmail: opts.contactEmail?.trim() || job.contactEmail,
    estimatedHeightM: opts.heightM ?? job.estimatedHeightM,
    updatedAt: Date.now(),
    errorMessage: undefined,
  };
}

/**
 * Processamento nativo (placeholder).
 * Quando houver fornecedor: upload das media → job remoto → polling → GLB.
 */
export async function processAvatarJob(job: AvatarBuildJob): Promise<AvatarBuildJob> {
  if (job.status !== "queued_local" && job.status !== "processing") {
    return job;
  }
  // Demo: não há backend de reconstrução — marca needs_review com mensagem clara
  return {
    ...job,
    status: "needs_review",
    updatedAt: Date.now(),
    errorMessage:
      "Pipeline nativo ainda não está ligado a um gerador 3D. Use «Encomendar studio» ou exporte um GLB (Polycam / Meshy / Mixamo) e associe no painel do corpo.",
  };
}

/** Quando o studio / pipeline devolve o GLB. */
export function completeJobWithGlb(
  job: AvatarBuildJob,
  glbUrl: string,
  extras?: Partial<BodyScan>,
): { job: AvatarBuildJob; bodyScan: BodyScan } {
  const done: AvatarBuildJob = {
    ...job,
    status: "ready",
    resultGlbUrl: glbUrl,
    updatedAt: Date.now(),
    errorMessage: undefined,
  };
  const bodyScan: BodyScan = {
    glbUrl,
    heightM: job.estimatedHeightM ?? extras?.heightM ?? 1.7,
    source: job.path === "studio" ? "studio_order" : "media_pipeline",
    rigged: extras?.rigged ?? false,
    capturedAt: Date.now(),
    notes: job.brief,
    buildJob: done,
    ...extras,
  };
  return { job: done, bodyScan };
}

export function statusLabel(s: AvatarBuildStatus): string {
  const map: Record<AvatarBuildStatus, string> = {
    draft: "Rascunho",
    queued_local: "Na fila (app)",
    queued_studio: "Encomendado ao studio",
    processing: "A processar",
    needs_review: "Precisa de revisão",
    ready: "Pronto",
    failed: "Falhou",
    cancelled: "Cancelado",
  };
  return map[s];
}

/**
 * As media que podem seguir para o gerador 3D.
 *
 * O fornecedor descarrega a imagem por URL, portanto só serve o que está
 * publicamente acessível. E só https: uma data URL aqui seria mandar a foto
 * da família dentro do pedido, e `http://` mandá-la-ia em claro.
 *
 * Vive aqui e não no componente porque a mesma decisão era precisa nos dois
 * caminhos (self-service e studio) — duas cópias divergiriam.
 */
export function urlsParaFornecedor(media: readonly AvatarMediaRef[]): string[] {
  return media
    .filter((m) => m.kind === "photo")
    .map((m) => m.url)
    .filter((u): u is string => !!u && /^https:\/\//i.test(u));
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    reader.readAsDataURL(file);
  });
}

export function addMediaToJob(
  job: AvatarBuildJob,
  ref: Omit<AvatarMediaRef, "id" | "addedAt">,
): AvatarBuildJob {
  const { photos, videos } = countMedia(job);
  if (ref.kind === "photo" && photos >= MAX_PHOTOS) {
    throw new Error(`Máximo de ${MAX_PHOTOS} fotos.`);
  }
  if (ref.kind === "video" && videos >= MAX_VIDEOS) {
    throw new Error(`Máximo de ${MAX_VIDEOS} vídeos.`);
  }
  return {
    ...job,
    media: [...job.media, { ...ref, id: uid("avmed"), addedAt: Date.now() }],
    updatedAt: Date.now(),
    status: job.status === "ready" ? "draft" : job.status,
  };
}

/**
 * Carimba o instante da última alteração.
 *
 * Vive aqui, e não no componente, porque `Date.now()` no corpo de um
 * componente é impuro em render — o React Compiler assinala-o, e com razão:
 * um re-render daria um valor diferente. Aqui é uma função de módulo, chamada
 * no caminho de escrita.
 */
export function touchJob(job: AvatarBuildJob): AvatarBuildJob {
  return { ...job, updatedAt: Date.now() };
}
