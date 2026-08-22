import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card p-4 text-card-foreground shadow-[var(--shadow-border)]",
        className,
      )}
      {...props}
    />
  );
}
