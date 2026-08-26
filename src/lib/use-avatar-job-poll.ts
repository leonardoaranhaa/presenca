import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRemoteAvatarJob,
  isTerminalStatus,
  pollAvatarJobAsync,
  type RemoteAvatarJob,
} from "./avatar-api";
import { type AvatarError, errorFromCaught, formatAvatarError } from "./avatar-errors";

type CreateBody = Parameters<typeof createRemoteAvatarJob>[0];

/**
 * Cria job + polling assíncrono com erros tipados e cancel no unmount.
 */
export function useAvatarJobPoll() {
  const [job, setJob] = useState<RemoteAvatarJob | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<AvatarError | null>(null);
  const [transient, setTransient] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPolling(false);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const start = useCallback(
    async (body: CreateBody) => {
      cancel();
      setError(null);
      setTransient(null);
      setPolling(true);

      const created = await createRemoteAvatarJob(body);
      if (!created.ok) {
        setPolling(false);
        setError(created.err);
        return { ok: false as const, error: created.error, err: created.err };
      }

      setJob(created.job);

      if (isTerminalStatus(created.job.status)) {
        setPolling(false);
        return { ok: true as const, job: created.job };
      }

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const result = await pollAvatarJobAsync(created.job.id, {
          signal: ac.signal,
          timeoutMs: 180_000,
          intervalMs: 700,
          onUpdate: (j) => {
            setJob(j);
            setTransient(null);
          },
          onTransientError: (err, attempt) => {
            setTransient(`${formatAvatarError(err).title} (tentativa ${attempt}) — a retentar…`);
          },
        });
        if (!result.ok) {
          if (!ac.signal.aborted) setError(result.err);
          setPolling(false);
          setTransient(null);
          return result;
        }
        setJob(result.job);
        setPolling(false);
        setTransient(null);
        return result;
      } catch (e) {
        const err = errorFromCaught(e);
        if (!ac.signal.aborted) setError(err);
        setPolling(false);
        setTransient(null);
        return { ok: false as const, error: err.message, err };
      }
    },
    [cancel],
  );

  return {
    job,
    polling,
    error,
    transient,
    errorFormatted: error ? formatAvatarError(error) : null,
    start,
    cancel,
    setJob,
    clearError: () => setError(null),
  };
}
