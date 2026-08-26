/**
 * Cliente da fila de avatar — /api/avatar/jobs
 * Polling assíncrono + erros tipados.
 */

import { avatarError, errorFromCaught, errorFromHttp, type AvatarError } from "./avatar-errors";

export type RemoteAvatarJob = {
  id: string;
  personaId: string;
  path: "self_service" | "studio";
  status: "queued" | "processing" | "needs_provider" | "ready" | "failed";
  brief?: string;
  contactEmail?: string;
  estimatedHeightM?: number;
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  externalId?: string;
  createdAt: number;
  updatedAt: number;
  resultGlbUrl?: string;
  message?: string;
};

export type AvatarJobResult =
  { ok: true; job: RemoteAvatarJob } | { ok: false; error: string; err: AvatarError };

const TERMINAL = new Set(["ready", "failed", "needs_provider"]);

export function isTerminalStatus(status: RemoteAvatarJob["status"]): boolean {
  return TERMINAL.has(status);
}

async function parseJson(
  res: Response,
): Promise<{ job?: RemoteAvatarJob; error?: string; message?: string } | null> {
  try {
    return (await res.json()) as {
      job?: RemoteAvatarJob;
      error?: string;
      message?: string;
    };
  } catch {
    return null;
  }
}

function fail(err: AvatarError): AvatarJobResult {
  return { ok: false, error: err.message, err };
}

export async function createRemoteAvatarJob(body: {
  personaId: string;
  path: "self_service" | "studio";
  brief?: string;
  contactEmail?: string;
  estimatedHeightM?: number;
  photoCount: number;
  videoCount: number;
  imageUrls?: string[];
}): Promise<AvatarJobResult> {
  try {
    const res = await fetch("/api/avatar/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.job) {
      return fail(errorFromHttp(res.status, data));
    }
    return { ok: true, job: data.job };
  } catch (e) {
    return fail(errorFromCaught(e));
  }
}

export async function pollRemoteAvatarJob(
  id: string,
  signal?: AbortSignal,
): Promise<AvatarJobResult> {
  try {
    const res = await fetch(`/api/avatar/jobs/${encodeURIComponent(id)}`, {
      signal,
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.job) {
      return fail(errorFromHttp(res.status, data));
    }
    return { ok: true, job: data.job };
  } catch (e) {
    return fail(errorFromCaught(e));
  }
}

export type PollAvatarOptions = {
  intervalMs?: number;
  backoff?: number;
  maxIntervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (job: RemoteAvatarJob) => void;
  /** Chamado em erros transitórios antes de retentar (rede, 5xx). */
  onTransientError?: (err: AvatarError, attempt: number) => void;
  /** Quantas falhas de rede consecutivas antes de desistir. Default 5. */
  maxConsecutiveFailures?: number;
  signal?: AbortSignal;
};

export async function pollAvatarJobAsync(
  id: string,
  opts: PollAvatarOptions = {},
): Promise<AvatarJobResult> {
  const interval0 = opts.intervalMs ?? 700;
  const backoff = opts.backoff ?? 1.25;
  const maxInterval = opts.maxIntervalMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const maxFail = opts.maxConsecutiveFailures ?? 5;
  const signal = opts.signal;
  const start = Date.now();
  let interval = interval0;
  let lastJob: RemoteAvatarJob | undefined;
  let consecutiveFailures = 0;

  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) {
      return fail(avatarError("aborted", "Polling cancelado.", { retryable: false }));
    }

    const r = await pollRemoteAvatarJob(id, signal);
    if (!r.ok) {
      if (r.err.code === "aborted") return r;
      consecutiveFailures += 1;
      opts.onTransientError?.(r.err, consecutiveFailures);

      if (!r.err.retryable || consecutiveFailures >= maxFail) {
        return r;
      }
      await sleep(interval, signal).catch(() => undefined);
      interval = Math.min(maxInterval, Math.round(interval * backoff));
      continue;
    }

    consecutiveFailures = 0;
    lastJob = r.job;
    opts.onUpdate?.(r.job);

    if (isTerminalStatus(r.job.status)) {
      if (r.job.status === "failed") {
        return fail(
          avatarError("provider", r.job.message || "O job de avatar falhou.", {
            retryable: true,
          }),
        );
      }
      if (r.job.status === "needs_provider") {
        // Não é falha fatal — o caller trata o job
        return r;
      }
      return r;
    }

    try {
      await sleep(interval, signal);
    } catch {
      return fail(avatarError("aborted", "Polling cancelado.", { retryable: false }));
    }
    interval = Math.min(maxInterval, Math.round(interval * backoff));
  }

  return fail(
    avatarError(
      "timeout",
      lastJob
        ? `Tempo esgotado (último estado: ${lastJob.status}).`
        : "Tempo esgotado a aguardar o job.",
      { retryable: true },
    ),
  );
}

export async function waitForAvatarJob(
  id: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<AvatarJobResult> {
  return pollAvatarJobAsync(id, {
    intervalMs: opts?.intervalMs ?? 800,
    timeoutMs: opts?.timeoutMs ?? 30_000,
  });
}

export async function completeRemoteAvatarJob(
  id: string,
  resultGlbUrl: string,
): Promise<AvatarJobResult> {
  try {
    const res = await fetch(`/api/avatar/jobs/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultGlbUrl }),
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.job) {
      return fail(errorFromHttp(res.status, data));
    }
    return { ok: true, job: data.job };
  } catch (e) {
    return fail(errorFromCaught(e));
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
