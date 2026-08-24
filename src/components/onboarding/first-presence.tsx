import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Heart, House, MessageCircle, Trees } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePresence } from "@/lib/store";

const STEPS = [
  {
    id: "ethics",
    title: "Isto é presença mímica",
    body: "Não é a pessoa real. É memória dada à fala — conforto no luto, sem fingir ressurreição. Pode sair quando quiser.",
    icon: Heart,
  },
  {
    id: "place",
    title: "O lar",
    body: "Use a Casa Oliveira de exemplo, um cômodo por medidas, ou importe um scan GLB. É onde a família se encontra.",
    icon: House,
    link: { to: "/places" as const, label: "Ver lugares" },
  },
  {
    id: "presence",
    title: "Uma presença",
    body: "Traga alguém do círculo (demo) ou crie um memorial com fotos, histórias e voz. O cérebro mímico aprende com o que confiar.",
    icon: MessageCircle,
    link: { to: "/create" as const, label: "Trazer presença" },
  },
  {
    id: "enter",
    title: "Entrar e aproximar",
    body: "No mundo, aproxime-se (≤ 2,5 m) para conversar, ouvir e, se consentir, sentir um gesto. A saída suave avisa se ficar demasiado tempo.",
    icon: Trees,
    link: { to: "/world" as const, label: "Entrar no lar" },
  },
] as const;

/**
 * Onboarding ~10 min: ética → lugar → presença → mundo.
 * Só aparece se ainda não completou (onboarded).
 */
export function FirstPresenceWizard({ force = false }: { force?: boolean }) {
  const onboarded = usePresence((s) => s.onboarded);
  const complete = usePresence((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);

  if (onboarded && !force) return null;

  const current = STEPS[step]!;
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <Card className="mt-8 space-y-4 border-accent/30 p-5 shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          Primeira presença · passo {step + 1}/{STEPS.length}
        </p>
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <span
              key={STEPS[i]!.id}
              className={
                i <= step
                  ? "h-1.5 w-6 rounded-full bg-accent"
                  : "h-1.5 w-6 rounded-full bg-surface-2"
              }
            />
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-6 shrink-0 text-accent" />
        <div>
          <h2 className="font-display text-2xl">{current.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
        </div>
      </div>

      {"link" in current && current.link && (
        <Button asChild variant="outline" size="sm">
          <Link to={current.link.to}>{current.link.label}</Link>
        </Button>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {step > 0 && (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
            Voltar
          </Button>
        )}
        {!last ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Continuar
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button asChild onClick={() => complete()}>
            <Link to="/world">
              <Check className="size-4" />
              Concluir e entrar no lar
            </Link>
          </Button>
        )}
        <Button type="button" variant="ghost" className="text-faint" onClick={() => complete()}>
          Já conheço — saltar
        </Button>
      </div>
    </Card>
  );
}
