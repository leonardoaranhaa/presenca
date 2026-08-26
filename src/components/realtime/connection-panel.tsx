import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadRealtimeConfig, saveRealtimeConfig, type RealtimeConfig } from "@/lib/realtime";
import {
  loadIceConfig,
  saveIceConfig,
  buildIceServers,
  TURN_SETUP_DOC,
  type IceStoredConfig,
} from "@/lib/ice-config";

export function ConnectionPanel() {
  const [cfg, setCfg] = useState<RealtimeConfig>({ provider: "local" });
  const [ice, setIce] = useState<IceStoredConfig>({
    enabled: false,
    turnUrls: "",
    username: "",
    credential: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setCfg(loadRealtimeConfig());
    setIce(loadIceConfig());
  }, []);

  function save(next: RealtimeConfig) {
    saveRealtimeConfig(next);
    setCfg(next);
    setMsg("Guardado. Volte a entrar no mundo para reconectar.");
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Radio className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">Interconexão</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Vivos no mesmo lugar em tempo real. Local = abas neste aparelho. PartyKit = família em
            dispositivos diferentes. A voz (WebRTC) usa o mesmo canal só para sinalização.
          </p>
        </div>
      </div>

      {cfg.provider === "local" && (
        <div
          className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted shadow-[var(--shadow-border)]"
          role="status"
        >
          <strong className="font-medium text-foreground">
            Neste modo a família não se encontra.
          </strong>{" "}
          O modo local só liga separadores abertos neste mesmo browser — serve para experimentar
          sozinho. Para duas pessoas em aparelhos diferentes estarem no mesmo lugar é preciso o
          PartyKit, publicado à parte.
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Modo</Label>
        <select
          className="flex h-11 w-full rounded-md bg-surface-2 px-3 text-sm"
          value={cfg.provider}
          onChange={(e) =>
            setCfg({
              ...cfg,
              provider: e.target.value as RealtimeConfig["provider"],
            })
          }
        >
          <option value="local">Local (BroadcastChannel)</option>
          <option value="partykit">PartyKit</option>
          <option value="ws">WebSocket custom</option>
        </select>
      </div>

      {cfg.provider === "partykit" && (
        <>
          <div className="space-y-1.5">
            <Label>Host PartyKit</Label>
            <Input
              value={cfg.host ?? ""}
              onChange={(e) => setCfg({ ...cfg, host: e.target.value })}
              placeholder="presenca.seu-user.partykit.dev"
            />
          </div>
          <p className="text-xs text-faint">
            Terminal: <code className="text-foreground">npx partykit dev</code> ou{" "}
            <code className="text-foreground">npx partykit deploy</code>. Sala = id do lugar ativo.
          </p>
        </>
      )}

      {cfg.provider === "ws" && (
        <div className="space-y-1.5">
          <Label>URL WebSocket</Label>
          <Input
            value={cfg.wsUrl ?? ""}
            onChange={(e) => setCfg({ ...cfg, wsUrl: e.target.value })}
            placeholder="wss://exemplo.com/room/{room}"
          />
        </div>
      )}

      <Button type="button" onClick={() => save(cfg)}>
        Guardar ligação
      </Button>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <p className="text-sm font-medium">LiveKit SFU (recomendado)</p>
        <p className="text-xs text-muted leading-relaxed">
          Com ≥ 6 pessoas (ou se marcar “preferir LiveKit”) a voz usa o SFU LiveKit. Servidor:{" "}
          <code className="text-[10px]">LIVEKIT_URL</code>,{" "}
          <code className="text-[10px]">LIVEKIT_API_KEY</code>,{" "}
          <code className="text-[10px]">LIVEKIT_API_SECRET</code>. Cliente:{" "}
          <code className="text-[10px]">npm i livekit-client</code>. Token via{" "}
          <code className="text-[10px]">/api/livekit/token</code>.
        </p>
        <Label>URL LiveKit (wss)</Label>
        <Input
          value={cfg.livekitUrl ?? ""}
          onChange={(e) => setCfg({ ...cfg, livekitUrl: e.target.value })}
          placeholder="wss://presenca-xxxx.livekit.cloud"
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={!!cfg.preferLivekit}
            onChange={(e) => setCfg({ ...cfg, preferLivekit: e.target.checked })}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          Preferir LiveKit mesmo com poucos peers
        </label>
        <Label className="mt-2">SFU genérico (fallback mock/mediasoup)</Label>
        <Input
          value={cfg.sfuUrl ?? ""}
          onChange={(e) => setCfg({ ...cfg, sfuUrl: e.target.value })}
          placeholder="wss://sfu.exemplo.com/voice"
        />
        <Button type="button" size="sm" variant="outline" onClick={() => save(cfg)}>
          Guardar SFU / LiveKit
        </Button>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <p className="text-sm font-medium">TURN (WebRTC / voz)</p>
        <p className="text-xs text-muted leading-relaxed">
          Retransmite áudio quando o peer-to-peer falha (4G, redes fechadas). Preferível: API{" "}
          <code className="text-[10px] text-foreground">/api/turn/credentials</code> com{" "}
          <code className="text-[10px] text-foreground">TURN_SECRET</code> (credenciais a expirar).
          Abaixo é fallback no browser (menos seguro).
        </p>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span>Usar servidor TURN</span>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-[var(--accent)]"
            checked={ice.enabled}
            onChange={(e) => setIce({ ...ice, enabled: e.target.checked })}
          />
        </label>
        <div className="space-y-1.5">
          <Label>URLs TURN</Label>
          <Input
            value={ice.turnUrls}
            onChange={(e) => setIce({ ...ice, turnUrls: e.target.value })}
            placeholder="turn:host:3478,turns:host:5349"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              value={ice.username}
              onChange={(e) => setIce({ ...ice, username: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Credential</Label>
            <Input
              type="password"
              value={ice.credential}
              onChange={(e) => setIce({ ...ice, credential: e.target.value })}
              autoComplete="off"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            saveIceConfig(ice);
            const n = buildIceServers(ice).length;
            setMsg(`TURN guardado · ${n} ICE server(s). Reentre na voz para aplicar.`);
          }}
        >
          Guardar TURN
        </Button>
        <details className="text-xs text-faint">
          <summary className="cursor-pointer">Como obter TURN (coturn / Metered)</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-[10px]">
            {TURN_SETUP_DOC}
          </pre>
        </details>
      </div>

      {msg && <p className="text-xs text-muted">{msg}</p>}
    </Card>
  );
}
