import { useEffect, useState } from "react";
import { getMediaUrl } from "./media-store";

/**
 * URL temporária para mostrar uma media guardada no IndexedDB.
 *
 * Trata o ciclo de vida do object URL: sem o revoke, cada foto mostrada
 * retinha o blob em memória até fechar o separador — e o cofre mostra todas
 * as memórias de uma vez.
 *
 * Aceita `fallbackDataUrl` para os dados anteriores à migração continuarem a
 * aparecer enquanto a migração não corre.
 */
export function useMediaUrl(mediaId?: string, fallbackDataUrl?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(fallbackDataUrl);

  useEffect(() => {
    if (!mediaId) {
      setUrl(fallbackDataUrl);
      return;
    }
    let vivo = true;
    let criada: string | null = null;

    void getMediaUrl(mediaId).then((u) => {
      if (!vivo) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      criada = u;
      setUrl(u ?? fallbackDataUrl);
    });

    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [mediaId, fallbackDataUrl]);

  return url;
}
