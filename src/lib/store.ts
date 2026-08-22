import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, Persona, WorldPose } from "./types";
import { buildSystemPrompt, PLAYER_ID, SAMPLE_FAMILY } from "./seed";
import { MimeticBrain, applyBrainToPersona } from "./mimetic-brain";
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
  publishPose: () => void;
  setPeers: (peers: PeerPose[]) => void;
  exportLocalData: () => Record<string, unknown>;
  wipeLocalData: () => void;
};

let transport: RealtimeTransport | null = null;

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
        const personas = get().personas.map((p) =>
          p.id === personaId
            ? { ...p, memories: p.memories.filter((m) => m.id !== memoryId) }
            : p,
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
        messages[msg.personaId] = [...list, msg].slice(-80);
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
          updatedAt: Date.now(),
        };
        transport.connect(s.activePlaceId, self);
        transport.onMessage(() => {
          set({ peers: transport?.listPeers() ?? [] });
        });
        set({ peers: [] });
      },
      disconnectPlace: () => {
        transport?.disconnect();
        transport = null;
        set({ peers: [] });
      },
      publishPose: () => {
        const s = get();
        if (!transport) return;
        const player = s.personas.find((p) => p.isPlayer);
        transport.send({
          type: "pose",
          payload: {
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
        try {
          localStorage.removeItem("presenca-v2");
        } catch {
          /* ignore */
        }
      },
    }),
    {
      name: "presenca-v2",
      partialize: (s) => ({
        onboarded: s.onboarded,
        personas: s.personas,
        places: s.places,
        activePlaceId: s.activePlaceId,
        messages: s.messages,
        pose: s.pose,
        qualityTier: s.qualityTier,
        peerId: s.peerId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
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
