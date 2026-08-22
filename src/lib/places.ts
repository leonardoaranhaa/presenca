/**
 * Locais reais e memoriais — casas, lugares que foram, lugares que se frequenta.
 * Layouts: procedural Oliveira, simple-room (medidas), scan-glb (fotogrametria).
 */
import type { RoomId } from "./types";
import type { RoomMetrics } from "./room-metrics";
import { DEFAULT_METRICS } from "./room-metrics";

export type PlaceKind = "home" | "once" | "frequent" | "memorial";

export type PlaceVisibility = "circle" | "invite" | "public";

export type PlaceLayout = "oliveira-house" | "simple-room" | "garden-only" | "scan-glb";

export interface PlaceAnchor {
  id: string;
  label: string;
  room: RoomId;
  x: number;
  z: number;
  personaId?: string;
}

/** Metadados de captura / fotogrametria */
export interface PlaceScan {
  /** URL do GLB otimizado (Draco) */
  glbUrl?: string;
  /** Mesh baixo só para colisão */
  colliderUrl?: string;
  /** Gaussian splat opcional (.spz / .splat) */
  splatUrl?: string;
  /** Origem: polycam | scaniverse | luma | upload | ai-shell */
  source?: string;
  capturedAt?: number;
  notes?: string;
}

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  description: string;
  where: string;
  years?: string;
  visibility: PlaceVisibility;
  personaIds: string[];
  anchors: PlaceAnchor[];
  layout: PlaceLayout;
  /** Medidas para layout simple-room */
  metrics?: RoomMetrics;
  /** Asset de fotogrametria / IA */
  scan?: PlaceScan;
  isSample?: boolean;
}

export const SAMPLE_PLACES: Place[] = [
  {
    id: "place_casa_oliveira",
    kind: "home",
    name: "Casa Oliveira",
    description:
      "A casa de sempre — sala com lareira, cozinha da Helena, goiabeira no quintal. O lar principal do círculo.",
    where: "Interior · Brasil",
    years: "1978 — presente",
    visibility: "circle",
    personaIds: [
      "persona_you",
      "persona_antonio",
      "persona_helena",
      "persona_clara",
      "persona_miguel",
    ],
    anchors: [
      { id: "a_living", label: "Sofá", room: "living", x: 0, z: -2.4 },
      { id: "a_kitchen", label: "Fogão", room: "kitchen", x: 8.9, z: -1.9, personaId: "persona_helena" },
      {
        id: "a_garden",
        label: "Goiabeira",
        room: "garden",
        x: 2.4,
        z: 11.4,
        personaId: "persona_antonio",
      },
      { id: "a_study", label: "Escrivaninha", room: "study", x: -9, z: -1.6 },
      { id: "a_porch", label: "Varanda", room: "porch", x: 0, z: 5.6, personaId: "persona_clara" },
    ],
    layout: "oliveira-house",
    isSample: true,
  },
  {
    id: "place_sala_medidas",
    kind: "home",
    name: "Sala pelas medidas",
    description:
      "Cômodo gerado só com largura, profundidade e pé-direito. Use enquanto o scan GLB não chega — ou como casa aproximada.",
    where: "Medidas manuais",
    visibility: "circle",
    personaIds: ["persona_you", "persona_clara", "persona_miguel"],
    anchors: [
      { id: "sm_sofa", label: "Sofá", room: "living", x: 0, z: -1.2 },
      { id: "sm_table", label: "Mesa", room: "living", x: 0, z: 0.3 },
    ],
    layout: "simple-room",
    metrics: { ...DEFAULT_METRICS, widthM: 6, depthM: 4.5, heightM: 2.8, windowCount: 2 },
    isSample: true,
  },
  {
    id: "place_sitio_antigo",
    kind: "once",
    name: "Sítio do vovô (antes)",
    description:
      "O sítio que não existe mais no mapa, mas ainda existe na memória. Quintal grande, cheiro de terra molhada.",
    where: "Zona rural · memória",
    years: "1960 — 1998",
    visibility: "circle",
    personaIds: ["persona_antonio", "persona_helena"],
    anchors: [
      { id: "s_tree", label: "Árvore grande", room: "garden", x: 2.4, z: 11.4, personaId: "persona_antonio" },
      { id: "s_porch", label: "Alpendre", room: "porch", x: 0, z: 5.6 },
    ],
    layout: "garden-only",
    isSample: true,
  },
  {
    id: "place_scan_demo",
    kind: "home",
    name: "Casa escaneada (demo)",
    description:
      "Placeholder de fotogrametria: quando houver GLB (Polycam/Scaniverse), aponte scan.glbUrl. Até lá usa simple-room.",
    where: "Upload · fotogrametria",
    visibility: "circle",
    personaIds: ["persona_you"],
    anchors: [{ id: "sc_center", label: "Centro", room: "living", x: 0, z: 0 }],
    layout: "scan-glb",
    metrics: { ...DEFAULT_METRICS, widthM: 5, depthM: 4, heightM: 2.7 },
    scan: {
      source: "upload",
      // Quando existir o arquivo:
      // glbUrl: "/scans/casa-web.glb",
      // colliderUrl: "/scans/casa-collider.glb",
      notes: "Exporte GLB do Polycam/Scaniverse, otimize com gltf-transform, coloque em /public/scans/ e defina glbUrl.",
    },
    isSample: true,
  },
  {
    id: "place_praca",
    kind: "frequent",
    name: "Praça do centro",
    description:
      "Onde a família se encontrava no domingo. Banco debaixo da árvore, conversa longa.",
    where: "Centro da cidade",
    visibility: "invite",
    personaIds: ["persona_clara", "persona_miguel", "persona_you"],
    anchors: [{ id: "p_bench", label: "Banco", room: "garden", x: 2.4, z: 13.4 }],
    layout: "garden-only",
    isSample: true,
  },
];

export function placeKindLabel(k: PlaceKind): string {
  switch (k) {
    case "home":
      return "Casa";
    case "once":
      return "Lugar que foi";
    case "frequent":
      return "Lugar de sempre";
    case "memorial":
      return "Espaço memorial";
  }
}

export function layoutLabel(l: PlaceLayout): string {
  switch (l) {
    case "oliveira-house":
      return "Casa completa (demo)";
    case "simple-room":
      return "Cômodo por medidas";
    case "garden-only":
      return "Jardim / exterior";
    case "scan-glb":
      return "Scan / fotogrametria";
  }
}
