import type { VoiceProfile } from "./voice";
import type { MimeticModel } from "./mimetic-brain/types";

export type PresenceKind = "living" | "memorial";

export type MemoryKind = "story" | "photo" | "video" | "voice" | "letter";

export type HairStyle = "short" | "long" | "bun" | "bald" | "wavy";

export type RoomId = "living" | "kitchen" | "garden" | "study" | "porch";

export type AvatarHue = "sage" | "clay" | "ink" | "linen" | "dusk" | "rose";

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  /**
   * Chave da media no IndexedDB (`src/lib/media-store.ts`).
   * Os bytes não vivem aqui: o estado é persistido em localStorage, que tem
   * ~5 MB, e uma dúzia de fotos chegava para o encher.
   */
  mediaId?: string;
  /**
   * @deprecated Media em base64 dentro do estado. Só existe em dados gravados
   * antes da migração para IndexedDB; `migrateMediaToIndexedDb` move-a e limpa
   * este campo. Não usar em código novo.
   */
  mediaDataUrl?: string;
  createdAt: number;
}

export interface SoulProfile {
  awakenedAt: number;
  summary: string;
  voice: string;
  mannerisms: string[];
  catchphrases: string[];
  values: string[];
  systemPrompt: string;
  /** Cérebro mímico evolutivo (memória ML local) */
  mimetic?: MimeticModel;
}

/** Scan do corpo do utilizador (ou de um vivo do círculo, com consentimento). */
export interface BodyScan {
  /** GLB texturizado otimizado (estático ou Mixamo-rigged) */
  glbUrl?: string;
  /** Mesh baixo para sombra/colisão local */
  colliderUrl?: string;
  /** Altura estimada em metros (escala) */
  heightM?: number;
  source?: "upload" | "polycam" | "ai" | "parametric" | "mixamo";
  /** true se GLB tem skeleton + AnimationClips (Mixamo) */
  rigged?: boolean;
  capturedAt?: number;
  notes?: string;
}

export interface Persona {
  id: string;
  kind: PresenceKind;
  name: string;
  relationship: string;
  birthYear?: number;
  deathYear?: number;
  bio: string;
  traits: string[];
  speechNotes: string;
  favorites: string;
  hue: AvatarHue;
  hair: HairStyle;
  room: RoomId;
  memories: Memory[];
  soul?: SoulProfile;
  voiceProfile?: VoiceProfile;
  isPlayer?: boolean;
  isSample?: boolean;
  placeIds?: string[];
  /** Corpo digital (scan GLB) */
  bodyScan?: BodyScan;
}

export interface ChatMessage {
  id: string;
  personaId: string;
  role: "user" | "presence";
  text: string;
  at: number;
}

export interface WorldPose {
  x: number;
  z: number;
  yaw: number;
}

export const AVATAR_HUES: Record<
  AvatarHue,
  { cloth: string; accent: string; skin: string; label: string }
> = {
  sage: { cloth: "#6d7f6a", accent: "#d5d0c6", skin: "#c4a07a", label: "Sálvia" },
  clay: { cloth: "#8a5a4a", accent: "#d5d0c6", skin: "#c9a07c", label: "Barro" },
  ink: { cloth: "#3a3d45", accent: "#c5c1b7", skin: "#b08968", label: "Tinta" },
  linen: { cloth: "#b7a898", accent: "#4a453f", skin: "#d2b090", label: "Linho" },
  dusk: { cloth: "#5c6b7a", accent: "#d5d0c6", skin: "#c4a07a", label: "Dusk" },
  rose: { cloth: "#8a6a6a", accent: "#d5d0c6", skin: "#d0a888", label: "Rosa" },
};

export const ROOMS: { id: RoomId; label: string; hint: string }[] = [
  { id: "living", label: "Sala", hint: "O coração da casa" },
  { id: "kitchen", label: "Cozinha", hint: "Onde o cheiro fica" },
  { id: "garden", label: "Jardim", hint: "Sob a árvore" },
  { id: "study", label: "Gabinete", hint: "Livros e silêncio" },
  { id: "porch", label: "Varanda", hint: "Entre o dentro e o fora" },
];

export const ROOM_SPAWNS: Record<RoomId, { x: number; z: number }> = {
  living: { x: -1.2, z: -0.4 },
  kitchen: { x: 7.4, z: 0.6 },
  garden: { x: 2.2, z: 11.4 },
  study: { x: -8.6, z: 0.4 },
  porch: { x: 0, z: 5.6 },
};

export const RELATIONSHIPS = [
  "Avô",
  "Avó",
  "Pai",
  "Mãe",
  "Cônjuge",
  "Irmão",
  "Irmã",
  "Filho",
  "Filha",
  "Tio",
  "Tia",
  "Primo",
  "Prima",
  "Amigo",
  "Amiga",
  "Outro",
];

export const TRAIT_OPTIONS = [
  "Paciente",
  "Humor seco",
  "Acolhedor",
  "Teimoso",
  "Sábio",
  "Quietude",
  "Falante",
  "Protetor",
  "Brincalhão",
  "Devoto",
  "Curioso",
  "Rigoroso",
  "Doce",
  "Sarcástico",
  "Generoso",
];
