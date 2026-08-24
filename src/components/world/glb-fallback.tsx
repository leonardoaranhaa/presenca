import { Component, type ErrorInfo, type ReactNode, useState, useCallback } from "react";
import { toast } from "sonner";

type BoundaryProps = {
  children: ReactNode;
  /** UI alternativa (cápsula, simple-room, null) */
  fallback: ReactNode;
  /** Identificador para log / toast */
  label?: string;
  /** Chamado uma vez quando o GLB falha */
  onError?: (error: Error) => void;
  /** Se false, não mostra toast (ex.: vários peers) */
  notify?: boolean;
};

type BoundaryState = { error: Error | null };

/**
 * Captura falhas de useGLTF / decode meshopt / rede.
 * Suspense só cobre "a carregar"; erros de load precisam de boundary.
 */
export class GlbErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      "[presenca] GLB fallback:",
      this.props.label ?? "asset",
      error.message,
      info.componentStack,
    );
    this.props.onError?.(error);
    if (this.props.notify !== false && typeof window !== "undefined") {
      try {
        toast.message("Avatar 3D indisponível", {
          description: "A mostrar silhueta até o modelo carregar correctamente.",
        });
      } catch {
        /* sonner pode não estar montado em testes */
      }
    }
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Hook-style controlo: marca falha e força fallback sem depender só do boundary
 * (útil quando o loader resolve com cena vazia).
 */
export function useGlbLoadGate(url: string | undefined | null) {
  const [failed, setFailed] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Nova URL = nova tentativa
  if (url && failedUrl && url !== failedUrl && failed) {
    setFailed(false);
    setFailedUrl(null);
  }

  const markFailed = useCallback(
    (err?: unknown) => {
      if (url) setFailedUrl(url);
      setFailed(true);
      if (err) console.warn("[presenca] GLB markFailed", url, err);
    },
    [url],
  );

  return {
    failed: failed && (!url || failedUrl === url),
    markFailed,
    reset: () => {
      setFailed(false);
      setFailedUrl(null);
    },
  };
}
