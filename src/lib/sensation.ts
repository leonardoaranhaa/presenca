/**
 * Presença · Sensação (háptica)
 *
 * Camada de software para “sentir” toques e abraços de outra persona
 * (viva, no mesmo lar) ou de uma presença memorial (simulado, com consentimento).
 *
 * Hardware futuro: traje háptico (torso/braços), luvas, colete.
 * Hoje: Vibration API (telefone), Gamepad haptic, WebXR actuator se existir.
 *
 * Ética: sensação memorial é reconstrução simbólica, não a pessoa.
 * Requer opt-in explícito (sensationConsent).
 */

import {
  facialPhonePattern,
  facialToSuitPayload,
  getFacialPrefs,
  loadFacialPrefs,
  resolveFacialPattern,
  type FacialContext,
  type FacialGesture,
} from "./facial-haptics";

export type SensationGesture =
  | "presence" // proximidade leve
  | "hand" // toque de mão
  | "shoulder" // mão no ombro
  | "hug" // abraço
  | "heartbeat" // ritmo calmo (memorial / conforto)
  | "farewell" // despedida suave
  | "cheek_kiss"
  | "forehead_touch"
  | "cheek_caress"
  | "temple_press"
  | "nose_boop"
  | "farewell_cheek";

export type SensationChannel = "phone" | "gamepad" | "xr" | "suit" | "log";

export type HugStyle = "soft" | "warm" | "firm" | "playful";

export type SensationEvent = {
  gesture: SensationGesture;
  /** 0–1 */
  intensity: number;
  /** duração sugerida em ms */
  durationMs: number;
  personaId?: string;
  personaName?: string;
  /** memorial | living | self */
  sourceKind?: "memorial" | "living" | "system";
  at: number;
  /** Abraço adaptativo */
  hugStyle?: HugStyle;
  /** Abertura dos braços 0–1 (animação) */
  armOpen?: number;
  /** Quão “longo” é o aperto no pico 0–1 */
  holdBias?: number;
  /** Háptica facial */
  facialSide?: "left" | "right" | "both";
  facialRegions?: string[];
};

export type SuitRegion =
  | "chest"
  | "back"
  | "left_arm"
  | "right_arm"
  | "left_hand"
  | "right_hand"
  | "shoulders";

/** Padrão por região do traje (0–1 por frame de 50ms). */
export type SuitPattern = {
  regions: Partial<Record<SuitRegion, number[]>>;
  frameMs: number;
};

const GESTURE_DEFAULTS: Record<
  SensationGesture,
  { intensity: number; durationMs: number; phonePattern: number[] }
> = {
  presence: { intensity: 0.15, durationMs: 120, phonePattern: [40] },
  hand: { intensity: 0.35, durationMs: 180, phonePattern: [30, 40, 50] },
  shoulder: { intensity: 0.45, durationMs: 280, phonePattern: [50, 30, 80] },
  hug: {
    intensity: 0.7,
    durationMs: 1400,
    phonePattern: [80, 40, 100, 40, 120, 60, 80, 100, 60],
  },
  heartbeat: {
    intensity: 0.4,
    durationMs: 2000,
    phonePattern: [60, 200, 40, 400, 60, 200, 40, 400],
  },
  farewell: { intensity: 0.25, durationMs: 600, phonePattern: [40, 80, 30, 120, 20] },
  cheek_kiss: { intensity: 0.4, durationMs: 420, phonePattern: [45, 40, 55] },
  forehead_touch: { intensity: 0.35, durationMs: 800, phonePattern: [40, 60, 50, 80] },
  cheek_caress: { intensity: 0.38, durationMs: 900, phonePattern: [35, 50, 40, 50, 45] },
  temple_press: { intensity: 0.32, durationMs: 1000, phonePattern: [40, 100, 35, 100] },
  nose_boop: { intensity: 0.28, durationMs: 280, phonePattern: [30, 40, 35] },
  farewell_cheek: { intensity: 0.3, durationMs: 550, phonePattern: [40, 50, 30] },
};

/** Mapa gesto → pressão por região do traje (futuro). */
export function suitPatternFor(
  gesture: SensationGesture,
  intensity: number,
): SuitPattern {
  const i = Math.max(0, Math.min(1, intensity));
  const frameMs = 50;
  const pulse = (n: number, peak: number) =>
    Array.from({ length: n }, (_, k) => {
      const t = k / Math.max(1, n - 1);
      return Math.min(1, peak * i * Math.sin(Math.PI * t));
    });

  switch (gesture) {
    case "hug":
      return {
        frameMs,
        regions: {
          chest: pulse(28, 0.95),
          back: pulse(28, 0.85),
          shoulders: pulse(28, 0.7),
          left_arm: pulse(24, 0.55),
          right_arm: pulse(24, 0.55),
        },
      };
    case "hand":
      return {
        frameMs,
        regions: { right_hand: pulse(6, 0.8), left_hand: pulse(4, 0.3) },
      };
    case "shoulder":
      return {
        frameMs,
        regions: { shoulders: pulse(10, 0.75), right_arm: pulse(8, 0.4) },
      };
    case "heartbeat":
      return {
        frameMs,
        regions: {
          chest: [0.5 * i, 0.15, 0.35 * i, 0.05, 0, 0, 0, 0].flatMap((v) => [
            v,
            v * 0.6,
          ]),
        },
      };
    case "presence":
      return { frameMs, regions: { chest: pulse(3, 0.25) } };
    case "farewell":
      return {
        frameMs,
        regions: {
          chest: pulse(12, 0.4),
          shoulders: pulse(10, 0.3),
        },
      };
    default:
      // facial gestures: pattern handled by facial-haptics device path
      return { frameMs, regions: { chest: pulse(4, 0.15) } };
  }
}

export type SensationPrefs = {
  enabled: boolean;
  /** Consentimento para háptica de presenças memoriais */
  memorialConsent: boolean;
  intensityScale: number; // 0.2–1.5
  channels: {
    phone: boolean;
    gamepad: boolean;
    xr: boolean;
    suit: boolean;
  };
  /** URL WebSocket / BLE bridge do traje (futuro) */
  suitEndpoint?: string;
};

export const DEFAULT_SENSATION_PREFS: SensationPrefs = {
  enabled: false,
  memorialConsent: false,
  intensityScale: 1,
  channels: { phone: true, gamepad: true, xr: true, suit: false },
};

type SuitTransport = {
  connected: boolean;
  sendPattern: (pattern: SuitPattern, meta: SensationEvent) => Promise<void>;
  disconnect: () => void;
};

let prefs: SensationPrefs = { ...DEFAULT_SENSATION_PREFS };
let suit: SuitTransport | null = null;
let lastEvent: SensationEvent | null = null;
const listeners = new Set<(e: SensationEvent | null) => void>();

export function getSensationPrefs() {
  return prefs;
}

export function setSensationPrefs(partial: Partial<SensationPrefs>) {
  prefs = {
    ...prefs,
    ...partial,
    channels: { ...prefs.channels, ...(partial.channels || {}) },
  };
  try {
    localStorage.setItem("presenca_sensation", JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadSensationPrefs() {
  try {
    const raw = localStorage.getItem("presenca_sensation");
    if (raw) {
      const parsed = JSON.parse(raw) as SensationPrefs;
      prefs = {
        ...DEFAULT_SENSATION_PREFS,
        ...parsed,
        channels: { ...DEFAULT_SENSATION_PREFS.channels, ...parsed.channels },
      };
    }
  } catch {
    /* ignore */
  }
  return prefs;
}

export function onSensationEvent(fn: (e: SensationEvent | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(e: SensationEvent | null) {
  lastEvent = e;
  for (const fn of listeners) fn(e);
}

export function getLastSensation() {
  return lastEvent;
}

/** Bridge futuro: WebSocket para firmware do traje. */
export function connectSuitEndpoint(url: string): SuitTransport {
  let ws: WebSocket | null = null;
  let connected = false;
  try {
    ws = new WebSocket(url);
    ws.onopen = () => {
      connected = true;
    };
    ws.onclose = () => {
      connected = false;
    };
  } catch {
    connected = false;
  }
  const transport: SuitTransport = {
    get connected() {
      return connected;
    },
    async sendPattern(pattern, meta) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "haptic_pattern",
          gesture: meta.gesture,
          intensity: meta.intensity,
          personaId: meta.personaId,
          frameMs: pattern.frameMs,
          regions: pattern.regions,
        }),
      );
    },
    disconnect() {
      ws?.close();
      connected = false;
    },
  };
  suit = transport;
  setSensationPrefs({ suitEndpoint: url, channels: { ...prefs.channels, suit: true } });
  return transport;
}

async function vibratePhone(pattern: number[]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

async function vibrateGamepad(intensity: number, durationMs: number) {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return false;
  const pads = navigator.getGamepads();
  let ok = false;
  for (const pad of pads) {
    if (!pad || !pad.vibrationActuator) continue;
    try {
      await pad.vibrationActuator.playEffect("dual-rumble", {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: intensity * 0.6,
        strongMagnitude: intensity,
      });
      ok = true;
    } catch {
      /* ignore */
    }
  }
  return ok;
}

async function vibrateXr(intensity: number, durationMs: number) {
  // Session XR injetada pelo world quando disponível
  const session = (globalThis as unknown as { __presencaXrSession?: XRSession })
    .__presencaXrSession;
  if (!session) return false;
  try {
    const sources = session.inputSources || [];
    let ok = false;
    for (const src of sources) {
      const actuator = (src as unknown as { gamepad?: Gamepad }).gamepad
        ?.hapticActuators?.[0] as
        | { pulse?: (value: number, duration: number) => Promise<boolean> }
        | undefined;
      if (actuator?.pulse) {
        await actuator.pulse(intensity, durationMs);
        ok = true;
      }
    }
    return ok;
  } catch {
    return false;
  }
}


/** Contexto opcional para abraço adaptativo. */
export type HugContext = {
  relationship?: string;
  traits?: string[];
  /** distância em metros ao pedir o abraço */
  distanceM?: number;
  /** quantas memórias no cofre (mais memórias → abraço mais “conhecido”) */
  memoryCount?: number;
  /** anos desde a partida (memorial) — suaviza com o tempo emocional */
  yearsSince?: number;
};

const CLOSE_REL = /pai|mãe|mae|filho|filha|irmão|irmao|irmã|irma|av[oô]|avó|amor|espos|marido|companheir|namor/i;
const WARM_REL = /tio|tia|primo|prima|amigo|amiga|padrinho|madrinha|neto|neta/i;
const FIRM_TRAIT = /forte|protetor|protetora|r[ií]gido|determinado|guerreiro/i;
const SOFT_TRAIT = /carinhos|gentil|suave|calmo|calma|doce|afetuoso/i;
const PLAY_TRAIT = /brincalh|humor|alegre|divertid|piada/i;

/**
 * Calcula intensidade, duração e estilo do abraço a partir da relação,
 * traços, distância e preferências — sem hardcode por persona.
 */
export function resolveAdaptiveHug(
  kind: "memorial" | "living" | "system",
  ctx: HugContext = {},
): {
  intensity: number;
  durationMs: number;
  style: HugStyle;
  armOpen: number;
  holdBias: number;
  phonePattern: number[];
} {
  const rel = ctx.relationship || "";
  const traits = (ctx.traits || []).join(" ");
  const dist = ctx.distanceM ?? 1.5;
  const mems = ctx.memoryCount ?? 0;

  let style: HugStyle = "warm";
  let intensity = 0.65;
  let durationMs = 1400;
  let armOpen = 0.85;
  let holdBias = 0.55;

  if (CLOSE_REL.test(rel)) {
    style = "warm";
    intensity = 0.82;
    durationMs = 1800;
    armOpen = 1;
    holdBias = 0.75;
  } else if (WARM_REL.test(rel)) {
    style = "warm";
    intensity = 0.68;
    durationMs = 1500;
    armOpen = 0.9;
    holdBias = 0.6;
  }

  if (FIRM_TRAIT.test(traits) || FIRM_TRAIT.test(rel)) {
    style = "firm";
    intensity = Math.min(1, intensity + 0.12);
    durationMs = Math.max(durationMs, 1600);
    holdBias = Math.min(1, holdBias + 0.2);
    armOpen = Math.min(1, armOpen + 0.05);
  }
  if (SOFT_TRAIT.test(traits) || SOFT_TRAIT.test(rel)) {
    style = "soft";
    intensity = Math.max(0.35, intensity - 0.15);
    durationMs = Math.max(1200, durationMs - 100);
    holdBias = Math.max(0.3, holdBias - 0.15);
  }
  if (PLAY_TRAIT.test(traits)) {
    style = "playful";
    durationMs = Math.min(durationMs, 1200);
    armOpen = 0.95;
    holdBias = 0.4;
  }

  // Memorial: sempre um pouco mais suave e longo (espaço para a emoção)
  if (kind === "memorial") {
    intensity *= 0.72;
    durationMs = Math.round(durationMs * 1.15);
    holdBias = Math.max(0.35, holdBias * 0.85);
    if (style === "firm") style = "warm";
    if (style === "playful") style = "soft";
  }

  // Cofre rico → abraço “de quem se conhece”
  if (mems >= 5) {
    durationMs = Math.round(durationMs * 1.1);
    holdBias = Math.min(1, holdBias + 0.08);
  } else if (mems === 0 && kind === "memorial") {
    intensity *= 0.85;
    style = "soft";
  }

  // Distância: longe demais = menos intenso (ainda simbólico); muito perto = pleno
  if (dist > 2.5) {
    intensity *= 0.75;
    armOpen *= 0.85;
  } else if (dist < 1.2) {
    intensity = Math.min(1, intensity * 1.08);
    armOpen = Math.min(1, armOpen * 1.05);
  }

  intensity = Math.max(0.12, Math.min(1, intensity * prefs.intensityScale));
  durationMs = Math.round(Math.max(700, Math.min(3200, durationMs)));

  // Padrão de vibração conforme estilo
  let phonePattern: number[];
  switch (style) {
    case "soft":
      phonePattern = [40, 80, 50, 100, 40, 120, 30];
      break;
    case "firm":
      phonePattern = [100, 30, 120, 30, 140, 40, 100, 50, 80];
      break;
    case "playful":
      phonePattern = [50, 40, 70, 40, 50, 40, 90, 60];
      break;
    default: // warm
      phonePattern = [70, 50, 90, 50, 110, 60, 90, 80, 60];
  }
  phonePattern = phonePattern.map((ms) => Math.round(ms * (0.55 + intensity * 0.7)));

  return { intensity, durationMs, style, armOpen, holdBias, phonePattern };
}

/**
 * Dispara uma sensação. Respeita prefs, consentimento memorial e escala.
 */
export async function playSensation(input: {
  gesture: SensationGesture;
  personaId?: string;
  personaName?: string;
  sourceKind?: "memorial" | "living" | "system";
  intensity?: number;
  durationMs?: number;
  hugStyle?: HugStyle;
  armOpen?: number;
  holdBias?: number;
  phonePattern?: number[];
  facialSide?: "left" | "right" | "both";
  facialRegions?: string[];
}): Promise<SensationEvent | null> {
  if (!prefs.enabled) return null;
  if (input.sourceKind === "memorial" && !prefs.memorialConsent) return null;

  const base = GESTURE_DEFAULTS[input.gesture];
  const intensity = Math.max(
    0.05,
    Math.min(1, (input.intensity ?? base.intensity) * (input.hugStyle ? 1 : prefs.intensityScale)),
  );
  const durationMs = input.durationMs ?? base.durationMs;
  const event: SensationEvent = {
    gesture: input.gesture,
    intensity,
    durationMs,
    personaId: input.personaId,
    personaName: input.personaName,
    sourceKind: input.sourceKind ?? "system",
    at: Date.now(),
    hugStyle: input.hugStyle,
    armOpen: input.armOpen,
    holdBias: input.holdBias,
    facialSide: input.facialSide,
    facialRegions: input.facialRegions,
  };

  const channels: SensationChannel[] = [];
  const phonePattern =
    input.phonePattern ??
    base.phonePattern.map((ms) => Math.round(ms * (0.6 + intensity * 0.6)));

  if (prefs.channels.phone && (await vibratePhone(phonePattern))) {
    channels.push("phone");
  }
  if (prefs.channels.gamepad && (await vibrateGamepad(intensity, durationMs))) {
    channels.push("gamepad");
  }
  if (prefs.channels.xr && (await vibrateXr(intensity, durationMs))) {
    channels.push("xr");
  }
  if (prefs.channels.suit && suit) {
    try {
      await suit.sendPattern(suitPatternFor(input.gesture, intensity), event);
      channels.push("suit");
    } catch {
      /* ignore */
    }
  }

  if (channels.length === 0) {
    channels.push("log");
  }

  emit(event);
  if (typeof console !== "undefined" && console.debug) {
    console.debug("[presenca:sensation]", event.gesture, channels, event);
  }
  return event;
}

/** Atalhos semânticos usados pelo mundo 3D. */
export const Sensation = {
  presenceNear: (personaId: string, name: string, kind: "memorial" | "living") =>
    playSensation({
      gesture: "presence",
      personaId,
      personaName: name,
      sourceKind: kind,
      intensity: 0.2,
    }),
  offerHand: (personaId: string, name: string, kind: "memorial" | "living") =>
    playSensation({
      gesture: "hand",
      personaId,
      personaName: name,
      sourceKind: kind,
    }),
  handOnShoulder: (personaId: string, name: string, kind: "memorial" | "living") =>
    playSensation({
      gesture: "shoulder",
      personaId,
      personaName: name,
      sourceKind: kind,
    }),
  hug: (
    personaId: string,
    name: string,
    kind: "memorial" | "living",
    ctx?: HugContext,
  ) => {
    const adaptive = resolveAdaptiveHug(kind, ctx);
    return playSensation({
      gesture: "hug",
      personaId,
      personaName: name,
      sourceKind: kind,
      intensity: adaptive.intensity,
      durationMs: adaptive.durationMs,
      hugStyle: adaptive.style,
      armOpen: adaptive.armOpen,
      holdBias: adaptive.holdBias,
      phonePattern: adaptive.phonePattern,
    });
  },
  comfortHeartbeat: (personaId: string, name: string) =>
    playSensation({
      gesture: "heartbeat",
      personaId,
      personaName: name,
      sourceKind: "memorial",
    }),
  farewell: (personaId: string, name: string, kind: "memorial" | "living") =>
    playSensation({
      gesture: "farewell",
      personaId,
      personaName: name,
      sourceKind: kind,
    }),

  facial: (
    gesture: FacialGesture,
    personaId: string,
    name: string,
    kind: "memorial" | "living",
    ctx?: FacialContext,
  ) => {
    loadFacialPrefs();
    const fp = getFacialPrefs();
    if (!fp.enabled || !fp.facialConsent) return Promise.resolve(null);
    if (kind === "memorial" && !prefs.memorialConsent) return Promise.resolve(null);
    const pattern = resolveFacialPattern(gesture, {
      ...ctx,
      personaId,
      personaName: name,
      sourceKind: kind,
    });
    return playSensation({
      gesture,
      personaId,
      personaName: name,
      sourceKind: kind,
      intensity: pattern.intensity,
      durationMs: pattern.durationMs,
      phonePattern: facialPhonePattern(pattern),
      facialSide: pattern.side,
      facialRegions: Object.keys(pattern.regions),
    });
  },
};


/** Protocolo documentado para firmware do traje (JSON sobre WS/BLE). */
export const SUIT_PROTOCOL_DOC = `
Presença Suit Protocol v0.1
───────────────────────────
Transport: WebSocket (wss://) or BLE UART JSON lines

Client → Suit:
  {
    "type": "haptic_pattern",
    "gesture": "hug" | "hand" | "shoulder" | "presence" | "heartbeat" | "farewell",
    "intensity": 0.0-1.0,
    "personaId": "optional",
    "frameMs": 50,
    "regions": {
      "chest": [0.1, 0.5, ...],
      "back": [...],
      "left_arm": [...],
      "right_arm": [...],
      "left_hand": [...],
      "right_hand": [...],
      "shoulders": [...]
    }
  }

Suit → Client:
  { "type": "ack", "frames_played": N }
  { "type": "status", "battery": 0-100, "connected_regions": ["chest", ...] }

Safety: firmware deve limitar pressão máxima e temperatura; o app envia só intenções.
`;


export {
  suggestFacialGesture,
  resolveFacialPattern,
  loadFacialPrefs,
  getFacialPrefs,
  setFacialPrefs,
  DEFAULT_FACIAL_PREFS,
  FACIAL_PROTOCOL_DOC,
} from "./facial-haptics";
export type { FacialGesture, FacialContext, FaceRegion } from "./facial-haptics";
