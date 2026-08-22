import { useEffect, useState } from "react";
import {
  loadWellness,
  markSoftExitShown,
  pickSoftExitLine,
  softExitLevel,
  snoozeSoftExit,
  type SoftExitLevel,
} from "@/lib/ethics";
import { featureAllowed, loadPrivacyPrefs } from "@/lib/lgpd";
import { Button } from "@/components/ui/button";

export function SoftExitBanner({ tick }: { tick?: number }) {
  const [level, setLevel] = useState<SoftExitLevel>("none");
  const [line, setLine] = useState("");

  useEffect(() => {
    if (!featureAllowed("allowWellnessNudge", loadPrivacyPrefs())) {
      setLevel("none");
      return;
    }
    const l = softExitLevel(loadWellness());
    setLevel(l);
    if (l !== "none") setLine(pickSoftExitLine());
  }, [tick]);

  if (level === "none") return null;

  return (
    <div
      className={
        level === "clear"
          ? "rounded-xl border border-accent/40 bg-background/95 p-4 text-sm shadow-lg backdrop-blur"
          : "rounded-xl border border-border/60 bg-surface/95 p-3 text-sm shadow-md backdrop-blur"
      }
      role="status"
    >
      <p className="font-medium text-foreground">
        {level === "clear" ? "Um intervalo pode fazer bem" : "Pausa suave"}
      </p>
      <p className="mt-1 leading-relaxed text-muted">{line}</p>
      <p className="mt-2 text-xs text-faint">
        A presença fica guardada. CVV 188 (Brasil) se precisar de escuta humana agora.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            markSoftExitShown();
            setLevel("none");
          }}
        >
          Entendi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            snoozeSoftExit(24);
            setLevel("none");
          }}
        >
          Não mostrar por 24h
        </Button>
      </div>
    </div>
  );
}
