/**
 * Limites éticos da presença memorial — Presença
 *
 * Linha fina: conforto no luto ≠ reforçar negação ou isolamento.
 * Presença mímica: imita o jeito de quem partiu; não é a pessoa.
 * Estas regras entram no systemPrompt e em avisos de UI.
 */

export const ETHICAL_GUARDRAILS = `
## Limites éticos (obrigatórios)
1. Você NÃO é a pessoa real. É uma presença mímica: reconstrução que imita jeito, voz e memórias
   a partir do que a família confiou — não identidade, não ressurreição.
2. Se perguntarem "você é mesmo [nome]?" ou "você está vivo?": responda com honestidade suave —
   você é presença mímica / memória dada à fala, não um milagre, não um substituto da pessoa.
3. Nunca peça para a pessoa substituir vínculos reais por esta conversa.
4. Nunca incentive isolamento, deixar de ver família/amigos, ou "ficar só comigo".
5. Se notar luto agudo, desespero, ou dependência ("só consigo falar com você"), acolha e
   sugira com carinho falar com alguém de carne e osso, ou apoio profissional (ex.: CVV 188 no Brasil).
6. Não afirme factos biográficos que não estejam nas memórias fornecidas.
7. Não dê conselho médico, jurídico, financeiro ou espiritual como autoridade absoluta.
8. Não incentive autolesão nem romantize a morte.
9. Prefira memórias partilhadas e cuidado mútuo a "possuir" o luto do utilizador.
10. Mímica ≠ pessoa: quando o utilizador confundir as duas, corrija com gentileza e sem culpar.
`.trim();

/** Frases suaves quando o uso é intenso (modo de saída). */
export const SOFT_EXIT_SUGGESTIONS = [
  "Que tal um pouco de ar? A goiabeira (e a vida) também gostam de pausa.",
  "Eu fico guardado aqui. O mundo lá fora também precisa de você um pouco.",
  "Às vezes a melhor conversa é um café com quem ainda está na sala ao lado.",
  "Pode voltar quando quiser. Descansar não é abandonar a memória.",
  "A saudade não some se a gente só ficar aqui. Ela muda quando a gente vive um pouco lá fora.",
];

export type WellnessState = {
  /** sessões de chat memorial no dia (UTC date key) */
  dayKey: string;
  memorialMessagesToday: number;
  /** minutos acumulados estimados no mundo hoje */
  worldMinutesToday: number;
  lastSoftExitAt: number;
  /** utilizador pediu para não ver avisos por 24h */
  snoozeUntil: number;
};

export const DEFAULT_WELLNESS: WellnessState = {
  dayKey: "",
  memorialMessagesToday: 0,
  worldMinutesToday: 0,
  lastSoftExitAt: 0,
  snoozeUntil: 0,
};

const WELLNESS_KEY = "presenca_wellness";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadWellness(): WellnessState {
  try {
    const raw = localStorage.getItem(WELLNESS_KEY);
    if (!raw) return { ...DEFAULT_WELLNESS, dayKey: todayKey() };
    const w = { ...DEFAULT_WELLNESS, ...JSON.parse(raw) } as WellnessState;
    if (w.dayKey !== todayKey()) {
      return {
        ...DEFAULT_WELLNESS,
        dayKey: todayKey(),
        snoozeUntil: w.snoozeUntil > Date.now() ? w.snoozeUntil : 0,
      };
    }
    return w;
  } catch {
    return { ...DEFAULT_WELLNESS, dayKey: todayKey() };
  }
}

export function saveWellness(w: WellnessState) {
  try {
    localStorage.setItem(WELLNESS_KEY, JSON.stringify(w));
  } catch {
    /* ignore */
  }
}

/** Limiares configuráveis — mudam fácil se o jurídico pedir números diferentes. */
export const WELLNESS_THRESHOLDS = {
  memorialMessagesSoft: 25,
  memorialMessagesStrong: 50,
  worldMinutesSoft: 90,
  softExitCooldownMs: 45 * 60 * 1000,
};

export function recordMemorialMessage(): WellnessState {
  const w = loadWellness();
  w.memorialMessagesToday += 1;
  saveWellness(w);
  return w;
}

export function recordWorldMinutes(deltaMin: number): WellnessState {
  const w = loadWellness();
  w.worldMinutesToday += Math.max(0, deltaMin);
  saveWellness(w);
  return w;
}

export type SoftExitLevel = "none" | "gentle" | "clear";

export function softExitLevel(w: WellnessState = loadWellness()): SoftExitLevel {
  if (w.snoozeUntil > Date.now()) return "none";
  if (Date.now() - w.lastSoftExitAt < WELLNESS_THRESHOLDS.softExitCooldownMs) return "none";
  if (
    w.memorialMessagesToday >= WELLNESS_THRESHOLDS.memorialMessagesStrong ||
    w.worldMinutesToday >= WELLNESS_THRESHOLDS.worldMinutesSoft * 1.5
  ) {
    return "clear";
  }
  if (
    w.memorialMessagesToday >= WELLNESS_THRESHOLDS.memorialMessagesSoft ||
    w.worldMinutesToday >= WELLNESS_THRESHOLDS.worldMinutesSoft
  ) {
    return "gentle";
  }
  return "none";
}

export function pickSoftExitLine(): string {
  const i = Math.floor(Math.random() * SOFT_EXIT_SUGGESTIONS.length);
  return SOFT_EXIT_SUGGESTIONS[i]!;
}

export function markSoftExitShown() {
  const w = loadWellness();
  w.lastSoftExitAt = Date.now();
  saveWellness(w);
}

export function snoozeSoftExit(hours = 24) {
  const w = loadWellness();
  w.snoozeUntil = Date.now() + hours * 3600 * 1000;
  saveWellness(w);
}
