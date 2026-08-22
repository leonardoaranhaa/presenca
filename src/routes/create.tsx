import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { PersonaForm } from "@/components/persona/persona-form";

export const Route = createFileRoute("/create")({ component: CreatePage });

function CreatePage() {
  return (
    <Shell>
      <div className="pt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Nova presença</p>
        <h1 className="mt-2 font-display text-4xl">Quem entra no lar</h1>
        <p className="mt-2 max-w-lg text-sm text-muted">
          Uma persona viva de si mesmo — ou o retrato de quem já partiu, feito de tudo o que ainda se
          lembra.
        </p>
      </div>
      <div className="mt-8">
        <PersonaForm kind="memorial" />
      </div>
    </Shell>
  );
}
