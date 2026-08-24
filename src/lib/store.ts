import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatMessage, Persona, WorldPose } from "./types";
import { buildSystemPrompt, PLAYER_ID, SAMPLE_FAMILY } from "./seed";
import { MimeticBrain, applyBrainToPersona, embedText } from "./mimetic-brain";
import { clearMedia, deleteMedia, deleteMediaFor } from "./media-store";
import { migrateMediaToIndexedDb } from "./media-migration";
import { SAMPLE_PLACES, type Place } from "./places";
import type { QualityTier } from "./quality";
import { qualityProfile } from "./quality";
import type { PeerPose, RealtimeTransport } from "./realtime";
import { createRealtime, loadRealtimeConfig } from "./realtime";
import { uid } from "./utils";
import type { VoiceProfile } from "./voice";

const MAX_MESSAGES = 80;

type State = {
  hydrated: boolean;
  onboarded: boolean;
  personas: Persona[];
  places: Place[];
  activePlaceId: string;
  messages: Record<string, ChatMessage[]>;
  pose: WorldPose;
  activeChatId: string | null;
  qualityTier: QualityTier | "auto";
  peers: PeerPose[];
  peerId: string;
  markHydrated: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  resetDemo: () => void;
  upsertPersona: (p: Persona) => void;
  removePersona: (id: string) => void;
  addMemory: (personaId: string, memory: Persona["memories"][number]) => void;
  removeMemory: (personaId: string, memoryId: string) => void;
  setSoul: (personaId: string, soul: Persona["soul"]) => void;
  setVoiceProfile: (personaId: string, voice: VoiceProfile) => void;
  renamePlayer: (name: string) => void;
  setPose: (pose: Partial<WorldPose>) => void;
  setActiveChat: (id: string | null) => void;
  pushMessage: (msg: ChatMessage) => void;
  setActivePlace: (id: string) => void;
  upsertPlace: (place: Place) => void;
  setQualityTier: (t: QualityTier | "auto") => void;
  getQuality: () => ReturnType<typeof qualityProfile>;
  connectPlace: () => void;
  disconnectPlace: () => void;
  publishPose: (pose?: WorldPose) => void;
  setPeers: (peers: PeerPose[]) => void;
  exportLocalData: () => Record<string, unknown>;
  wipeLocalData: () => void;
};

const STORAGE_KEY = "presenca-v2";

/** Versão da forma do estado persistido. Subir sempre que a forma mudar. */
const STATE_VERSION = 1;

/**
 * Os vectores dos traços não são persistidos.
 *
 * Cada traço guarda 64 floats, ~1,3 KB em JSON — 82% do peso do traço. Com o
 * limite de 200 traços por persona são 310 KB cada, e o localStorage tem ~5 MB
 * no total (partilhados com as fotos do cofre, que são data URLs). O vector é
 * uma função pura de `text` (embedText), por isso é recalculado ao rehidratar
 * em vez de ocupar espaço que as memórias da família precisam.
 */
function stripVectors(p: Persona): Persona {
  const traces = p.soul?.mimetic?.traces;
  if (!traces?.length) return p;
  return {
    ...p,
    soul: {
      ...p.soul!,
      mimetic: {
        ...p.soul!.mimetic!,
        traces: traces.map(({ vector: _vector, ...rest }) => ({ ...rest, vector: [] })),
      },
    },
  };
}

function restoreVectors(p: Persona): Persona {
  const traces = p.soul?.mimetic?.traces;
  if (!traces?.length) return p;
  return {
    ...p,
    soul: {
      ...p.soul!,
      mimetic: {
        ...p.soul!.mimetic!,
        traces: traces.map((t) => (t.vector?.length ? t : { ...t, vector: embedText(t.text) })),
      },
    },
  };
}

/**
 * Storage que não perde escritas em silêncio.
 *
 * Ao estourar a quota, o localStorage lança e o zustand/persist engole: a
 * família adicionaria uma memória, veria o ecrã actualizar e perderia tudo ao
 * recarregar. Aqui o erro é sinalizado para a UI poder avisar.
 */
let quotaExceeded = false;

export function isStorageFull() {
  return quotaExceeded;
}

const quotaAwareStorage: Storage = {
  get length() {
    return localStorage.length;
  },
  clear: () => localStorage.clear(),
  key: (i) => localStorage.key(i),
  getItem: (k) => localStorage.getItem(k),
  removeItem: (k) => localStorage.removeItem(k),
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
      quotaExceeded = false;
    } catch (e) {
      quotaExceeded = true;
      console.error("[presenca] armazenamento local cheio — memórias novas não foram guardadas", e);
    }
  },
};

let transport: RealtimeTransport | null = null;
let unsubscribeTransport: (() => void) | null = null;

export function getRealtimeTransport() {
  return transport;
}

function withPrompts(list: Persona[]): Persona[] {
  return list.map((p) => {
    if (!p.soul) return p;
    return { ...p, soul: { ...p.soul, systemPrompt: buildSystemPrompt(p) } };
  });
}

function ensurePeerId(): string {
  if (typeof localStorage === "undefined") return uid("peer");
  const k = "presenca-peer-id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = uid("peer");
    localStorage.setItem(k, id);
  }
  return id;
}

export const usePresence = create<State>()(
  persist(
    (set, get) => ({
      hydrated: false,
      onboarded: false,
      personas: withPrompts(SAMPLE_FAMILY),
      places: SAMPLE_PLACES,
      activePlaceId: SAMPLE_PLACES[0].id,
      messages: {},
      pose: { x: 0, z: 1.4, yaw: 0 },
      activeChatId: null,
      qualityTier: "auto",
      peers: [],
      peerId: typeof window !== "undefined" ? ensurePeerId() : "peer_ssr",
      markHydrated: () => set({ hydrated: true }),
      completeOnboarding: () => set({ onboarded: true }),
      resetOnboarding: () => set({ onboarded: false }),
      resetDemo: () =>
        set({
          onboarded: false,
          personas: withPrompts(SAMPLE_FAMILY),
          places: SAMPLE_PLACES,
          activePlaceId: SAMPLE_PLACES[0].id,
          messages: {},
          pose: { x: 0, z: 1.4, yaw: 0 },
          activeChatId: null,
          peers: [],
        }),
      upsertPersona: (p) => {
        const next = { ...p };
        if (next.soul) next.soul = { ...next.soul, systemPrompt: buildSystemPrompt(next) };
        const list = get().personas;
        const i = list.findIndex((x) => x.id === next.id);
        const personas = i >= 0 ? list.map((x, idx) => (idx === i ? next : x)) : [...list, next];
        set({ personas });
      },
      removePersona: (id) => {
        if (id === PLAYER_ID) return;
        // Os bytes vivem noutro sítio: sem isto ficavam órfãos no IndexedDB.
        void deleteMediaFor(id);
        const messages = { ...get().messages };
        delete messages[id];
        set({
          personas: get().personas.filter((p) => p.id !== id),
          messages,
          activeChatId: get().activeChatId === id ? null : get().activeChatId,
        });
      },
      addMemory: (personaId, memory) => {
        const personas = get().personas.map((p) => {
          if (p.id !== personaId) return p;
          const next = { ...p, memories: [...p.memories, memory] };
          const brain = MimeticBrain.bootstrap(next);
          brain.absorbMemory(memory);
          return applyBrainToPersona(next, brain.getModel());
        });
        set({ personas: withPrompts(personas) });
      },
      removeMemory: (personaId, memoryId) => {
        // Os bytes vivem no IndexedDB: sem isto ficavam órfãos, a ocupar espaço
        // de uma memória que a família já apagou.
        const alvo = get()
          .personas.find((p) => p.id === personaId)
          ?.memories.find((m) => m.id === memoryId);
        if (alvo?.mediaId) void deleteMedia(alvo.mediaId);

        const personas = get().personas.map((p) =>
          p.id === personaId ? { ...p, memories: p.memories.filter((m) => m.id !== memoryId) } : p,
        );
        set({ personas: withPrompts(personas) });
      },
      setSoul: (personaId, soul) => {
        const personas = get().personas.map((p) => {
          if (p.id !== personaId) return p;
          const next = { ...p, soul };
          if (next.soul) next.soul = { ...next.soul, systemPrompt: buildSystemPrompt(next) };
          return next;
        });
        set({ personas });
      },
      setVoiceProfile: (personaId, voice) => {
        set({
          personas: get().personas.map((p) =>
            p.id === personaId ? { ...p, voiceProfile: voice } : p,
          ),
        });
      },
      renamePlayer: (name) => {
        set({
          personas: get().personas.map((p) =>
            p.isPlayer ? { ...p, name: name.trim() || "Você" } : p,
          ),
        });
      },
      setPose: (pose) => set({ pose: { ...get().pose, ...pose } }),
      setActiveChat: (id) => set({ activeChatId: id }),
      pushMessage: (msg) => {
        const messages = { ...get().messages };
        const list = messages[msg.personaId] ?? [];
        messages[msg.personaId] = [...list, msg].slice(-MAX_MESSAGES);
        let personas = get().personas;
        const target = personas.find((p) => p.id === msg.personaId);
        if (target && target.kind === "memorial") {
          const brain = MimeticBrain.bootstrap(target);
          brain.absorbChat(msg.role, msg.text);
          personas = personas.map((p) =>
            p.id === msg.personaId ? applyBrainToPersona(p, brain.getModel()) : p,
          );
        }
        set({ messages, personas });
      },
      setActivePlace: (id) => {
        get().disconnectPlace();
        set({ activePlaceId: id, peers: [] });
      },
      upsertPlace: (place) => {
        const list = get().places;
        const i = list.findIndex((p) => p.id === place.id);
        set({
          places: i >= 0 ? list.map((p, idx) => (idx === i ? place : p)) : [...list, place],
        });
      },
      setQualityTier: (t) => set({ qualityTier: t }),
      getQuality: () => {
        const t = get().qualityTier;
        return qualityProfile(t === "auto" ? undefined : t);
      },
      connectPlace: () => {
        const s = get();
        transport?.disconnect();
        transport = createRealtime(loadRealtimeConfig());
        const player = s.personas.find((p) => p.isPlayer);
        const self: PeerPose = {
          peerId: s.peerId,
          displayName: player?.name ?? "Visitante",
          placeId: s.activePlaceId,
          x: s.pose.x,
          z: s.pose.z,
          yaw: s.pose.yaw,
          personaId: player?.id,
          bodyGlbUrl: player?.bodyScan?.glbUrl?.startsWith("http")
            ? player.bodyScan.glbUrl
            : undefined,
          heightM: player?.bodyScan?.heightM,
          hue: typeof player?.hue === "number" ? player.hue : undefined,
          updatedAt: Date.now(),
        };
        transport.connect(s.activePlaceId, self);
        // A subscrição anterior era descartada: cada reconexão empilhava mais
        // um handler sobre o transporte antigo.
        unsubscribeTransport = transport.onMessage(() => {
          set({ peers: transport?.listPeers() ?? [] });
        });
        set({ peers: [] });
      },
      disconnectPlace: () => {
        unsubscribeTransport?.();
        unsubscribeTransport = null;
        transport?.disconnect();
        transport = null;
        set({ peers: [] });
      },
      /**
       * Publica a pose no transporte.
       *
       * Aceita a pose ao vivo por argumento: o mundo 3D publica ~8x/s e
       * escrever isso no store fazia todos os subscritores re-renderizar
       * a esse ritmo. O store guarda só a pose amortecida (persistência).
       */
      publishPose: (live) => {
        const s = get();
        if (!transport) return;
        const pose = live ?? s.pose;
        const player = s.personas.find((p) => p.isPlayer);
        transport.send({
          type: "pose",
          payload: {
            peerId: s.peerId,
            displayName: player?.name ?? "Visitante",
            placeId: s.activePlaceId,
            x: pose.x,
            z: pose.z,
            yaw: pose.yaw,
            personaId: player?.id,
            bodyGlbUrl: player?.bodyScan?.glbUrl?.startsWith("http")
              ? player.bodyScan.glbUrl
              : undefined,
            heightM: player?.bodyScan?.heightM,
            hue: typeof player?.hue === "number" ? player.hue : undefined,
            updatedAt: Date.now(),
          },
        });
      },
      setPeers: (peers) => set({ peers }),
      exportLocalData: () => {
        const s = get();
        return {
          exportedAt: new Date().toISOString(),
          personas: s.personas,
          places: s.places,
          messages: s.messages,
          pose: s.pose,
          activePlaceId: s.activePlaceId,
          note: "Exportação local Presença — portabilidade (LGPD art. 18). Sem passwords de terceiros.",
        };
      },
      wipeLocalData: () => {
        get().disconnectPlace();
        set({
          personas: withPrompts(SAMPLE_FAMILY),
          places: [],
          messages: {},
          onboarded: false,
          peers: [],
        });
        // Direito à eliminação: tem de levar os bytes também.
        void clearMedia();
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: STATE_VERSION,
      storage: createJSONStorage(() => quotaAwareStorage),
      /**
       * Migração do estado guardado.
       *
       * Sem isto, qualquer mudança na forma dos dados corrompia em silêncio o
       * lar de quem já usava a app — ou rebentava na rehidratação. As migrações
       * são cumulativas e cada uma só sobe uma versão.
       */
      migrate: (persistido, versao) => {
        let estado = persistido as Partial<State>;

        // v0 → v1: os traços do cérebro mimético deixaram de guardar o vetor
        // (é função pura do texto e valia 82% do peso). restoreVectors
        // recalcula-o; aqui só é preciso não rejeitar o formato antigo.
        if (versao < 1) {
          estado = { ...estado };
        }

        return estado as State;
      },
      partialize: (s) => ({
        onboarded: s.onboarded,
        personas: s.personas.map(stripVectors),
        places: s.places,
        activePlaceId: s.activePlaceId,
        messages: s.messages,
        pose: s.pose,
        qualityTier: s.qualityTier,
        peerId: s.peerId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.personas = state.personas.map(restoreVectors);
        state.markHydrated();

        // Move para IndexedDB as media que ficaram em base64 no estado.
        // Assíncrono e tolerante a falha: se não correr, os dados ficam onde
        // estavam e tenta-se na sessão seguinte.
        void migrateMediaToIndexedDb(state.personas).then(({ personas, migradas }) => {
          if (migradas > 0) {
            usePresence.setState({ personas });
            console.info(`[presenca] ${migradas} media movidas para IndexedDB`);
          }
        });
      },
    },
  ),
);

export function newPersonaDraft(kind: Persona["kind"]): Persona {
  return {
    id: uid("persona"),
    kind,
    name: "",
    relationship: kind === "memorial" ? "Avô" : "Irmão",
    bio: "",
    traits: [],
    speechNotes: "",
    favorites: "",
    hue: kind === "memorial" ? "ink" : "sage",
    hair: "short",
    room: kind === "memorial" ? "garden" : "living",
    memories: [],
    placeIds: [SAMPLE_PLACES[0].id],
  };
}
