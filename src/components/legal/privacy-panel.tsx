import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DATA_INVENTORY,
  POLICY_VERSION,
  PRIVACY_NOTICE_SHORT,
  acceptPolicy,
  hasValidPolicyAcceptance,
  loadPrivacyPrefs,
  savePrivacyPrefs,
  type PrivacyPrefs,
} from "@/lib/lgpd";
import { usePresence } from "@/lib/store";

export function PrivacyPanel() {
  const [prefs, setPrefs] = useState<PrivacyPrefs>(loadPrivacyPrefs());
  const [msg, setMsg] = useState<string | null>(null);
  const exportLocal = usePresence((s) => s.exportLocalData);
  const wipeLocal = usePresence((s) => s.wipeLocalData);

  useEffect(() => {
    setPrefs(loadPrivacyPrefs());
  }, []);

  function toggle(key: keyof PrivacyPrefs, value: boolean) {
    setPrefs(savePrivacyPrefs({ [key]: value }));
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Shield className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">Privacidade e LGPD</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">
            {PRIVACY_NOTICE_SHORT}
          </p>
          <p className="mt-2 text-xs text-faint">Versão da política: {POLICY_VERSION}</p>
        </div>
      </div>

      {!hasValidPolicyAcceptance(prefs) && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm">
          <p className="text-muted">
            Para continuar alinhado à LGPD, confirme que leu o aviso de privacidade.
          </p>
          <Button
            type="button"
            className="mt-2"
            onClick={() => {
              setPrefs(acceptPolicy());
              setMsg("Aceite registado neste dispositivo.");
            }}
          >
            Li e aceito o tratamento descrito
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Consentimentos (pode desligar)</p>
        {(
          [
            ["storeChatHistory", "Guardar histórico de chat no aparelho"],
            ["allowVoiceClone", "Permitir clone de voz (terceiro)"],
            ["allowBodyScan", "Permitir scan 3D do corpo"],
            ["allowRealtime", "Multiplayer / posição em tempo real"],
            ["allowLiveVoice", "Voz ao vivo (WebRTC)"],
            ["allowWellnessNudge", "Avisos de uso intenso (saúde emocional)"],
            ["memorialFamilyAuthority", "Declaro legitimidade familiar sobre memoriais"],
          ] as [keyof PrivacyPrefs, string][]
        ).map(([key, label]) => (
          <label
            key={String(key)}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm"
          >
            <span>{label}</span>
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={Boolean(prefs[key])}
              onChange={(e) => toggle(key, e.target.checked)}
            />
          </label>
        ))}
      </div>

      <details className="text-xs text-faint">
        <summary className="cursor-pointer">Inventário de tratamentos (para o jurídico)</summary>
        <ul className="mt-2 space-y-2">
          {DATA_INVENTORY.map((row) => (
            <li key={row.id} className="rounded-md bg-surface-2 p-2">
              <span className="text-foreground">{row.id}</span> — {row.purpose}
              <br />
              Base: {row.basis} · Armazenamento: {row.storage}
              {row.thirdParty ? ` · ${row.thirdParty}` : ""} · {row.retention}
              {row.sensitive ? " · sensível" : ""}
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const data = exportLocal();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `presenca-export-${Date.now()}.json`;
            a.click();
            setMsg("Exportação local descarregada (portabilidade).");
          }}
        >
          Exportar os meus dados
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (confirm("Apagar personas, memórias e chat deste aparelho? Esta ação não desfaz.")) {
              wipeLocal();
              setMsg("Dados locais apagados.");
            }
          }}
        >
          Apagar dados locais
        </Button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </Card>
  );
}
