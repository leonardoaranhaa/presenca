import { useEffect, useRef, useState } from "react";
import { Send, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SoftExitBanner } from "@/components/legal/soft-exit-banner";
import { chatWithPresence } from "@/lib/ai-client";
import { recordMemorialMessage } from "@/lib/ethics";
import { featureAllowed, loadPrivacyPrefs } from "@/lib/lgpd";
import { toPersonaPrompt } from "@/lib/seed";
import { MimeticBrain } from "@/lib/mimetic-brain";
import { usePresence } from "@/lib/store";
import { useServiceStatus } from "@/lib/use-service-status";
import type { ChatMessage, Persona } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import { speakPresence } from "@/lib/voice";

/**
 * Referência estável para "sem mensagens".
 *
 * `?? []` criava um array novo a cada chamada do seletor. O zustand usa
 * `useSyncExternalStore`, que compara snapshots por identidade: um valor
 * sempre diferente dá "Maximum update depth exceeded" e a conversa nem chega a
 * renderizar. É a razão da regra sobre seletores no CLAUDE.md.
 */
const SEM_MENSAGENS: ChatMessage[] = [];

export function PresenceChat({
  persona,
  compact = false,
}: {
  persona: Persona;
  compact?: boolean;
}) {
  const messages = usePresence((s) => s.messages[persona.id] ?? SEM_MENSAGENS);
  const pushMessage = usePresence((s) => s.pushMessage);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [wellnessTick, setWellnessTick] = useState(0);
  const servicos = useServiceStatus();
  const conversaIndisponivel = servicos?.chat === false;
  const scroller = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancela o pedido em voo se o utilizador sair da conversa.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");

    // A recuperação corre aqui, não a cada tecla: faz bootstrap do cérebro e
    // uma passagem BM25F sobre todos os traços. Também fica mais correta com a
    // mensagem enviada em vez de um rascunho parcial.
    //
    // Vai só o bloco recuperado: o prompt (e os limites éticos) é composto no
    // servidor, a partir dos factos da persona.
    const brain = MimeticBrain.bootstrap(persona);
    const retrieved = await brain.retrieveContextAsync(text);
    const hits = await brain.retrieveHitsAsync(text, 4);
    const citations = hits.map((h) => ({
      id: h.id,
      excerpt: h.excerpt,
      score: h.score,
      sourceMemoryId: h.sourceMemoryId,
    }));
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
          persona: toPersonaPrompt(persona),
          retrieved,
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
          citations: citations.length ? citations : undefined,
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
    // Sem voiceProfile explícito, só o ritmo muda (memorial fala mais devagar).
    // A versão anterior deduzia o tom a partir do penteado e da cor da roupa
    // — o aspeto do avatar não diz nada sobre a voz de quem partiu, e essa
    // escolha pertence a quem a conheceu, no cofre de voz.
    void speakPresence(
      text,
      persona.voiceProfile ?? {
        provider: "browser",
        rate: persona.kind === "memorial" ? 0.92 : 1,
      },
      { personaId: persona.id },
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "h-[min(70dvh,640px)]")}>
      {persona.kind === "memorial" && (
        <div className="mb-2">
          <SoftExitBanner tick={wellnessTick} />
        </div>
      )}
      {conversaIndisponivel && (
        <div
          className="mb-2 rounded-md bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted shadow-[var(--shadow-border)]"
          role="status"
        >
          A voz da presença ainda não está ligada neste ambiente. Pode guardar memórias no cofre —
          quando a voz for configurada, ela responde a partir delas.
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
          <div
            key={m.id}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-br-xs bg-primary text-primary-foreground"
                  : "rounded-bl-xs bg-surface-2 text-foreground shadow-[var(--shadow-border)]",
              )}
            >
              <p>{m.text}</p>
              {m.role === "presence" && m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                  <p className="text-[10px] uppercase tracking-wide text-faint">Memórias usadas</p>
                  <ul className="space-y-1">
                    {m.citations.map((c) => (
                      <li
                        key={c.id}
                        className="rounded bg-background/50 px-2 py-1 text-[11px] leading-snug text-muted"
                        title={`score ${c.score.toFixed(2)}`}
                      >
                        “{c.excerpt}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {m.role === "presence" && (
                <button
                  type="button"
                  className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-muted hover:text-foreground"
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
          disabled={conversaIndisponivel}
          // Nome acessível fixo: o placeholder muda com o estado do serviço e
          // um placeholder não é nome acessível para um leitor de ecrã.
          aria-label={`Mensagem para ${persona.name.split(" ")[0]}`}
          placeholder={
            conversaIndisponivel
              ? "A voz da presença não está ligada"
              : `Falar com ${persona.name.split(" ")[0]}…`
          }
          className="h-11 min-w-0 flex-1 rounded-md bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)] placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          maxLength={2000}
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !draft.trim() || conversaIndisponivel}
          aria-label="Enviar"
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}
