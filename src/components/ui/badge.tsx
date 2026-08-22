import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "accent" | "living" | "memorial" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        tone === "muted" && "bg-surface-2 text-muted",
        tone === "accent" && "bg-accent/20 text-accent",
        tone === "living" && "bg-accent/15 text-accent",
        tone === "memorial" && "bg-linen/10 text-linen",
        className,
      )}
      {...props}
    />
  );
}
