import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Scan } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ASSET_PIPELINE_DOC, validateGlbRef } from "@/lib/asset-pipeline";
import type { Place } from "@/lib/places";
import { usePresence } from "@/lib/store";
import { uid } from "@/lib/utils";

type ChecklistKey = "captured" | "exported" | "meshopt" | "inPublic" | "collider" | "validated";

const STEPS: { key: ChecklistKey; label: string; hint: string }[] = [
  {
    key: "captured",
    label: "Capturei a casa (Polycam / Scaniverse / similar)",
    hint: "Varra salas com boa luz; evite espelhos e vidro se possível.",
  },
  {
    key: "exported",
    label: "Exportei GLB / glTF",
    hint: "Formato mesh (não só splat) para poder andar e colidir.",
  },
  {
    key: "meshopt",
    label: "Otimizei com Meshopt",
    hint: "npx gltf-transform optimize casa.glb casa-web.glb --compress meshopt",
  },
  {
    key: "inPublic",
    label: "Ficheiro em public/scans/ (ou URL https)",
    hint: "Ex.: public/scans/casa-web.glb → URL /scans/casa-web.glb",
  },
  {
    key: "collider",
    label: "Collider low-poly (recomendado)",
    hint: "Mesh simplificado só para paredes/chão — melhor FPS e oclusão.",
  },
  {
    key: "validated",
    label: "URL validada (formato + opcional HEAD)",
    hint: "A app verifica o caminho antes de guardar.",
  },
];

function CheckRow({
  done,
  label,
  hint,
  onToggle,
}: {
  done: boolean;
  label: string;
  hint: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2/80"
    >
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-faint" />
      )}
      <span>
        <span className={`text-sm font-medium ${done ? "text-foreground" : "text-muted"}`}>
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-faint">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Checklist de import de scan — Fase A.
 * Valida URL, lembra Meshopt, guarda glbUrl + colliderUrl no Place.
 */
export function ScanImportChecklist() {
  const places = usePresence((s) => s.places);
  const upsertPlace = usePresence((s) => s.upsertPlace);
  const setActivePlace = usePresence((s) => s.setActivePlace);

  const scanPlaces = places.filter((p) => p.layout === "scan-glb");
  const [placeId, setPlaceId] = useState(scanPlaces[0]?.id ?? "");
  const [url, setUrl] = useState(scanPlaces[0]?.scan?.glbUrl ?? "/scans/casa-web.glb");
  const [colliderUrl, setColliderUrl] = useState(scanPlaces[0]?.scan?.colliderUrl ?? "");
  const [checks, setChecks] = useState<Record<ChecklistKey, boolean>>({
    captured: false,
    exported: false,
    meshopt: false,
    inPublic: false,
    collider: false,
    validated: false,
  });
  const [busy, setBusy] = useState(false);
  const [showDoc, setShowDoc] = useState(false);

  const requiredDone = checks.captured && checks.exported && checks.meshopt && checks.inPublic;

  const validation = useMemo(() => validateGlbRef({ url: url.trim(), kind: "place" }), [url]);
  const colliderValidation = useMemo(() => {
    if (!colliderUrl.trim()) return { ok: true, errors: [] as string[], warnings: [] as string[] };
    return validateGlbRef({ url: colliderUrl.trim(), kind: "collider" });
  }, [colliderUrl]);

  function toggle(key: ChecklistKey) {
    setChecks((c) => ({ ...c, [key]: !c[key] }));
  }

  async function probeUrl(u: string): Promise<"ok" | "fail" | "skip"> {
    if (!u.startsWith("http://") && !u.startsWith("https://") && !u.startsWith("/")) {
      return "fail";
    }
    // data/blob não provar
    if (u.startsWith("data:") || u.startsWith("blob:")) return "skip";
    // caminhos /public — só validamos formato no cliente
    if (u.startsWith("/")) return "skip";
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(u, { method: "HEAD", mode: "cors", signal: ctrl.signal });
      clearTimeout(t);
      return res.ok ? "ok" : "fail";
    } catch {
      return "fail";
    }
  }

  async function save() {
    if (!validation.ok) {
      toast.error(validation.errors[0] ?? "URL do GLB inválida");
      return;
    }
    if (!colliderValidation.ok) {
      toast.error(colliderValidation.errors[0] ?? "URL do collider inválida");
      return;
    }
    if (!requiredDone) {
      toast.message("Complete os passos obrigatórios do checklist (captura → meshopt → public).");
      return;
    }
    if (!checks.meshopt) {
      toast.message("Recomendado: otimizar com Meshopt antes de publicar em produção.");
    }

    setBusy(true);
    try {
      const probe = await probeUrl(url.trim());
      if (probe === "fail") {
        toast.error("Não foi possível aceder à URL (HEAD falhou). Confirme o link.");
        setBusy(false);
        return;
      }

      setChecks((c) => ({ ...c, validated: true }));

      const place = places.find((p) => p.id === placeId);
      if (!place) {
        toast.error("Escolha ou crie um lugar scan-glb.");
        setBusy(false);
        return;
      }

      const next: Place = {
        ...place,
        layout: "scan-glb",
        scan: {
          ...place.scan,
          glbUrl: url.trim(),
          colliderUrl: colliderUrl.trim() || place.scan?.colliderUrl,
          source: place.scan?.source ?? "upload",
          notes: [
            place.scan?.notes,
            checks.meshopt ? "meshopt:sim" : "meshopt:não-confirmado",
            checks.collider && colliderUrl.trim() ? "collider:sim" : undefined,
          ]
            .filter(Boolean)
            .join(" · "),
          capturedAt: place.scan?.capturedAt ?? Date.now(),
        },
      };
      upsertPlace(next);
      for (const w of validation.warnings) toast.message(w);
      toast.success("Scan ligado ao lugar. Entre no mundo para testar.");
    } finally {
      setBusy(false);
    }
  }

  function createScanPlace() {
    const id = uid("place");
    const place: Place = {
      id,
      kind: "home",
      name: "Casa escaneada",
      description: "Lugar a partir de fotogrametria / scan 3D.",
      where: "Scan",
      visibility: "circle",
      personaIds: [],
      anchors: [],
      layout: "scan-glb",
      scan: {
        glbUrl: url.trim() || undefined,
        source: "upload",
      },
    };
    upsertPlace(place);
    setPlaceId(id);
    setActivePlace(id);
    toast.success("Lugar scan-glb criado.");
  }

  return (
    <Card className="mt-6 space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Scan className="mt-0.5 size-5 text-accent" />
        <div>
          <h2 className="font-display text-xl">Import de scan da casa</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Checklist antes de publicar o GLB no lar. Sem isto o resto parte de chão instável.
          </p>
        </div>
      </div>

      <div className="space-y-1 rounded-lg border border-border/50 bg-surface-2/40 p-2">
        {STEPS.map((s) => (
          <CheckRow
            key={s.key}
            done={checks[s.key]}
            label={s.label}
            hint={s.hint}
            onToggle={() => toggle(s.key)}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Lugar (layout scan-glb)</Label>
          {scanPlaces.length === 0 ? (
            <Button type="button" variant="outline" className="w-full" onClick={createScanPlace}>
              Criar lugar scan-glb
            </Button>
          ) : (
            <select
              className="flex h-11 w-full rounded-md bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)]"
              value={placeId}
              onChange={(e) => {
                const id = e.target.value;
                setPlaceId(id);
                const p = places.find((x) => x.id === id);
                if (p?.scan?.glbUrl) setUrl(p.scan.glbUrl);
                if (p?.scan?.colliderUrl) setColliderUrl(p.scan.colliderUrl);
              }}
            >
              {scanPlaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>URL do GLB visual</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/scans/casa-web.glb"
          />
          {!validation.ok && <p className="text-xs text-destructive">{validation.errors[0]}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>URL do collider (opcional)</Label>
          <Input
            value={colliderUrl}
            onChange={(e) => setColliderUrl(e.target.value)}
            placeholder="/scans/casa-collider.glb"
          />
          {!colliderValidation.ok && (
            <p className="text-xs text-destructive">{colliderValidation.errors[0]}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "A validar…" : "Validar e guardar no lugar"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowDoc((v) => !v)}>
          {showDoc ? "Ocultar pipeline" : "Ver comando Meshopt"}
        </Button>
        {scanPlaces.length > 0 && (
          <Button type="button" variant="outline" onClick={createScanPlace}>
            Novo lugar scan
          </Button>
        )}
      </div>

      {showDoc && (
        <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
          {ASSET_PIPELINE_DOC}
        </pre>
      )}

      <p className="text-xs text-faint">
        Se o GLB falhar no mundo, o Presença usa o cômodo por medidas (fallback). Collider alimenta
        navmesh e oclusão.
      </p>
    </Card>
  );
}
