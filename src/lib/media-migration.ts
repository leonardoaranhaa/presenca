import { dataUrlToBlob, putMedia } from "./media-store";
import type { Persona } from "./types";

/**
 * Move para IndexedDB as media que ficaram gravadas como data URL no estado.
 *
 * Corre uma vez, depois da rehidratação. Quem já usava a app tem as memórias
 * em base64 dentro do localStorage; sem esta passagem, continuariam a ocupar a
 * quota e a impedir memórias novas.
 *
 * Conservadora de propósito: só limpa `mediaDataUrl` depois de o blob estar
 * mesmo gravado. Se o IndexedDB falhar, os dados ficam onde estavam — pior é
 * apagar a foto de alguém.
 */
export async function migrateMediaToIndexedDb(
  personas: Persona[],
): Promise<{ personas: Persona[]; migradas: number }> {
  let migradas = 0;

  const migradasPersonas = await Promise.all(
    personas.map(async (p) => {
      const precisa = p.memories.some((m) => m.mediaDataUrl && !m.mediaId);
      if (!precisa) return p;

      const memories = await Promise.all(
        p.memories.map(async (m) => {
          if (!m.mediaDataUrl || m.mediaId) return m;
          const blob = dataUrlToBlob(m.mediaDataUrl);
          if (!blob) {
            // Data URL corrompida: tirar o campo evita arrastar lixo para sempre.
            const { mediaDataUrl: _antigo, ...resto } = m;
            return resto;
          }
          try {
            const mediaId = await putMedia(blob, { personaId: p.id });
            migradas++;
            const { mediaDataUrl: _antigo, ...resto } = m;
            return { ...resto, mediaId };
          } catch {
            return m; // fica como está; tenta-se de novo na próxima sessão
          }
        }),
      );

      return { ...p, memories };
    }),
  );

  return { personas: migradasPersonas, migradas };
}
