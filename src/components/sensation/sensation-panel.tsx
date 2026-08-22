import { useEffect, useState } from "react";
import { Hand, Heart, Shield, Smartphone, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_SENSATION_PREFS,
  loadSensationPrefs,
  playSensation,
  setSensationPrefs,
  type SensationPrefs,
  connectSuitEndpoint,
  SUIT_PROTOCOL_DOC,
  loadFacialPrefs,
  setFacialPrefs,
  DEFAULT_FACIAL_PREFS,
  type FacialPrefs,
  FACIAL_PROTOCOL_DOC,
} from "@/lib/sensation";

/**
 * Painel de preferências · traje / háptica / consentimento memorial.
 */
export function SensationPanel({ compact }: { compact?: boolean }) {
  const [prefs, setLocal] = useState<SensationPrefs>(DEFAULT_SENSATION_PREFS);
  const [suitUrl, setSuitUrl] = useState("ws://127.0.0.1:8765");
  const [msg, setMsg] = useState<string | null>(null);
  const [facial, setFacial] = useState<FacialPrefs>(DEFAULT_FACIAL_PREFS);

  useEffect(() => {
    setLocal(loadSensationPrefs());
    setFacial(loadFacialPrefs());
  }, []);

  function save(partial: Partial<SensationPrefs>) {
    setSensationPrefs(partial);
    setLocal(loadSensationPrefs());
  }

  async function test(gesture: "hand" | "hug" | "heartbeat") {
    const e = await playSensation({
      gesture,
      personaName: "Teste",
      sourceKind: gesture === "heartbeat" ? "memorial" : "system",
      intensity: 0.6,
    });
    setMsg(
      e
        ? `Sensação “${gesture}” enviada (${Math.round(e.intensity * 100)}%).`
        : "Ative a sensação (e o consentimento memorial, se for o caso).",
    );
  }

  return (
    <Card className={compact ? "space-y-3 p-4" : "space-y-4 p-5"}>
      <div className="flex items-start gap-3">
        <Waves className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">Sensação</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Toques e abraços no corpo — telefone, controlo, VR ou traje háptico futuro.
            Presenças memoriais só com o seu consentimento explícito.
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
        <span className="text-sm">Ativar sensação neste aparelho</span>
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) => save({ enabled: e.target.checked })}
          className="size-4 accent-[var(--accent)]"
        />
      </label>

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5">
        <span className="text-sm leading-snug">
          <span className="font-medium">Consentimento memorial</span>
          <span className="mt-0.5 block text-xs text-faint">
            Permitir padrões suaves (abraço, mão, batimento) atribuídos a quem já partiu —
            reconstrução simbólica, não a pessoa.
          </span>
        </span>
        <input
          type="checkbox"
          checked={prefs.memorialConsent}
          onChange={(e) => save({ memorialConsent: e.target.checked })}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
      </label>

      <div className="space-y-1.5">
        <Label>Intensidade ({Math.round(prefs.intensityScale * 100)}%)</Label>
        <input
          type="range"
          min={0.2}
          max={1.5}
          step={0.05}
          value={prefs.intensityScale}
          onChange={(e) => save({ intensityScale: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["phone", "Telefone (vibração)", Smartphone],
            ["gamepad", "Comando / gamepad", Hand],
            ["xr", "Controladores VR", Waves],
            ["suit", "Traje háptico", Heart],
          ] as const
        ).map(([key, label, Icon]) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={prefs.channels[key]}
              onChange={(e) =>
                save({ channels: { ...prefs.channels, [key]: e.target.checked } })
              }
              className="size-4 accent-[var(--accent)]"
            />
            <Icon className="size-3.5 text-faint" />
            {label}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => test("hand")}>
          Testar toque
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => test("hug")}>
          Testar abraço
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => test("heartbeat")}
        >
          Testar conforto
        </Button>
      </div>

      {msg && <p className="text-xs text-muted">{msg}</p>}

      <div className="space-y-3 border-t border-border/60 pt-3">
        <p className="text-sm font-medium">Háptica facial</p>
        <p className="text-xs text-faint">
          Beijo no rosto, testa, carícia — personalizado por relação. Máscara VR / patch no futuro;
          hoje vibração curta no telefone.
        </p>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span>Ativar háptica facial</span>
          <input
            type="checkbox"
            checked={facial.enabled}
            onChange={(e) => {
              setFacialPrefs({ enabled: e.target.checked });
              setFacial(loadFacialPrefs());
            }}
            className="size-4 accent-[var(--accent)]"
          />
        </label>
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span>
            Consentimento facial
            <span className="mt-0.5 block text-xs text-faint">
              Permito padrões no rosto (incl. memoriais, se o consentimento memorial estiver ativo).
            </span>
          </span>
          <input
            type="checkbox"
            checked={facial.facialConsent}
            onChange={(e) => {
              setFacialPrefs({ facialConsent: e.target.checked });
              setFacial(loadFacialPrefs());
            }}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
        </label>
        <div className="space-y-1">
          <Label>Lado preferido do rosto</Label>
          <select
            className="flex h-10 w-full rounded-md bg-surface-2 px-3 text-sm"
            value={facial.preferredCheek}
            onChange={(e) => {
              setFacialPrefs({
                preferredCheek: e.target.value as FacialPrefs["preferredCheek"],
              });
              setFacial(loadFacialPrefs());
            }}
          >
            <option value="auto">Automático (por persona)</option>
            <option value="left">Face esquerda</option>
            <option value="right">Face direita</option>
          </select>
        </div>
        <details className="text-xs text-faint">
          <summary className="cursor-pointer">Protocolo facial v0.1</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-[10px]">
            {FACIAL_PROTOCOL_DOC}
          </pre>
        </details>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-faint">
          <Shield className="size-3.5" />
          Traje (futuro) — endpoint
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={suitUrl}
            onChange={(e) => setSuitUrl(e.target.value)}
            className="h-10 min-w-[12rem] flex-1 rounded-md bg-surface-2 px-3 text-xs shadow-[var(--shadow-border)]"
            placeholder="ws://127.0.0.1:8765"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              connectSuitEndpoint(suitUrl.trim());
              setMsg("Endpoint do traje registado. Ligue o firmware quando existir.");
            }}
          >
            Ligar bridge
          </Button>
        </div>
        <details className="text-xs text-faint">
          <summary className="cursor-pointer">Protocolo do traje (v0.1)</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-[10px] leading-relaxed">
            {SUIT_PROTOCOL_DOC}
          </pre>
        </details>
      </div>
    </Card>
  );
}
