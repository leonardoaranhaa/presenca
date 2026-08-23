import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Headphones, X } from "lucide-react";
import { toast } from "sonner";
import { PresenceChat } from "@/components/chat/presence-chat";
import { Button } from "@/components/ui/button";
import { Sensation, suggestFacialGesture } from "@/lib/sensation";
import { usePresence } from "@/lib/store";
import { worldInput } from "./input";
import { VoiceControls } from "./voice-controls";

export function WorldHud({
  nearestId,
  nearestDist,
  entered,
  onEnter,
  vrCanvas,
  placeName,
  peerCount = 0,
}: {
  nearestId: string | null;
  nearestDist: number;
  entered: boolean;
  onEnter: () => void;
  vrCanvas: HTMLCanvasElement | null;
  placeName?: string;
  peerCount?: number;
}) {
  const personas = usePresence((s) => s.personas);
  const active = usePresence((s) => s.activeChatId);
  const setActive = usePresence((s) => s.setActiveChat);
  const nearest = personas.find((p) => p.id === nearestId && !p.isPlayer);
  const chatting = personas.find((p) => p.id === active);
  const close = Boolean(nearest && nearestDist < 2.35);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!worldInput.interactQueued) return;
      worldInput.interactQueued = false;
      if (nearest && nearestDist < 2.35) setActive(nearest.id);
    }, 80);
    return () => window.clearInterval(id);
  }, [nearest, nearestDist, setActive]);

  return (
    <>
      {!entered && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-end bg-background/55 px-5 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="stagger-in mb-auto mt-16 max-w-md text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-linen">{placeName ?? "Lugar"}</p>
            <h1 className="mt-3 font-display text-5xl text-foreground">O lar</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Ande pela sala, a cozinha e o jardim. Chegue perto de alguém e converse. A voz que
              responde é memória — não a pessoa em carne e osso.
            </p>
          </div>
          <Button size="lg" onClick={onEnter}>
            Entrar
          </Button>
          <p className="mt-3 text-center text-xs text-faint">
            WASD ou clique no chão (caminho no chão). Presenças aproximam-se quando você chega
            perto. Telefone: joystick.
          </p>
        </div>
      )}

      {entered && (
        <>
          <div className="pointer-events-none absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex gap-2">
            <Link
              to="/"
              className="pointer-events-auto flex h-11 items-center rounded-full bg-background/75 px-4 text-sm text-foreground shadow-[var(--shadow-border)]"
            >
              Sair
            </Link>
            <Link
              to="/places"
              className="pointer-events-auto flex h-11 items-center rounded-full bg-background/75 px-3 text-sm text-muted shadow-[var(--shadow-border)]"
            >
              Lugares
            </Link>
            {peerCount > 0 && (
              <span className="pointer-events-auto flex h-11 items-center rounded-full bg-accent/20 px-3 text-xs text-accent">
                {peerCount} {peerCount === 1 ? "pessoa" : "pessoas"} aqui
              </span>
            )}
          </div>
          <div className="pointer-events-none absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10">
            <VrButton canvas={vrCanvas} />
          </div>
          {/* z-20 e bottom-40: a área de rotação da câmara ocupa metade do ecrã
              e vem depois no DOM, portanto tapava estes botões; e o joystick,
              com 120px no canto, tapava o primeiro gesto. Num telemóvel isto
              deixava a interação do mundo inacessível. */}
          {close && nearest && !chatting && (
            <div className="absolute bottom-40 left-1/2 z-20 flex w-[min(100%,22rem)] -translate-x-1/2 flex-col items-center gap-2 px-3">
              <button
                type="button"
                onClick={() => setActive(nearest.id)}
                className="h-12 rounded-full bg-primary px-5 text-sm text-primary-foreground"
              >
                Conversar com {nearest.name.split(" ")[0]}
              </button>
              <SensationGestures
                personaId={nearest.id}
                personaName={nearest.name}
                kind={nearest.kind === "memorial" ? "memorial" : "living"}
                relationship={nearest.relationship}
                traits={nearest.traits}
                memoryCount={nearest.memories?.length ?? 0}
                distanceM={nearestDist}
              />
            </div>
          )}
          <TouchControls enabled={entered && !chatting} />
          <VoiceControls enabled={entered && !chatting} />
        </>
      )}

      {chatting && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[72dvh] flex-col rounded-t-xl bg-surface/95 p-4 shadow-[var(--shadow-border)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(100%,380px)] md:rounded-none">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-xl">{chatting.name}</p>
              <p className="text-xs text-muted">{chatting.relationship}</p>
            </div>
            <button
              type="button"
              className="size-11 text-muted hover:text-foreground"
              aria-label="Fechar conversa"
              onClick={() => setActive(null)}
            >
              <X className="mx-auto size-5" />
            </button>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-faint">
            Reconstrução a partir das memórias do cofre. Não substitui quem partiu.
          </p>
          <div className="min-h-0 flex-1">
            <PresenceChat persona={chatting} compact />
          </div>
        </div>
      )}
    </>
  );
}

function VrButton({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const [busy, setBusy] = useState(false);
  async function enter() {
    const xr = navigator.xr;
    if (!xr || !canvas) {
      toast.message(
        "VR precisa de um headset com WebXR. No celular, o lar já é o modo de todos os dias.",
      );
      return;
    }
    setBusy(true);
    try {
      const ok = await xr.isSessionSupported("immersive-vr");
      if (!ok) {
        toast.message("Este aparelho não oferece sessão VR.");
        return;
      }
      await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    } catch {
      toast.message("Não foi possível iniciar o VR agora.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void enter()}
      disabled={busy}
      className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-background/75 px-3 text-sm text-foreground shadow-[var(--shadow-border)]"
    >
      <Headphones className="size-4" />
      VR
    </button>
  );
}

function TouchControls({ enabled }: { enabled: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) {
      worldInput.stickX = 0;
      worldInput.stickY = 0;
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={base}
        className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-5 z-20 size-[120px] rounded-full bg-foreground/10 md:hidden"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          moveStick(e, base.current, knob.current);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            moveStick(e, base.current, knob.current);
          }
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          worldInput.stickX = 0;
          worldInput.stickY = 0;
          if (knob.current) knob.current.style.transform = "translate(-50%,-50%)";
        }}
        onPointerCancel={() => {
          worldInput.stickX = 0;
          worldInput.stickY = 0;
        }}
      >
        <div
          ref={knob}
          className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40"
        />
      </div>
      <div
        className="absolute bottom-0 right-0 top-16 z-10 w-1/2 md:hidden"
        onPointerDown={(e) => {
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!look.current || look.current.id !== e.pointerId) return;
          worldInput.lookDx += e.clientX - look.current.x;
          worldInput.lookDy += e.clientY - look.current.y;
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          look.current = null;
        }}
        onPointerCancel={() => {
          look.current = null;
        }}
      />
    </>
  );
}

function moveStick(
  e: React.PointerEvent,
  base: HTMLDivElement | null,
  knob: HTMLDivElement | null,
) {
  if (!base) return;
  const r = base.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2);
  let dy = (e.clientY - cy) / (r.height / 2);
  const m = Math.hypot(dx, dy);
  if (m > 1) {
    dx /= m;
    dy /= m;
  }
  worldInput.stickX = dx;
  worldInput.stickY = -dy;
  if (knob) {
    knob.style.transform = `translate(calc(-50% + ${dx * 28}px), calc(-50% + ${dy * 28}px))`;
  }
}

function SensationGestures({
  personaId,
  personaName,
  kind,
  relationship,
  traits,
  memoryCount,
  distanceM,
}: {
  personaId: string;
  personaName: string;
  kind: "memorial" | "living";
  relationship?: string;
  traits?: string[];
  memoryCount?: number;
  distanceM?: number;
}) {
  const hugCtx = {
    relationship,
    traits,
    memoryCount,
    distanceM,
  };
  return (
    <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
      <button
        type="button"
        className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-foreground shadow-[var(--shadow-border)] backdrop-blur"
        onClick={() => void Sensation.offerHand(personaId, personaName, kind)}
      >
        Toque de mão
      </button>
      <button
        type="button"
        className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-foreground shadow-[var(--shadow-border)] backdrop-blur"
        onClick={() => void Sensation.handOnShoulder(personaId, personaName, kind)}
      >
        Ombro
      </button>
      <button
        type="button"
        className="rounded-full bg-accent/90 px-3 py-1.5 text-xs text-primary-foreground shadow-[var(--shadow-border)]"
        onClick={() => void Sensation.hug(personaId, personaName, kind, hugCtx)}
      >
        Abraço
      </button>
      {kind === "memorial" && (
        <button
          type="button"
          className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-muted shadow-[var(--shadow-border)] backdrop-blur"
          onClick={() => void Sensation.comfortHeartbeat(personaId, personaName)}
        >
          Conforto
        </button>
      )}
      <button
        type="button"
        className="rounded-full bg-background/80 px-3 py-1.5 text-xs text-foreground shadow-[var(--shadow-border)] backdrop-blur"
        onClick={() => {
          const g = suggestFacialGesture({
            relationship,
            traits,
            sourceKind: kind,
            personaId,
            personaName,
          });
          void Sensation.facial(g, personaId, personaName, kind, {
            relationship,
            traits,
            memoryCount,
            distanceM,
            personaId,
            personaName,
            sourceKind: kind,
          });
        }}
      >
        Rosto
      </button>
    </div>
  );
}
