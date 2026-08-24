import type { Place } from "@/lib/places";

export type LightPreset = "morning" | "afternoon" | "evening" | "memory";

export function resolveLightPreset(place: Place | undefined): LightPreset {
  const raw = (place as Place & { lightPreset?: LightPreset })?.lightPreset;
  if (raw === "morning" || raw === "afternoon" || raw === "evening" || raw === "memory") {
    return raw;
  }
  const h = new Date().getHours();
  if (h < 10) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "memory";
}

const PRESETS: Record<
  LightPreset,
  { hemi: [string, string, number]; dir: string; dirInt: number; amb: number }
> = {
  morning: {
    hemi: ["#b8c4d0", "#5a4e42", 0.62],
    dir: "#fff2e0",
    dirInt: 1.25,
    amb: 0.22,
  },
  afternoon: {
    hemi: ["#8a96a4", "#3a3228", 0.55],
    dir: "#e8e0d2",
    dirInt: 1.15,
    amb: 0.18,
  },
  evening: {
    hemi: ["#6a7088", "#2a2018", 0.4],
    dir: "#d4a574",
    dirInt: 0.85,
    amb: 0.12,
  },
  memory: {
    hemi: ["#7a8494", "#2c2830", 0.35],
    dir: "#c4b8d0",
    dirInt: 0.7,
    amb: 0.2,
  },
};

export function LightingRig({
  preset,
  shadows,
  shadowMapSize,
}: {
  preset: LightPreset;
  shadows: boolean;
  shadowMapSize: number;
}) {
  const p = PRESETS[preset];
  return (
    <>
      <hemisphereLight args={[p.hemi[0], p.hemi[1], p.hemi[2]]} />
      <directionalLight
        position={[6, 8, 4]}
        intensity={p.dirInt}
        color={p.dir}
        castShadow={shadows}
        shadow-mapSize-width={shadowMapSize || 512}
        shadow-mapSize-height={shadowMapSize || 512}
        shadow-camera-far={40}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <ambientLight intensity={p.amb} />
    </>
  );
}

export const LIGHT_PRESET_LABELS: Record<LightPreset, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Fim de tarde",
  memory: "Memória",
};
