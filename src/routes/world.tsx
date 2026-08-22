import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";

export const Route = createFileRoute("/world")({
  component: WorldPage,
});

function WorldPage() {
  const [Client, setClient] = useState<ComponentType | null>(null);
  useEffect(() => {
    void import("@/components/world/experience").then((m) => {
      setClient(() => m.WorldExperience);
    });
  }, []);
  if (!Client) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted">
        Abrindo o lar…
      </div>
    );
  }
  return <Client />;
}
