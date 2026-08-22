import { useEffect, useRef, useState } from "react";
import { Send, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SoftExitBanner } from "@/components/legal/soft-exit-banner";
import { chatWithPresence } from "@/lib/ai-client";
import { recordMemorialMessage } from "@/lib/ethics";
import { featureAllowed, loadPrivacyPrefs } from "@/lib/lgpd";
import { buildSystemPrompt } from "@/lib/seed";
import { MimeticBrain } from "@/lib/mimetic-brain";
import { usePresence } from "@/lib/store";
import type { Persona } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { speakPresence } from "@/lib/voice";

export function PresenceChat({ persona, compact = false }: { persona: Persona; compact?: boolean }) {
  const messages = usePresence((s) => s.messages[persona.id] ?? []);
  const pushMessage = usePresence((s) => s.pushMessage);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [wellnessTick, setWellnessTick] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancela o pedido em voo se o utilizador sair da conversa.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");

    // O prompt é composto aqui, não a cada tecla: `composeSystemPrompt` faz
    // bootstrap do cérebro e uma passagem BM25F sobre todos os traços.
    // A recuperação também fica mais correta com a mensagem enviada em vez
    // de um rascunho parcial.
    const prompt =
      MimeticBrain.bootstrap(persona).composeSystemPrompt(text) ||
      persona.soul?.systemPrompt ||
      buildSystemPrompt(persona);
    const userMsg = {
      id: uid("msg"),
      personaId: persona.id,
      role: "user" as const,
      text,
      at: Date.now(),
    };
    if (featureAllowed("storeChatHistory", loadPrivacyPrefs())) {
      pushMessage(userMsg);
    }
    if (persona.kind === "memorial") {
      recordMemorialMessage();
      setWellnessTick((n) => n + 1);
    }
    setBusy(true);
    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, text: m.text }));
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await chatWithPresence(
        {
          name: persona.name,
          systemPrompt: prompt,
          history,
          message: text,
        },
        controller.signal,
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (featureAllowed("storeChatHistory", loadPrivacyPrefs())) {
        pushMessage({
          id: uid("msg"),
          personaId: persona.id,
          role: "presence",
          text: res.text,
          at: Date.now(),
        });
      }
      requestAnimationFrame(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
      });
    } catch {
      toast.error("A presença não conseguiu responder agora.");
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string) {
    void speakPresence(text, persona.voiceProfile ?? {
      provider: "browser",
      rate: persona.kind === "memorial" ? 0.92 : 1,
      pitch: persona.hue === "rose" || persona.hair === "long" || persona.hair === "bun" ? 1.15 : 0.85,
    });
  }

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "h-[min(70dvh,640px)]")}>
      {persona.kind === "memorial" && (
        <div className="mb-2">
          <SoftExitBanner tick={wellnessTick} />
        </div>
      )}
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted">
            {persona.kind === "memorial"
              ? `Diga olá para ${persona.name}. Isto é presença mímica: memória dada à fala — não a pessoa em carne e osso.`
              : `${persona.name} está no lar. Escreva como escreveria numa visita.`}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-br-xs bg-primary text-primary-foreground"
                  : "rounded-bl-xs bg-surface-2 text-foreground shadow-[var(--shadow-border)]",
              )}
            >
              <p>{m.text}</p>
              {m.role === "presence" && (
                <button
                  type="button"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                  onClick={() => speak(m.text)}
                >
                  <Volume2 className="size-3" />
                  Ouvir
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="px-2 text-xs text-muted">A presença está reunindo as palavras…</p>}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Falar com ${persona.name.split(" ")[0]}…`}
          className="h-11 min-w-0 flex-1 rounded-md bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)] placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          maxLength={2000}
        />
        <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Enviar">
          <Send />
        </Button>
      </form>
    </div>
  );
}
