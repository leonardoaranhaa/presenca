import { useState } from "react";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAYER_ID } from "@/lib/seed";
import { usePresence } from "@/lib/store";
import type { BodyScan } from "@/lib/types";
import { featureAllowed, loadPrivacyPrefs } from "@/lib/lgpd";
import { MIXAMO_GUIDE } from "@/lib/mixamo";

/**
 * UI mínima — “O meu corpo”: ligar GLB de scan ao persona do jogador.
 * Privacidade: ficheiro local / URL; não enviamos para treino.
 */
export function MyBodyPanel() {
  const personas = usePresence((s) => s.personas);
  const upsertPersona = usePresence((s) => s.upsertPersona);
  const player = personas.find((p) => p.id === PLAYER_ID || p.isPlayer);
  const [url, setUrl] = useState(player?.bodyScan?.glbUrl ?? "/avatars/eu.glb");
  const [height, setHeight] = useState(player?.bodyScan?.heightM ?? 1.7);
  const [msg, setMsg] = useState<string | null>(null);

  if (!player) return null;

  function save(scan: BodyScan | undefined) {
    if (scan && !featureAllowed("allowBodyScan", loadPrivacyPrefs())) {
      setMsg("Scan de corpo desativado nas preferências de privacidade.");
      return;
    }
    upsertPersona({ ...player!, bodyScan: scan });
    setMsg(scan?.glbUrl ? "Corpo digital guardado. Entre no mundo para ver." : "Scan removido — volta a cápsula.");
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb") && !file.name.toLowerCase().endsWith(".gltf")) {
      setMsg("Use um ficheiro .glb ou .gltf.");
      return;
    }
    // data URL — ok para demos pequenas; produção: upload para storage privado
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      save({
        glbUrl: dataUrl,
        heightM: height,
        source: "upload",
        capturedAt: Date.now(),
        notes: file.name,
      });
      setUrl("(ficheiro local)");
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <User className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">O meu corpo</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Traga o seu corpo digital para o lar — scan 3D (Polycam, RealityScan) ou modelo GLB.
            Fica na sua persona de visitante; não treinamos modelos com este ficheiro.
          </p>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-xs text-faint">
        <li>Capture o corpo (T-pose ajuda) e exporte GLB.</li>
        <li>
          Otimize:{" "}
          <code className="text-foreground">
            npx @gltf-transform/cli optimize eu.glb public/avatars/eu.glb --compress draco
          </code>
        </li>
        <li>Indique a URL ou carregue o ficheiro abaixo.</li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="body-url">URL do GLB</Label>
          <Input
            id="body-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/avatars/eu.glb"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body-h">Altura (m)</Label>
          <Input
            id="body-h"
            type="number"
            step="0.01"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 1.7)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body-file">Ou ficheiro local</Label>
          <Input
            id="body-file"
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() =>
            save({
              glbUrl: url.trim(),
              heightM: height,
              source: player.bodyScan?.source === "mixamo" ? "mixamo" : "upload",
              rigged: player.bodyScan?.rigged,
              capturedAt: Date.now(),
            })
          }
        >
          Guardar corpo digital
        </Button>
        <Button type="button" variant="outline" onClick={() => save(undefined)}>
          Usar avatar simples
        </Button>
      </div>

      {player.bodyScan?.glbUrl && (
        <p className="text-xs text-accent">
          Scan ativo
          {player.bodyScan.notes ? ` · ${player.bodyScan.notes}` : ""}
          {player.bodyScan.heightM ? ` · ${player.bodyScan.heightM} m` : ""}
        </p>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}

      <div className="space-y-2 border-t border-border/60 pt-3">
        <p className="text-sm font-medium">Rig automático (Mixamo)</p>
        <p className="text-xs text-muted leading-relaxed">
          <strong className="text-foreground">Sem Mixamo:</strong> pack procedural (idle/walk/abraço)
          por nomes de bones ou bob no mesh estático.{" "}
          <strong className="text-foreground">Com Mixamo:</strong> clips Idle/Walk/Hug no AnimationMixer.
          Debug: <code className="text-[10px]">window.__avatarAnimMode</code>
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={!!player.bodyScan?.rigged}
            onChange={(e) => {
              if (!player.bodyScan?.glbUrl) return;
              save({ ...player.bodyScan, rigged: e.target.checked, source: "mixamo" });
            }}
          />
          Este GLB veio do Mixamo (com animações)
        </label>
        <details className="text-xs text-faint">
          <summary className="cursor-pointer">Passo a passo Mixamo</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-[10px] leading-relaxed">
            {MIXAMO_GUIDE}
          </pre>
        </details>
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        Privacidade: o GLB fica no armazenamento local do browser (ou na URL que indicar). Não partilhe
        scans de menores. O corpo digital é representação para o encontro — não identidade legal.
      </p>
    </Card>
  );
}
