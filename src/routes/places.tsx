import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Trees, Users, Ruler, Scan } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { layoutLabel, placeKindLabel, type Place } from "@/lib/places";
import { clampMetrics, DEFAULT_METRICS } from "@/lib/room-metrics";
import { usePresence } from "@/lib/store";
import { uid } from "@/lib/utils";
import { SensationPanel } from "@/components/sensation/sensation-panel";
import { MyBodyPanel } from "@/components/persona/my-body-panel";
import { ConnectionPanel } from "@/components/realtime/connection-panel";
import { ServiceStatusPanel } from "@/components/feedback/service-status-panel";
import { PrivacyPanel } from "@/components/legal/privacy-panel";

export const Route = createFileRoute("/places")({ component: PlacesPage });

function PlacesPage() {
  const places = usePresence((s) => s.places);
  const activePlaceId = usePresence((s) => s.activePlaceId);
  const setActivePlace = usePresence((s) => s.setActivePlace);
  const upsertPlace = usePresence((s) => s.upsertPlace);
  const qualityTier = usePresence((s) => s.qualityTier);
  const setQualityTier = usePresence((s) => s.setQualityTier);
  const quality = usePresence((s) => s.getQuality());

  return (
    <Shell>
      <div className="pt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Espaços reais e memoriais</p>
        <h1 className="mt-2 font-display text-4xl">Lugares</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Casa atual, cômodo por medidas, scan de fotogrametria ou lugar que só existe na memória.
          Vivos se encontram em tempo real; presenças memoriais ficam nos âncoras.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs text-faint">Qualidade 3D:</span>
        {(["auto", "low", "mid", "high"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setQualityTier(t)}
            className={
              qualityTier === t
                ? "h-9 rounded-full bg-primary px-3 text-xs text-primary-foreground"
                : "h-9 rounded-full bg-surface-2 px-3 text-xs text-muted"
            }
          >
            {t}
          </button>
        ))}
        <span className="text-xs text-faint">
          ativo: {quality.tier} · sombras {quality.shadows ? quality.shadowMapSize : "off"}
        </span>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {places.map((place) => {
          const active = place.id === activePlaceId;
          return (
            <Card key={place.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge tone="muted">{placeKindLabel(place.kind)}</Badge>
                  <h2 className="mt-2 font-display text-2xl">{place.name}</h2>
                  <p className="mt-1 text-xs text-faint">
                    {place.where}
                    {place.years ? ` · ${place.years}` : ""}
                  </p>
                </div>
                {active && <Badge tone="accent">atual</Badge>}
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{place.description}</p>
              <p className="mt-2 text-xs text-faint">{layoutLabel(place.layout)}</p>
              {place.metrics && place.layout === "simple-room" && (
                <p className="text-xs text-faint">
                  {place.metrics.widthM}×{place.metrics.depthM} m · pé-direito{" "}
                  {place.metrics.heightM} m
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-faint">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" />
                  {place.personaIds.length} presenças
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {place.visibility}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={active ? "secondary" : "outline"}
                  onClick={() => setActivePlace(place.id)}
                >
                  Definir como atual
                </Button>
                <Button asChild size="sm">
                  <Link to="/world" onClick={() => setActivePlace(place.id)}>
                    <Trees className="size-4" />
                    Entrar
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <NewSimpleRoom
        onCreate={upsertPlace}
        onEnter={(id) => {
          setActivePlace(id);
        }}
      />
      <AttachScanGlb />
      <PhotogrammetryGuide />

      <div className="mt-6">
        <MyBodyPanel />
      </div>
      <div className="mt-6">
        <SensationPanel />
      </div>

      <div className="mt-6">
        <ServiceStatusPanel />

        <PrivacyPanel />
      </div>
      <div className="mt-6">
        <ConnectionPanel />
      </div>

      <Card className="mt-6 hidden p-5">
        <h2 className="font-display text-xl">Interconexão</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Canal local (BroadcastChannel) entre abas. Próximo passo: PartyKit / WebSocket no mesmo
          contrato <code className="text-xs">RealtimeTransport</code> em{" "}
          <code className="text-xs">lib/realtime.ts</code>.
        </p>
      </Card>
    </Shell>
  );
}

function NewSimpleRoom({
  onCreate,
  onEnter,
}: {
  onCreate: (p: Place) => void;
  onEnter: (id: string) => void;
}) {
  const [name, setName] = useState("Minha sala");
  const [w, setW] = useState(5.5);
  const [d, setD] = useState(4.2);
  const [h, setH] = useState(2.7);

  function create() {
    const metrics = clampMetrics({ widthM: w, depthM: d, heightM: h, windowCount: 2 });
    const id = uid("place");
    const place: Place = {
      id,
      kind: "home",
      name: name.trim() || "Cômodo",
      description: `Gerado por medidas: ${metrics.widthM}×${metrics.depthM} m, pé-direito ${metrics.heightM} m.`,
      where: "Medidas manuais",
      visibility: "circle",
      personaIds: ["persona_you"],
      anchors: [
        { id: "a1", label: "Centro", room: "living", x: 0, z: 0 },
        { id: "a2", label: "Sofá", room: "living", x: 0, z: -metrics.depthM / 2 + 1.4 },
      ],
      layout: "simple-room",
      metrics,
    };
    onCreate(place);
    onEnter(id);
  }

  return (
    <Card className="mt-10 space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Ruler className="size-5 text-accent" />
        <h2 className="font-display text-xl">Novo cômodo por medidas</h2>
      </div>
      <p className="text-sm text-muted">
        Meça largura, profundidade e pé-direito com uma trena. O mundo gera paredes, porta e janelas
        — útil antes do scan 3D ou para lugares aproximados.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rn">Nome</Label>
          <Input id="rn" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rw">Largura (m)</Label>
          <Input
            id="rw"
            type="number"
            step="0.1"
            value={w}
            onChange={(e) => setW(Number(e.target.value) || DEFAULT_METRICS.widthM)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rd">Profundidade (m)</Label>
          <Input
            id="rd"
            type="number"
            step="0.1"
            value={d}
            onChange={(e) => setD(Number(e.target.value) || DEFAULT_METRICS.depthM)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rh">Pé-direito (m)</Label>
          <Input
            id="rh"
            type="number"
            step="0.1"
            value={h}
            onChange={(e) => setH(Number(e.target.value) || DEFAULT_METRICS.heightM)}
          />
        </div>
      </div>
      <Button onClick={create}>Criar e definir como atual</Button>
    </Card>
  );
}

function AttachScanGlb() {
  const places = usePresence((s) => s.places);
  const upsertPlace = usePresence((s) => s.upsertPlace);
  const scanPlaces = places.filter((p) => p.layout === "scan-glb");
  const [url, setUrl] = useState("/scans/casa-web.glb");
  const [placeId, setPlaceId] = useState(scanPlaces[0]?.id ?? "");

  if (scanPlaces.length === 0) return null;

  return (
    <Card className="mt-6 space-y-3 p-5">
      <h2 className="font-display text-xl">Anexar GLB ao lugar scan</h2>
      <p className="text-sm text-muted">
        Depois de colocar o arquivo em <code className="text-xs">public/scans/</code>, informe a URL
        pública.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Lugar</Label>
          <select
            className="flex h-11 w-full rounded-md bg-surface-2 px-3 text-sm shadow-[var(--shadow-border)]"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
          >
            {scanPlaces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>URL do GLB</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/scans/casa-web.glb"
          />
        </div>
      </div>
      <Button
        type="button"
        onClick={() => {
          const place = places.find((p) => p.id === placeId);
          if (!place) return;
          upsertPlace({
            ...place,
            scan: {
              ...place.scan,
              glbUrl: url.trim(),
              source: place.scan?.source ?? "upload",
            },
          });
        }}
      >
        Guardar GLB no lugar
      </Button>
    </Card>
  );
}

function PhotogrammetryGuide() {
  return (
    <Card className="mt-6 space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Scan className="size-5 text-linen" />
        <h2 className="font-display text-xl">Fotogrametria / scan da casa real</h2>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
        <li>
          Capture com <strong className="text-foreground">Polycam</strong> ou{" "}
          <strong className="text-foreground">Scaniverse</strong> (LiDAR no iPhone Pro ajuda).
        </li>
        <li>
          Exporte <strong className="text-foreground">GLB / glTF</strong>.
        </li>
        <li>
          Otimize:{" "}
          <code className="text-xs text-foreground">
            npx @gltf-transform/cli optimize casa.glb casa-web.glb --compress draco
          </code>
        </li>
        <li>
          Coloque em <code className="text-xs">public/scans/</code> e preencha{" "}
          <code className="text-xs">place.scan.glbUrl</code> (layout{" "}
          <code className="text-xs">scan-glb</code>).
        </li>
        <li>
          Até o GLB existir, o lugar “Casa escaneada (demo)” usa o cômodo por medidas como fallback.
        </li>
      </ol>
      <p className="text-xs text-faint">
        Splat (Gaussian) é ótimo para ver; para andar e ancorar presenças use mesh + collider. Ver
        README.
      </p>
    </Card>
  );
}
