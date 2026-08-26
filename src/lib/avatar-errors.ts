/**
 * Erros tipados do fluxo de avatar (cliente + mensagens para a UI).
 */

export type AvatarErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "rate_limited"
  | "validation"
  | "not_found"
  | "server"
  | "provider"
  | "needs_provider"
  | "no_https_image"
  | "glb_load"
  | "unknown";

export type AvatarError = {
  code: AvatarErrorCode;
  message: string;
  /** HTTP status se aplicável */
  status?: number;
  /** Pode tentar de novo? */
  retryable: boolean;
};

export function avatarError(
  code: AvatarErrorCode,
  message: string,
  opts?: { status?: number; retryable?: boolean },
): AvatarError {
  const retryable =
    opts?.retryable ??
    (code === "network" || code === "timeout" || code === "rate_limited" || code === "server");
  return { code, message, status: opts?.status, retryable };
}

export function isAvatarError(x: unknown): x is AvatarError {
  return typeof x === "object" && x !== null && "code" in x && "message" in x && "retryable" in x;
}

/** Interpreta resposta HTTP / corpo de erro da API. */
export function errorFromHttp(
  status: number,
  body: { error?: string; message?: string } | null,
): AvatarError {
  const msg =
    body?.error ||
    body?.message ||
    (status === 429
      ? "Demasiados pedidos. Espere um momento e tente de novo."
      : status === 404
        ? "Job de avatar não encontrado (pode ter expirado no servidor)."
        : status === 400
          ? "Pedido inválido."
          : status >= 500
            ? "O servidor de avatares falhou. Tente mais tarde."
            : `Erro HTTP ${status}.`);

  if (status === 429) return avatarError("rate_limited", msg, { status, retryable: true });
  if (status === 404) return avatarError("not_found", msg, { status, retryable: false });
  if (status === 400) return avatarError("validation", msg, { status, retryable: false });
  if (status >= 500) return avatarError("server", msg, { status, retryable: true });
  return avatarError("unknown", msg, { status, retryable: status >= 500 });
}

export function errorFromCaught(e: unknown): AvatarError {
  if (isAvatarError(e)) return e;
  if (e instanceof DOMException && e.name === "AbortError") {
    return avatarError("aborted", "Operação cancelada.", { retryable: false });
  }
  if (e instanceof TypeError) {
    return avatarError("network", "Sem ligação à rede. Verifique a internet.", {
      retryable: true,
    });
  }
  if (e instanceof Error) {
    return avatarError("unknown", e.message || "Erro inesperado.", { retryable: true });
  }
  return avatarError("unknown", "Erro inesperado.", { retryable: true });
}

/** Mensagem amigável + dica de ação. */
export function formatAvatarError(err: AvatarError): { title: string; detail: string } {
  switch (err.code) {
    case "network":
      return {
        title: "Sem rede",
        detail: err.message + " O pedido ficou só neste aparelho se usou o modo local.",
      };
    case "timeout":
      return {
        title: "Demorou demasiado",
        detail: err.message + " Pode tentar de novo ou associar um GLB manualmente.",
      };
    case "aborted":
      return { title: "Cancelado", detail: "A espera pelo servidor foi interrompida." };
    case "rate_limited":
      return {
        title: "Muitos pedidos",
        detail: err.message,
      };
    case "validation":
      return { title: "Dados inválidos", detail: err.message };
    case "not_found":
      return {
        title: "Job em falta",
        detail: err.message + " Crie um novo pedido.",
      };
    case "needs_provider":
    case "no_https_image":
      return {
        title: "Gerador 3D indisponível",
        detail: err.message,
      };
    case "provider":
      return {
        title: "Falha no gerador 3D",
        detail: err.message + " Tente outra foto ou o caminho studio.",
      };
    case "glb_load":
      return {
        title: "GLB não carregou",
        detail: err.message + " Confirme a URL e o formato .glb.",
      };
    case "server":
      return { title: "Erro no servidor", detail: err.message };
    default:
      return { title: "Algo falhou", detail: err.message };
  }
}
