import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Caixa de configuração isolada — título, efeito no código, conteúdo.
 */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  effect,
  children,
  className,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Onde esta config altera o runtime (honestidade de engenharia). */
  effect: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-24 space-y-4 p-5", className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
          <p className="mt-2 rounded-md bg-surface-2/80 px-2.5 py-1.5 font-mono text-[10px] leading-snug text-faint">
            Efeito: {effect}
          </p>
        </div>
      </div>
      <div className="border-t border-border/40 pt-4">{children}</div>
    </Card>
  );
}

export function SettingsNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="Secções de configuração"
      className="sticky top-[4.25rem] z-20 -mx-1 flex gap-1 overflow-x-auto px-1 pb-2"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="shrink-0 rounded-full bg-surface/90 px-3 py-1.5 text-xs text-muted shadow-[var(--shadow-border)] transition-colors hover:text-foreground"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
