/**
 * Háptica facial personalizada — Presença
 *
 * Regiões do rosto para hardware futuro (máscara VR, patch cutâneo, óculos)
 * e fallback no telefone (vibração curta assimétrica).
 *
 * Personalização: relação, traços, memorial, lado preferido, intensidade facial.
 * Ética: opt-in separado (facialConsent) + memorialConsent já existente.
 */

import type { HugContext } from "./sensation";

export type FaceRegion =
  "forehead" | "left_cheek" | "right_cheek" | "jaw" | "temple_left" | "temple_right" | "bridge"; // nariz / ponte — toque muito leve

export type FacialGesture =
  | "cheek_kiss" // beijo no rosto (familiar)
  | "forehead_touch" // mão na testa (conforto / bênção)
  | "cheek_caress" // carícia na face
  | "temple_press" // apoio nas têmporas (calma)
  | "nose_boop" // leve, lúdico
  | "farewell_cheek"; // despedida no rosto

export type FacialPattern = {
  frameMs: number;
  /** amostras 0–1 por região */
  regions: Partial<Record<FaceRegion, number[]>>;
  durationMs: number;
  intensity: number;
  gesture: FacialGesture;
  /** lado dominante para animação do avatar */
  side: "left" | "right" | "both";
};

export type FacialPrefs = {
  enabled: boolean;
  /** Consentimento explícito para háptica no rosto */
  facialConsent: boolean;
  intensityScale: number;
  /**
   * Preferência de lado (cultura / hábito).
   * "both" cobre o beijo de dois lados comum em PT/BR.
   */
  preferredCheek: "left" | "right" | "both" | "auto";
};

export const DEFAULT_FACIAL_PREFS: FacialPrefs = {
  enabled: false,
  facialConsent: false,
  intensityScale: 0.85,
  preferredCheek: "auto",
};

let facialPrefs: FacialPrefs = { ...DEFAULT_FACIAL_PREFS };

export function getFacialPrefs() {
  return facialPrefs;
}

export function setFacialPrefs(partial: Partial<FacialPrefs>) {
  facialPrefs = { ...facialPrefs, ...partial };
  try {
    localStorage.setItem("presenca_facial", JSON.stringify(facialPrefs));
  } catch {
    /* ignore */
  }
}

export function loadFacialPrefs() {
  try {
    const raw = localStorage.getItem("presenca_facial");
    if (raw) facialPrefs = { ...DEFAULT_FACIAL_PREFS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return facialPrefs;
}

function pulse(n: number, peak: number, intensity: number) {
  return Array.from({ length: n }, (_, k) => {
    const t = k / Math.max(1, n - 1);
    return Math.min(1, peak * intensity * Math.sin(Math.PI * t));
  });
}

const PARENT = /pai|mãe|mae|av[oô]|avó|padrinho|madrinha/i;
const PARTNER = /amor|espos|marido|companheir|namor/i;
const CHILD = /filho|filha|neto|neta/i;
const PLAY = /brincalh|humor|alegre|divertid/i;

export type FacialContext = HugContext & {
  personaId?: string;
  personaName?: string;
  sourceKind?: "memorial" | "living";
};

/**
 * Resolve gesto facial padrão a partir da relação (pode ser sobrescrito na UI).
 */
export function suggestFacialGesture(ctx: FacialContext): FacialGesture {
  const rel = ctx.relationship || "";
  const traits = (ctx.traits || []).join(" ");
  if (PLAY.test(traits) || PLAY.test(rel)) return "nose_boop";
  if (PARENT.test(rel) || CHILD.test(rel)) return "forehead_touch";
  if (PARTNER.test(rel)) return "cheek_caress";
  if (ctx.sourceKind === "memorial") return "forehead_touch";
  return "cheek_kiss";
}

export function resolveFacialPattern(
  gesture: FacialGesture,
  ctx: FacialContext = {},
): FacialPattern {
  const scale = facialPrefs.intensityScale;
  let intensity = 0.45 * scale;
  let durationMs = 500;
  const frameMs = 40;

  // Lado: preferência explícita, ou hash do nome → lado estável por persona
  // (não muda entre sessões).
  let side: FacialPattern["side"] =
    facialPrefs.preferredCheek === "auto"
      ? (ctx.personaId || ctx.personaName || "x")
          .split("")
          .reduce((a, c) => a + c.charCodeAt(0), 0) %
          2 ===
        0
        ? "left"
        : "right"
      : facialPrefs.preferredCheek;

  const rel = ctx.relationship || "";
  if (PARENT.test(rel)) {
    intensity *= 0.85;
    durationMs = 700;
  }
  if (PARTNER.test(rel)) {
    intensity *= 1.05;
    durationMs = 650;
  }
  if (ctx.sourceKind === "memorial") {
    intensity *= 0.7;
    durationMs = Math.round(durationMs * 1.2);
  }
  intensity = Math.max(0.08, Math.min(0.95, intensity));

  const regions: FacialPattern["regions"] = {};

  switch (gesture) {
    case "cheek_kiss":
      durationMs = Math.max(durationMs, 420);
      if (side === "left" || side === "both") {
        regions.left_cheek = pulse(10, 0.9, intensity);
      }
      if (side === "right" || side === "both") {
        regions.right_cheek = pulse(10, 0.9, intensity);
      }
      break;
    case "cheek_caress":
      durationMs = Math.max(durationMs, 900);
      {
        const long = pulse(22, 0.55, intensity);
        if (side !== "right") regions.left_cheek = long;
        if (side !== "left") regions.right_cheek = long;
        regions.jaw = pulse(12, 0.25, intensity);
      }
      break;
    case "forehead_touch":
      durationMs = Math.max(durationMs, 800);
      regions.forehead = pulse(16, 0.7, intensity);
      regions.bridge = pulse(8, 0.2, intensity * 0.5);
      side = "both";
      break;
    case "temple_press":
      durationMs = Math.max(durationMs, 1000);
      regions.temple_left = pulse(18, 0.5, intensity);
      regions.temple_right = pulse(18, 0.5, intensity);
      side = "both";
      break;
    case "nose_boop":
      durationMs = 280;
      intensity = Math.min(intensity, 0.4);
      regions.bridge = pulse(6, 0.75, intensity);
      side = "both";
      break;
    case "farewell_cheek":
      durationMs = 550;
      if (side === "left") regions.left_cheek = pulse(12, 0.6, intensity);
      else regions.right_cheek = pulse(12, 0.6, intensity);
      break;
  }

  return {
    frameMs,
    regions,
    durationMs,
    intensity,
    gesture,
    side,
  };
}

/** Vibração telefone aproximando “lado” (padrão curto). */
export function facialPhonePattern(pattern: FacialPattern): number[] {
  const base = Math.round(30 + pattern.intensity * 50);
  switch (pattern.gesture) {
    case "nose_boop":
      return [base, 40, base];
    case "forehead_touch":
      return [base, 60, base + 10, 80, base];
    case "cheek_caress":
      return [base - 5, 50, base, 50, base + 5, 70, base];
    case "temple_press":
      return [base, 100, base - 10, 100, base];
    default:
      return [base, 45, base + 15, 40];
  }
}

/**
 * Payload para máscara / HMD facial (mesmo espírito do traje).
 */
export function facialToSuitPayload(
  pattern: FacialPattern,
  meta: {
    personaId?: string;
    personaName?: string;
  },
) {
  return {
    type: "facial_haptic_pattern" as const,
    gesture: pattern.gesture,
    intensity: pattern.intensity,
    frameMs: pattern.frameMs,
    regions: pattern.regions,
    side: pattern.side,
    personaId: meta.personaId,
    personaName: meta.personaName,
  };
}

export const FACIAL_PROTOCOL_DOC = `
Presença Facial Haptics Protocol v0.1
────────────────────────────────────
Regiões: forehead, left_cheek, right_cheek, jaw, temple_left, temple_right, bridge

Client → Device:
  {
    "type": "facial_haptic_pattern",
    "gesture": "cheek_kiss" | "forehead_touch" | "cheek_caress" | "temple_press" | "nose_boop" | "farewell_cheek",
    "intensity": 0-1,
    "frameMs": 40,
    "side": "left" | "right" | "both",
    "regions": { "left_cheek": [0.1, 0.5, ...], ... }
  }

Safety: pressão facial máxima baixa; bridge/nose sempre ≤ 40% do pico do firmware.
`;
