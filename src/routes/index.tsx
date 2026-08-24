import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, House, Image, Smartphone, Trees } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePresence } from "@/lib/store";
import { FirstPresenceWizard } from "@/components/onboarding/first-presence";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const personas = usePresence((s) => s.personas);
  const complete = usePresence((s) => s.completeOnboarding);
  const memorials = personas.filter((p) => p.kind === "memorial").length;
  const living = personas.filter((p) => p.kind === "living").length;

  return (
    <Shell>
      <section className="stagger-in relative overflow-hidden pb-10 pt-8 md:pt-16">
        <div
          className="pointer-events-none absolute -right-8 top-4 h-64 w-64 rounded-full opacity-40 md:h-96 md:w-96"
          style={{
            background: "radial-gradient(circle, rgb(232 220 200 / 0.22), transparent 68%)",
          }}
          aria-hidden
        />
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">
          O lar virtual da família
        </p>
        <h1 className="mt-4 max-w-xl font-display text-[clamp(2.6rem,8vw,5.2rem)] leading-[0.95] text-foreground">
          Ninguém se despede de todo.
        </h1>
        <p className="mt-6 max-w-lg text-base leading-relaxed text-muted md:text-lg">
          Um mundo à semelhança da casa — para quem está longe e para quem já partiu. Você entra
          como você. A memória, quando confiada, ganha voz. Não é milagre. É presença.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/world" onClick={() => complete()}>
              Entrar no lar
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/create">Trazer uma presença</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link to="/places">Lugares</Link>
          </Button>
        </div>

        <FirstPresenceWizard />
        <p className="mt-4 text-xs text-faint">
          {living} vivos · {memorials} memoriais no círculo de demonstração
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          {
            icon: House,
            title: "Sua persona",
            body: "Os vivos criam a si mesmos — jeito, voz, o que a família deve lembrar — e caminham pela casa.",
          },
          {
            icon: Image,
            title: "O cofre",
            body: "Fotos, vídeos, voz, cartas e histórias de quem partiu. A presença lê o que você entregar.",
          },
          {
            icon: Trees,
            title: "O mundo",
            body: "Sala, cozinha, jardim. Ande pelo celular ou, se tiver headset, em VR. Chegue perto e converse.",
          },
        ].map((s) => (
          <Card key={s.title} className="p-5">
            <s.icon className="size-5 text-accent" />
            <h2 className="mt-4 font-display text-2xl">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </Card>
        ))}
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <h2 className="font-display text-3xl md:text-4xl">Uma reconstrução, não um retorno.</h2>
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted md:text-base">
            A voz que você ouve é feita das memórias que a família confia — o café das cinco, o
            caderno de receitas, o jeito de chamar de meu bem. Ela não substitui o luto, não finge
            pulso, não promete o impossível. Ajuda quem está distante a sentar de novo na mesma
            sala.
          </p>
        </div>
        <Card className="p-5">
          <Smartphone className="size-5 text-linen" />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            No telefone: toque para entrar, joystick para andar, arraste para olhar. No computador:
            WASD e o rato. No headset: modo VR, se o aparelho falar WebXR.
          </p>
        </Card>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl">O círculo</h2>
          <Link
            to="/circle"
            className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground"
          >
            Ver todos
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {personas
            .filter((p) => !p.isPlayer)
            .slice(0, 4)
            .map((p) => (
              <Link key={p.id} to="/persona/$id" params={{ id: p.id }} className="block">
                <Card className="flex items-center justify-between gap-3 p-4 transition-shadow duration-150 hover:shadow-[var(--shadow-border-hover)]">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted">
                      {p.relationship} · {p.kind === "living" ? "vivo" : "memorial"}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-faint" />
                </Card>
              </Link>
            ))}
        </div>
      </section>
    </Shell>
  );
}
