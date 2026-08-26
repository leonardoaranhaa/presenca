/**
 * Gestos procedurais em malhas GLB sem bones/clips.
 * Abraço / mão / ombro: envelope 0–1 → scale, pitch, lean.
 */
import type { SensationGesture } from "@/lib/sensation";

export type GlbGestureState = {
  gesture: SensationGesture | null;
  amount: number;
  until: number;
  armOpen: number;
  holdBias: number;
};

export function emptyGlbGesture(): GlbGestureState {
  return {
    gesture: null,
    amount: 0,
    until: 0,
    armOpen: 0.85,
    holdBias: 0.55,
  };
}

/** Envelope temporal: sobe rápido, mantém, desce. */
export function gestureEnvelope(now: number, until: number, durationMs: number): number {
  if (now >= until || durationMs <= 0) return 0;
  const left = until - now;
  const e = 1 - left / durationMs;
  if (e < 0.18) return e / 0.18;
  if (e < 0.7) return 1;
  return Math.max(0, 1 - (e - 0.7) / 0.3);
}

export type GlbGestureMotion = {
  /** escala XZ (abrir peito no abraço) */
  scaleXZ: number;
  /** escala Y (encolher ligeiro) */
  scaleY: number;
  /** pitch (rad) — inclinar para a frente */
  pitch: number;
  /** offset Y (m) */
  y: number;
  /** intensidade do glow 0–1 */
  glow: number;
};

export function motionFromGesture(
  gesture: SensationGesture | null,
  amount: number,
): GlbGestureMotion {
  const a = Math.max(0, Math.min(1, amount));
  if (!gesture || a < 0.01) {
    return { scaleXZ: 1, scaleY: 1, pitch: 0, y: 0, glow: 0 };
  }
  switch (gesture) {
    case "hug":
      return {
        scaleXZ: 1 + 0.08 * a,
        scaleY: 1 - 0.04 * a,
        pitch: -0.12 * a,
        y: -0.02 * a,
        glow: 0.55 * a,
      };
    case "hand":
      return {
        scaleXZ: 1 + 0.03 * a,
        scaleY: 1,
        pitch: -0.04 * a,
        y: 0,
        glow: 0.25 * a,
      };
    case "shoulder":
      return {
        scaleXZ: 1 + 0.04 * a,
        scaleY: 1 - 0.02 * a,
        pitch: -0.06 * a,
        y: 0,
        glow: 0.35 * a,
      };
    case "cheek_kiss":
    case "forehead_touch":
    case "cheek_caress":
    case "temple_press":
    case "nose_boop":
    case "farewell_cheek":
      return {
        scaleXZ: 1 + 0.02 * a,
        scaleY: 1,
        pitch: -0.05 * a,
        y: 0.01 * a,
        glow: 0.4 * a,
      };
    default:
      return { scaleXZ: 1, scaleY: 1, pitch: 0, y: 0, glow: 0.15 * a };
  }
}

export const GESTURE_DEFAULT_MS: Partial<Record<SensationGesture, number>> = {
  hug: 1600,
  hand: 900,
  shoulder: 1100,
  presence: 800,
  cheek_kiss: 900,
  forehead_touch: 900,
  cheek_caress: 1000,
  temple_press: 900,
  nose_boop: 700,
  farewell_cheek: 1000,
};
