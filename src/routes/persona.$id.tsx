import { createFileRoute, Link } from "@tanstack/react-router";
import { Trees } from "lucide-react";
import { PresenceChat } from "@/components/chat/presence-chat";
import { Shell } from "@/components/layout/shell";
import { MemoryVault } from "@/components/persona/memory-vault";
import { PersonaForm } from "@/components/persona/persona-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePresence } from "@/lib/store";
import { formatYearRange } from "@/lib/utils";

export const Route = createFileRoute("/persona/$id")({ component: PersonaPage });

function PersonaPage() {
  const { id } = Route.useParams();
  const persona = usePresence((s) => s.personas.find((p) => p.id === id));
  const remove = usePresence((s) => s.removePersona);
  const setActive = usePresence((s) => s.setActiveChat);

  if (!persona) {
    return (
      <Shell>
        <p className="pt-12 text-muted">Esta presença não está no lar.</p>
        <Button asChild className="mt-4">
          <Link to="/circle">Voltar ao círculo</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{persona.relationship}</p>
          <h1 className="mt-2 font-display text-4xl">{persona.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatYearRange(persona.birthYear, persona.deathYear)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={persona.kind === "living" ? "living" : "memorial"}>
              {persona.kind === "living" ? "vivo" : "memorial"}
            </Badge>
            {persona.soul && <Badge tone="accent">despertada</Badge>}
          </div>
        </div>
        <Button asChild variant="outline" onClick={() => setActive(persona.id)}>
          <Link to="/world">
            <Trees className="size-4" />
            Encontrar no mundo
          </Link>
        </Button>
      </div>

      <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted">{persona.bio}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <MemoryVault persona={persona} />
        <div className="space-y-6">
          <Card className="flex h-[min(70dvh,640px)] flex-col p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-faint">Conversa</p>
            <PresenceChat persona={persona} compact />
          </Card>
          <details className="rounded-xl bg-card p-4 shadow-[var(--shadow-border)]">
            <summary className="cursor-pointer text-sm font-medium">Editar persona</summary>
            <div className="mt-4">
              <PersonaForm initial={persona} />
            </div>
          </details>
          {!persona.isPlayer && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-xs text-faint hover:text-muted"
              onClick={() => remove(persona.id)}
            >
              Retirar do lar
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}
