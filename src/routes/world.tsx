import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { ErrorState } from "@/components/feedback/error-state";

export const Route = createFileRoute("/world")({
  component: WorldPage,
});

/**
 * O mundo pesa ~1 MB e só existe no browser, por isso é carregado à parte.
 *
 * Três falhas reais tratadas aqui, que antes deixavam o ecrã preso em
 * "Abrindo o lar…" para sempre:
 *  - o chunk não carrega (rede, ou 404 depois de um redeploy);
 *  - o aparelho não tem WebGL — provável em telemóveis antigos, e este
 *    produto é para a família toda, não só para quem tem telefone novo;
 *  - a cena rebenta a meio (GLB inválido, contexto de WebGL perdido).
 */
function WorldPage() {
  const [Client, setClient] = useState<ComponentType | null>(null);
  const [falha, setFalha] = useState<Error | null>(null);
  const [semWebgl, setSemWebgl] = useState(false);

  useEffect(() => {
    if (!temWebgl()) {
      setSemWebgl(true);
      return;
    }
    let vivo = true;
    import("@/components/world/experience")
      .then((m) => {
        if (vivo) setClient(() => m.WorldExperience);
      })
      .catch((e: unknown) => {
        if (vivo) setFalha(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (semWebgl) {
    return (
      <ErrorState
        title="Este aparelho não consegue desenhar o lar."
        error={new Error("WebGL indisponível ou desativado neste browser.")}
      />
    );
  }

  if (falha) {
    return (
      <ErrorState
        title="O lar não abriu."
        error={falha}
        reset={() => {
          setFalha(null);
          location.reload();
        }}
      />
    );
  }

  if (!Client) {
    return (
      <div
        className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-muted"
        role="status"
        aria-live="polite"
      >
        <div className="size-8 animate-spin rounded-full border-2 border-faint border-t-foreground" />
        <p className="text-sm">Abrindo o lar…</p>
      </div>
    );
  }

  return (
    <ErrorBoundary title="O lar fechou-se de repente.">
      <Client />
    </ErrorBoundary>
  );
}

/** Deteta WebGL sem manter o contexto aberto. */
function temWebgl(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
