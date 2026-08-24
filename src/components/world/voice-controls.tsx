import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { getRealtimeTransport, usePresence } from "@/lib/store";
import { getVoiceChat, type VoiceChatState } from "@/lib/voice-chat";
import { PLAYER_ID } from "@/lib/seed";
import { featureAllowed, loadPrivacyPrefs } from "@/lib/lgpd";

/**
 * Controlo de voz em tempo real no lar (WebRTC).
 */
function shortId(id: string) {
  if (id.length <= 10) return id;
  return id.slice(0, 6) + "…";
}

export function VoiceControls({ enabled }: { enabled: boolean }) {
  const peerId = usePresence((s) => s.peerId);
  const placeId = usePresence((s) => s.activePlaceId);
  const pose = usePresence((s) => s.pose);
  const peers = usePresence((s) => s.peers);
  const personas = usePresence((s) => s.personas);
  const [state, setState] = useState<VoiceChatState>({
    active: false,
    muted: false,
    deafened: false,
    error: null,
    remotePeerIds: [],
    topology: "mesh",
    activeSpeakers: [],
  });

  const voice = getVoiceChat(() => getRealtimeTransport());

  useEffect(() => voice.onChange(setState), [voice]);

  useEffect(() => {
    if (!state.active) return;
    voice.updatePoses({ x: pose.x, z: pose.z }, peers);
  }, [pose.x, pose.z, peers, state.active, voice]);

  useEffect(() => {
    if (!enabled && state.active) void voice.stop();
  }, [enabled, state.active, voice]);

  // Mudar de lugar cria um transporte novo; a sessão de voz ficaria presa ao
  // antigo (sinalização a cair no vazio). A limpeza corre ao mudar de lugar e
  // ao desmontar; `stop()` sai logo se não houver sessão activa.
  useEffect(() => {
    return () => {
      void voice.stop();
    };
  }, [placeId, voice]);

  if (!enabled) return null;

  const player = personas.find((p) => p.id === PLAYER_ID || p.isPlayer);

  async function toggle() {
    if (state.active) {
      await voice.stop();
      return;
    }
    if (!featureAllowed("allowLiveVoice", loadPrivacyPrefs())) {
      // Antes falhava em silêncio: o botão não fazia nada e não se percebia porquê.
      toast.error("A voz ao vivo está desligada nas preferências de privacidade.");
      return;
    }
    await voice.start({
      selfId: peerId,
      placeId,
      displayName: player?.name ?? "Visitante",
    });
  }

  return (
    <div className="pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 md:left-auto md:right-4 md:translate-x-0">
      <button
        type="button"
        onClick={() => void toggle()}
        className={
          state.active
            ? "flex h-11 items-center gap-2 rounded-full bg-accent px-4 text-xs text-primary-foreground shadow-lg"
            : "flex h-11 items-center gap-2 rounded-full bg-background/80 px-4 text-xs text-foreground shadow-[var(--shadow-border)] backdrop-blur"
        }
        title={
          state.topology === "sfu"
            ? "Voz via SFU"
            : state.topology === "capped-mesh"
              ? "Voz (malha limitada)"
              : "Voz no lugar"
        }
      >
        {state.active ? <PhoneOff className="size-4" /> : <Mic className="size-4" />}
        {state.active ? "Sair da voz" : "Voz"}
      </button>
      {state.active && (
        <>
          <button
            type="button"
            onClick={() => voice.setMuted(!state.muted)}
            className="flex size-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow-[var(--shadow-border)] backdrop-blur"
            title={state.muted ? "Ativar microfone" : "Silenciar"}
          >
            {state.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => voice.setDeafened(!state.deafened)}
            className="flex size-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow-[var(--shadow-border)] backdrop-blur"
            title={state.deafened ? "Ouvir" : "Ensurdecer"}
          >
            {state.deafened ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          {state.remotePeerIds.length > 0 && (
            <span className="rounded-full bg-surface-2/90 px-2 py-1 text-[10px] text-muted">
              {state.remotePeerIds.length} em voz
            </span>
          )}
          {state.topology === "sfu" && state.activeSpeakers.length > 0 && (
            <span
              className="max-w-[12rem] truncate rounded-full bg-accent/20 px-2 py-1 text-[10px] text-accent"
              title={state.activeSpeakers.join(", ")}
            >
              Fala: {state.activeSpeakers.map(shortId).join(" · ")}
            </span>
          )}
        </>
      )}
      {state.error && (
        <span className="max-w-[10rem] truncate text-[10px] text-red-400">{state.error}</span>
      )}
    </div>
  );
}
