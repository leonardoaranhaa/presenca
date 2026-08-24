import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Users, Trees, MapPin, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Lar", icon: Home },
  { to: "/world", label: "Mundo", icon: Trees },
  { to: "/places", label: "Lugares", icon: MapPin },
  { to: "/circle", label: "Círculo", icon: Users },
  { to: "/settings", label: "Ajustes", icon: Settings },
] as const;

export function Shell({ children, flush = false }: { children: React.ReactNode; flush?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="relative min-h-dvh window-glow">
      <div className="grain" aria-hidden />
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md md:px-8">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-display text-xl tracking-tight text-foreground"
        >
          Presença
        </Link>
        <nav className="flex items-center gap-1 rounded-full bg-surface/80 p-1 shadow-[var(--shadow-border)]">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                // O rótulo esconde-se abaixo de sm e sobra só o ícone: sem isto,
                // quem usa leitor de ecrã não sabe para onde o link vai.
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // h-11 (44px) é o mínimo tátil. Este produto é para a família toda,
                  // incluindo quem já não acerta em alvos de 40px ao primeiro toque.
                  "flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm transition-colors duration-150",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <div className={cn(flush ? "" : "mx-auto w-full max-w-5xl px-4 pb-16 md:px-8")}>
        {children}
      </div>
    </div>
  );
}
