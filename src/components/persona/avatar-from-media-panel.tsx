import { useMemo, useState } from "react";
import { Camera, Clapperboard, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAPTURE_GUIDE,
  addMediaToJob,
  completeJobWithGlb,
  jobFromPersona,
  kindFromFile,
  processAvatarJob,
  queueSelfService,
  queueStudio,
  readFileAsDataUrl,
  statusLabel,
  touchJob,
  validateMediaFile,
} from "@/lib/avatar-from-media";
import { featureAllowed, loadPrivacyPrefs } from "@/lib/lgpd";
import { usePresence } from "@/lib/store";
import type { AvatarBuildJob, Persona } from "@/lib/types";
import { validateGlbRef } from "@/lib/asset-pipeline";
import { GlbPreview } from "@/components/persona/glb-preview";
import { useAvatarJobPoll } from "@/lib/use-avatar-job-poll";

/**
 * UX: recriar avatar a partir de fotos/vídeos.
 * Caminho A — self-service (pipeline nativo quando existir).
 * Caminho B — encomenda studio (humano modela GLB).
 */
export function AvatarFromMediaPanel({ persona }: { persona: Persona }) {
  const upsert = usePresence((s) => s.upsertPersona);
  const initial = useMemo(() => jobFromPersona(persona), [persona]);
  const [job, setJob] = useState<AvatarBuildJob>(initial);
  const [brief, setBrief] = useState(initial.brief ?? "");
  const [email, setEmail] = useState(initial.contactEmail ?? "");
  const [height, setHeight] = useState(
    initial.estimatedHeightM ?? persona.bodyScan?.heightM ?? 1.7,
  );
  const [glbManual, setGlbManual] = useState(persona.bodyScan?.glbUrl ?? "");
  const [busy, setBusy] = useState(false);
  const {
    job: remoteJob,
    polling,
    error: pollError,
    errorFormatted,
    transient,
    start: startPoll,
    cancel: cancelPoll,
    clearError,
  } = useAvatarJobPoll();

  function persist(next: AvatarBuildJob, bodyExtras?: Parameters<typeof completeJobWithGlb>[2]) {
    // O carimbo é feito no único sítio por onde toda a escrita passa. A
    // função vive em lib/: Date.now() no corpo do componente é impuro em
    // render, e o React Compiler assinala-o.
    next = touchJob(next);
    setJob(next);
    if (next.status === "ready" && next.resultGlbUrl) {
      const v = validateGlbRef({
        url: next.resultGlbUrl,
        heightM: height,
        kind: "avatar",
      });
      if (!v.ok) {
        toast.error(v.errors[0] ?? "GLB inválido");
        return;
      }
      for (const w of v.warnings) toast.message(w);
      const { bodyScan } = completeJobWithGlb(next, next.resultGlbUrl, bodyExtras);
      upsert({ ...persona, bodyScan });
      toast.success("Avatar no lar — entre no mundo para ver.");
      return;
    }
    upsert({
      ...persona,
      bodyScan: {
        ...persona.bodyScan,
        heightM: height,
        buildJob: next,
        glbUrl: persona.bodyScan?.glbUrl,
        source: persona.bodyScan?.source,
      },
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!featureAllowed("allowBodyScan", loadPrivacyPrefs())) {
      toast.error("Scan/avatar desativado nas preferências de privacidade.");
      return;
    }
    let next = job;
    for (const file of Array.from(files)) {
      const err = validateMediaFile(file);
      if (err) {
        toast.error(err);
        continue;
      }
      try {
        const url = await readFileAsDataUrl(file);
        next = addMediaToJob(next, {
          kind: kindFromFile(file),
          url,
          name: file.name,
          angle: "other",
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao ler ficheiro");
      }
    }
    persist(next);
  }

  async function tryNative() {
    setBusy(true);
    try {
      let next = queueSelfService({ ...job, brief, estimatedHeightM: height });
      const photos = next.media.filter((m) => m.kind === "photo").length;
      const videos = next.media.filter((m) => m.kind === "video").length;
      const imageUrls = next.media
        .filter((m) => m.kind === "photo" && /^https?:\/\//i.test(m.url))
        .map((m) => m.url);

      persist(next);
      toast.message("Job criado — polling assíncrono…");

      const remote = await startPoll({
        personaId: persona.id,
        path: "self_service",
        brief,
        estimatedHeightM: height,
        photoCount: photos,
        videoCount: videos,
        imageUrls,
      });

      if (!remote.ok) {
        next = await processAvatarJob(next);
        persist(next);
        toast.message("Servidor de jobs indisponível — modo local", {
          description: remote.error,
        });
        return;
      }

      const rj = remote.job;
      next = {
        ...next,
        id: rj.id,
        status:
          rj.status === "ready"
            ? "ready"
            : rj.status === "failed"
              ? "failed"
              : rj.status === "needs_provider"
                ? "needs_review"
                : "queued_local",
        errorMessage: rj.message,
        resultGlbUrl: rj.resultGlbUrl,
      };

      if (rj.status === "ready" && rj.resultGlbUrl) {
        const { job: done, bodyScan } = completeJobWithGlb(
          { ...next, estimatedHeightM: height, brief },
          rj.resultGlbUrl,
        );
        setJob(done);
        upsert({ ...persona, bodyScan });
        setGlbManual(rj.resultGlbUrl);
        toast.success("Avatar pronto.");
        return;
      }
      persist(next);
      toast.message(rj.message || "Aguardando gerador 3D ou GLB manual.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enfileirar");
    } finally {
      setBusy(false);
    }
  }

  async function orderStudio() {
    setBusy(true);
    try {
      const next = queueStudio(
        { ...job, brief, estimatedHeightM: height },
        { brief, contactEmail: email, heightM: height },
      );
      const photos = next.media.filter((m) => m.kind === "photo").length;
      const videos = next.media.filter((m) => m.kind === "video").length;
      const imageUrls = next.media
        .filter((m) => m.kind === "photo" && /^https?:\/\//i.test(m.url))
        .map((m) => m.url);

      const remote = await startPoll({
        personaId: persona.id,
        path: "studio",
        brief,
        contactEmail: email || undefined,
        estimatedHeightM: height,
        photoCount: photos,
        videoCount: videos,
        imageUrls,
      });

      if (remote.ok) {
        persist({
          ...next,
          id: remote.job.id,
          status: "queued_studio",
          errorMessage: remote.job.message,
        });
        toast.success("Pedido studio no servidor", {
          description: remote.job.message || remote.job.id,
        });
      } else {
        persist(next);
        toast.success("Pedido studio (só neste aparelho)", {
          description: remote.error + " — quando tiverem o GLB, associem abaixo.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível encomendar");
    } finally {
      setBusy(false);
    }
  }

  function applyGlb() {
    const url = glbManual.trim();
    if (!url) {
      toast.error("Indique a URL ou caminho do GLB.");
      return;
    }
    const { job: done, bodyScan } = completeJobWithGlb(
      { ...job, brief, estimatedHeightM: height },
      url,
      { heightM: height, rigged: false },
    );
    setJob(done);
    upsert({ ...persona, bodyScan });
    toast.success("Avatar GLB associado à presença.");
  }

  function removeMedia(id: string) {
    const next = {
      ...job,
      media: job.media.filter((m) => m.id !== id),
    };
    persist(next);
  }

  const photos = job.media.filter((m) => m.kind === "photo");
  const videos = job.media.filter((m) => m.kind === "video");

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">Avatar a partir de fotos e vídeos</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Para {persona.name} ({persona.kind === "memorial" ? "memorial" : "vivo"}). Reúna media;
            a app tenta o caminho automático quando existir gerador 3D, ou regista uma{" "}
            <strong className="text-foreground">encomenda studio</strong> para modelação humana.
          </p>
          <p className="mt-2 text-xs text-faint">
            Estado: <span className="text-foreground">{statusLabel(job.status)}</span>
            {job.path === "studio" ? " · studio" : " · self-service"}
            {polling && remoteJob && (
              <>
                {" · "}
                <span className="text-accent">
                  servidor: {remoteJob.status}
                  {remoteJob.message ? ` — ${remoteJob.message}` : ""}
                </span>
              </>
            )}
            {transient && polling && (
              <>
                {" · "}
                <span className="text-amber-500/90">{transient}</span>
              </>
            )}
            {errorFormatted && !polling && (
              <>
                {" · "}
                <span className="text-rose-400">
                  {errorFormatted.title}: {errorFormatted.detail}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-xs text-faint">
        {CAPTURE_GUIDE.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>

      <div>
        <Label htmlFor="av-media">Adicionar fotos ou vídeos</Label>
        <Input
          id="av-media"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          className="mt-1.5 cursor-pointer"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <p className="mt-1 text-[11px] text-faint">
          {photos.length} foto(s) · {videos.length} vídeo(s) · ficam neste aparelho até haver upload
          de produção
        </p>
      </div>

      {job.media.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {job.media.map((m) => (
            <li key={m.id} className="relative overflow-hidden rounded-md bg-surface-2">
              {m.kind === "photo" ? (
                <img src={m.url} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-faint">
                  <Clapperboard className="size-6" />
                </div>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-background/80 px-1.5 text-[10px]"
                onClick={() => removeMedia(m.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="av-brief">Brief (roupa, idade a representar, pormenores)</Label>
          <Textarea
            id="av-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="Ex.: camisa xadrez, uns 60 anos, sorriso contido…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="av-h">Altura estimada (m)</Label>
          <Input
            id="av-h"
            type="number"
            step="0.01"
            min={1}
            max={2.3}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 1.7)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="av-email">Email (só para encomenda studio)</Label>
          <Input
            id="av-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="opcional"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void tryNative()}>
          <Camera className="size-4" />
          Tentar pipeline na app
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void orderStudio()}>
          <Truck className="size-4" />
          Encomendar studio
        </Button>
        {polling && (
          <Button type="button" variant="outline" onClick={cancelPoll}>
            Cancelar espera
          </Button>
        )}
      </div>

      {job.errorMessage && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">{job.errorMessage}</p>
      )}

      {errorFormatted && !polling && (
        <div
          className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs"
          role="alert"
        >
          <p className="font-medium text-foreground">{errorFormatted.title}</p>
          <p className="mt-1 text-muted">{errorFormatted.detail}</p>
          {pollError?.retryable && (
            <button
              type="button"
              className="mt-2 text-accent underline"
              onClick={() => clearError()}
            >
              Dispensar
            </button>
          )}
        </div>
      )}

      {(glbManual.trim() || persona.bodyScan?.glbUrl) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pré-visualização 3D</p>
          <GlbPreview url={glbManual.trim() || persona.bodyScan?.glbUrl || ""} heightM={height} />
        </div>
      )}

      <div className="border-t border-border/50 pt-4">
        <p className="text-sm font-medium">Já tem um GLB pronto?</p>
        <p className="mt-1 text-xs text-faint">
          Polycam, RealityScan, Meshy, Rodin, Mixamo, ou entrega do studio — cole a URL ou caminho
          público.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={glbManual}
            onChange={(e) => setGlbManual(e.target.value)}
            placeholder="/avatars/nome.glb ou https://…"
            className="min-w-[12rem] flex-1"
          />
          <Button type="button" variant="outline" onClick={applyGlb}>
            Associar GLB
          </Button>
        </div>
      </div>
    </Card>
  );
}
