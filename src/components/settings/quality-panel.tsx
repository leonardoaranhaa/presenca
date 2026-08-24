import { usePresence } from "@/lib/store";
import type { QualityTier } from "@/lib/quality";

const TIERS: { id: QualityTier | "auto"; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Detecta o aparelho" },
  { id: "low", label: "Baixa", hint: "Sem sombras, DPR baixo" },
  { id: "mid", label: "Média", hint: "Sombras 512" },
  { id: "high", label: "Alta", hint: "Sombras 1024, antialias" },
];

/**
 * Qualidade 3D — grava qualityTier no store; experience.tsx aplica dpr/shadows.
 */
export function QualityPanel() {
  const qualityTier = usePresence((s) => s.qualityTier);
  const setQualityTier = usePresence((s) => s.setQualityTier);
  const quality = usePresence((s) => s.getQuality());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setQualityTier(t.id)}
            className={
              qualityTier === t.id
                ? "h-11 rounded-full bg-primary px-4 text-xs text-primary-foreground"
                : "h-11 rounded-full bg-surface-2 px-4 text-xs text-muted hover:text-foreground"
            }
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[11px] text-faint sm:grid-cols-4">
        <div>
          <dt>DPR</dt>
          <dd className="text-foreground">
            {quality.dpr[0]}–{quality.dpr[1]}
          </dd>
        </div>
        <div>
          <dt>Sombras</dt>
          <dd className="text-foreground">
            {quality.shadows ? `${quality.shadowMapSize}px` : "off"}
          </dd>
        </div>
        <div>
          <dt>Antialias</dt>
          <dd className="text-foreground">{quality.antialias ? "sim" : "não"}</dd>
        </div>
        <div>
          <dt>Tier ativo</dt>
          <dd className="text-foreground">{qualityTier}</dd>
        </div>
      </dl>
    </div>
  );
}
