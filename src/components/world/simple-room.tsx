import { useMemo } from "react";
import * as THREE from "three";
import type { RoomMetrics } from "@/lib/room-metrics";
import { clampMetrics } from "@/lib/room-metrics";
import { geoBox } from "./shared-geometries";
import { makePlasterTexture, makeWoodTexture } from "./textures";

/**
 * Cômodo gerado só com medidas (sem scan).
 * Bom para “casa aproximada” e placeholder até chegar o GLB de fotogrametria.
 */
export function SimpleRoom({ metrics }: { metrics: RoomMetrics }) {
  const m = useMemo(() => clampMetrics(metrics), [metrics]);
  const wood = useMemo(() => makeWoodTexture(), []);
  const plaster = useMemo(() => makePlasterTexture(), []);
  const hw = m.widthM / 2;
  const hd = m.depthM / 2;
  const h = m.heightM;
  const t = m.wallT ?? 0.18;
  const door = m.doorWidthM ?? 0.9;
  const sideWallLen = m.widthM;
  const frontLeft = (m.widthM - door) / 2;

  return (
    <group>
      {/* chão */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[m.widthM - t * 0.5, m.depthM - t * 0.5]} />
        <meshStandardMaterial map={wood} roughness={0.85} />
      </mesh>
      {/* jardim curto */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, hd + 3]} receiveShadow>
        <planeGeometry args={[m.widthM + 4, 8]} />
        <meshStandardMaterial color="#4a5c3c" roughness={1} />
      </mesh>
      {/* teto */}
      <mesh position={[0, h, 0]} scale={[m.widthM, t, m.depthM]} geometry={geoBox()}>
        <meshStandardMaterial color="#cfc6ba" roughness={1} />
      </mesh>

      {/* paredes fundo / laterais */}
      <Wall position={[0, h / 2, -hd]} size={[sideWallLen, h, t]} map={plaster} />
      <Wall position={[-hw, h / 2, 0]} size={[t, h, m.depthM]} map={plaster} />
      <Wall position={[hw, h / 2, 0]} size={[t, h, m.depthM]} map={plaster} />
      {/* frente com vão de porta */}
      <Wall
        position={[-(door / 2 + frontLeft / 2), h / 2, hd]}
        size={[frontLeft, h, t]}
        map={plaster}
      />
      <Wall
        position={[door / 2 + frontLeft / 2, h / 2, hd]}
        size={[frontLeft, h, t]}
        map={plaster}
      />
      <Wall position={[0, h - 0.35, hd]} size={[door + 0.1, 0.7, t]} map={plaster} />

      {/* janelas na parede do fundo */}
      {Array.from({ length: m.windowCount ?? 0 }).map((_, i) => {
        const count = m.windowCount ?? 1;
        const x = -hw + (m.widthM * (i + 1)) / (count + 1);
        return (
          <mesh key={i} position={[x, h * 0.55, -hd + t * 0.6]}>
            <planeGeometry args={[0.9, 1.0]} />
            <meshStandardMaterial
              color="#9aacb8"
              emissive="#6a7c90"
              emissiveIntensity={0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}

      {/* móveis mínimos */}
      <mesh position={[0, 0.35, -hd + 1.4]} scale={[2.2, 0.7, 0.85]} geometry={geoBox()} castShadow>
        <meshStandardMaterial color="#5c5048" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.38, 0.3]} scale={[1.2, 0.08, 0.7]} geometry={geoBox()}>
        <meshStandardMaterial color="#6a5340" />
      </mesh>
    </group>
  );
}

function Wall({
  position,
  size,
  map,
}: {
  position: [number, number, number];
  size: [number, number, number];
  map?: THREE.Texture;
}) {
  return (
    <mesh position={position} scale={size} geometry={geoBox()} castShadow receiveShadow>
      <meshStandardMaterial color="#e4d9cc" map={map} roughness={0.9} />
    </mesh>
  );
}
