import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Grid } from "@react-three/drei";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Persona } from "@/lib/types";
import { MimeticBrain } from "@/lib/mimetic-brain";
import { projectTo3D, vectorForTrace } from "@/lib/mimetic-brain/project3d";

const KIND_COLOR: Record<string, string> = {
  memory: "#8a9a86",
  chat_user: "#c4a882",
  chat_presence: "#6d7f9a",
  correction: "#c47a7a",
  style_hint: "#a08ac4",
};

function PointMark({
  x,
  y,
  z,
  color,
  label,
  selected,
  onSelect,
}: {
  x: number;
  y: number;
  z: number;
  color: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <group position={[x * 2.2, y * 2.2, z * 2.2]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <sphereGeometry args={[selected ? 0.09 : 0.06, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.45 : 0.15}
          roughness={0.4}
        />
      </mesh>
      {selected && (
        <Html distanceFactor={6} position={[0, 0.18, 0]} center>
          <div className="max-w-[10rem] rounded-md bg-background/95 px-2 py-1 text-[10px] leading-snug text-foreground shadow-md">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Espaço 3D dos traços do cérebro mímico (PCA dos embeddings).
 */
export function VectorSpaceView({ persona }: { persona: Persona }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "lexical">("auto");

  const { positions, stats } = useMemo(() => {
    const brain = MimeticBrain.bootstrap(persona);
    const model = brain.getModel();
    const pts = model.traces.map((tr) => {
      const base = vectorForTrace(tr);
      if (mode === "lexical") {
        return { ...base, vector: tr.vector };
      }
      return base;
    });
    const { positions: pos } = projectTo3D(pts);
    const withSem = model.traces.filter((t) => t.semanticVector?.length).length;
    return {
      positions: pos,
      stats: {
        n: model.traces.length,
        trainSteps: model.trainSteps,
        withSem,
      },
    };
  }, [persona, mode]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="font-display text-lg">Espaço de memória (3D)</h3>
          <p className="text-xs text-muted">
            PCA dos vetores do cérebro mímico · {stats.n} traços · {stats.trainSteps} passos
            {stats.withSem ? ` · ${stats.withSem} com embedding semântico` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "auto" ? "default" : "outline"}
            onClick={() => setMode("auto")}
          >
            Auto (semântico se houver)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "lexical" ? "default" : "outline"}
            onClick={() => setMode("lexical")}
          >
            Só lexical
          </Button>
        </div>
      </div>

      <div className="relative h-[min(52vh,420px)] w-full bg-[#12161c]">
        {positions.length === 0 ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            Ainda não há traços. Adicione memórias no cofre para ver o mapa.
          </p>
        ) : (
          <Canvas camera={{ position: [3.2, 2.4, 3.2], fov: 42 }} dpr={[1, 1.75]}>
            <color attach="background" args={["#12161c"]} />
            <ambientLight intensity={0.55} />
            <directionalLight position={[4, 6, 2]} intensity={0.85} />
            <Grid
              args={[8, 8]}
              cellSize={0.4}
              cellThickness={0.6}
              sectionSize={2}
              sectionThickness={1}
              fadeDistance={12}
              cellColor="#2a3340"
              sectionColor="#3a4555"
              position={[0, -1.2, 0]}
            />
            {/* eixos */}
            <axesHelper args={[1.4]} />
            {positions.map((p) => (
              <PointMark
                key={p.id}
                x={p.x}
                y={p.y}
                z={p.z}
                color={KIND_COLOR[p.kind] ?? "#888"}
                label={p.label}
                selected={selected === p.id}
                onSelect={() => setSelected((id) => (id === p.id ? null : p.id))}
              />
            ))}
            <OrbitControls enablePan makeDefault minDistance={1.5} maxDistance={10} />
          </Canvas>
        )}
      </div>

      <div className="flex flex-wrap gap-3 px-4 py-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-full bg-[#8a9a86]" /> memória
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-full bg-[#c4a882]" /> chat (você)
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-full bg-[#6d7f9a]" /> chat (presença)
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2 rounded-full bg-[#c47a7a]" /> correção
        </span>
        <span className="ml-auto text-faint">Arraste para orbitar · clique num ponto</span>
      </div>
    </Card>
  );
}
