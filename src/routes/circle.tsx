import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePresence } from "@/lib/store";
import { ROOMS } from "@/lib/types";
import { formatYearRange } from "@/lib/utils";

export const Route = createFileRoute("/circle")({ component: CirclePage });

function CirclePage() {
  const personas = usePresence((s) => s.personas);
  const resetDemo = usePresence((s) => s.resetDemo);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Família</p>
          <h1 className="mt-2 font-display text-4xl">O círculo</h1>
          <p className="mt-2 max-w-md text-sm text-muted">
            Vivos e memoriais no mesmo lar. Cada presença carrega o que você guardar.
          </p>
        </div>
        <Button asChild>
          <Link to="/create">
            <Plus className="size-4" />
            Trazer presença
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {personas.map((p) => {
          const room = ROOMS.find((r) => r.id === p.room)?.label;
          return (
            <Link key={p.id} to="/persona/$id" params={{ id: p.id }} className="block">
              <Card className="h-full p-5 transition-shadow duration-150 hover:shadow-[var(--shadow-border-hover)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl">{p.name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {p.relationship}
                      {formatYearRange(p.birthYear, p.deathYear)
                        ? ` · ${formatYearRange(p.birthYear, p.deathYear)}`
                        : ""}
                    </p>
                  </div>
                  <Badge tone={p.kind === "living" ? "living" : "memorial"}>
                    {p.isPlayer ? "você" : p.kind === "living" ? "vivo" : "memorial"}
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{p.bio}</p>
                <p className="mt-4 text-xs text-faint">
                  {room} · {p.memories.length} memórias
                  {p.soul ? " · despertada" : ""}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => resetDemo()}
        className="mt-10 inline-flex min-h-11 items-center text-xs text-faint hover:text-muted"
      >
        Restaurar o círculo de demonstração
      </button>
    </Shell>
  );
}
