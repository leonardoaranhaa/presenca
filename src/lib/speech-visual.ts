/**
 * Estado de "está a falar" para labial aproximado nas figuras 3D.
 * Emitido por speakPresence / TTS; consumido em figures.tsx.
 */

export type SpeechVisual = {
  personaId: string | null;
  until: number;
  intensity: number;
};

let current: SpeechVisual = { personaId: null, until: 0, intensity: 0 };
const listeners = new Set<(s: SpeechVisual) => void>();

export function onSpeechVisual(fn: (s: SpeechVisual) => void) {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

export function getSpeechVisual() {
  return current;
}

/** Marca persona a falar durante ~ms (labial). */
export function pulseSpeech(personaId: string, durationMs: number, intensity = 0.85) {
  current = {
    personaId,
    until: performance.now() + Math.max(200, durationMs),
    intensity,
  };
  for (const fn of listeners) fn(current);
}

/** Estima duração a partir do texto (fallback browser TTS). */
export function estimateSpeechMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12_000, Math.max(600, words * 380));
}
