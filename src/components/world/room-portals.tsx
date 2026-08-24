import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Place } from "@/lib/places";
import { setNavDestination, snapToNavMesh } from "./navmesh";

export type RoomPortal = {
  id: string;
  label: string;
  /** Centro do vão */
  x: number;
  z: number;
  /** Destino após atravessar */
  toX: number;
  toZ: number;
  radius?: number;
};

/** Portais Oliveira (hall ↔ jardim, etc.) */
export const OLIVEIRA_PORTALS: RoomPortal[] = [
  { id: "to_garden", label: "Jardim", x: 0, z: 3.5, toX: 0, toZ: 8, radius: 1.1 },
  { id: "to_living", label: "Sala", x: 0, z: 6.5, toX: 0, toZ: 1, radius: 1.1 },
  { id: "to_kitchen", label: "Cozinha", x: -5.5, z: 0.2, toX: -8, toZ: 0, radius: 1.0 },
  { id: "to_study", label: "Estudo", x: 5.5, z: 0.2, toX: 8, toZ: 0, radius: 1.0 },
];

function portalsForPlace(place: Place | undefined): RoomPortal[] {
  if (!place) return OLIVEIRA_PORTALS;
  if (place.layout === "oliveira-house") return OLIVEIRA_PORTALS;
  if (place.layout === "simple-room" && place.metrics) {
    const hd = place.metrics.depthM / 2;
    return [
      {
        id: "door_out",
        label: "Exterior",
        x: 0,
        z: hd - 0.2,
        toX: 0,
        toZ: hd + 2.5,
        radius: 0.9,
      },
      {
        id: "door_in",
        label: "Interior",
        x: 0,
        z: hd + 2.2,
        toX: 0,
        toZ: hd - 1.2,
        radius: 0.9,
      },
    ];
  }
  return [];
}

/**
 * Triggers de porta: ao entrar no raio, path curto para o destino + fade UI.
 */
export function RoomPortals({
  place,
  playerPos,
  onFade,
}: {
  place: Place | undefined;
  playerPos: React.MutableRefObject<THREE.Vector3>;
  onFade?: (label: string | null) => void;
}) {
  const last = useRef<string | null>(null);
  const cool = useRef(0);
  const list = portalsForPlace(place);

  useFrame((_, dt) => {
    cool.current = Math.max(0, cool.current - dt);
    if (cool.current > 0 || !list.length) return;
    const p = playerPos.current;
    for (const portal of list) {
      const r = portal.radius ?? 1;
      const d = Math.hypot(p.x - portal.x, p.z - portal.z);
      if (d < r && last.current !== portal.id) {
        last.current = portal.id;
        cool.current = 1.8;
        const snap = snapToNavMesh(portal.toX, portal.toZ) ?? {
          x: portal.toX,
          z: portal.toZ,
        };
        setNavDestination(p.x, p.z, snap.x, snap.z);
        onFade?.(portal.label);
        window.setTimeout(() => onFade?.(null), 700);
        return;
      }
      if (d > r + 0.6 && last.current === portal.id) {
        last.current = null;
      }
    }
  });

  return (
    <group>
      {list.map((portal) => (
        <mesh
          key={portal.id}
          position={[portal.x, 0.02, portal.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          frustumCulled
        >
          <ringGeometry args={[0.55, 0.7, 24]} />
          <meshBasicMaterial
            color="#c4a882"
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Overlay de fade curto fora do canvas. */
export function RoomFadeOverlay({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/55 transition-opacity"
      aria-live="polite"
    >
      <p className="rounded-full bg-background/90 px-5 py-2 font-display text-lg text-foreground shadow-lg">
        {label}
      </p>
    </div>
  );
}
