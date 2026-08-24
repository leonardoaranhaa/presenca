import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { geoBox } from "./shared-geometries";
import type { RoomMetrics } from "@/lib/room-metrics";
import { lodLevelAt } from "./lod";

export function RoomFurniture({ metrics }: { metrics: RoomMetrics }) {
  const hd = metrics.depthM / 2;
  const hw = metrics.widthM / 2;
  const detail = useRef<THREE.Group>(null);
  const core = useRef<THREE.Group>(null);

  useFrame(() => {
    // centro do cômodo
    const lod = lodLevelAt(0, 0);
    if (detail.current) detail.current.visible = lod < 2;
    if (core.current) core.current.visible = true;
  });

  return (
    <group>
      <group ref={core}>
        <mesh
          position={[0, 0.32, -hd + 1.35]}
          scale={[Math.min(2.4, metrics.widthM * 0.45), 0.64, 0.82]}
          geometry={geoBox()}
          castShadow
          receiveShadow
          frustumCulled
        >
          <meshStandardMaterial color="#5c5048" roughness={0.82} />
        </mesh>
        <mesh
          position={[0, 0.36, -0.2]}
          scale={[1.15, 0.07, 0.65]}
          geometry={geoBox()}
          castShadow
          frustumCulled
        >
          <meshStandardMaterial color="#6a5340" roughness={0.7} />
        </mesh>
      </group>
      <group ref={detail}>
        <mesh
          position={[-0.45, 0.18, -0.2]}
          scale={[0.08, 0.36, 0.08]}
          geometry={geoBox()}
          frustumCulled
        >
          <meshStandardMaterial color="#4a3c32" />
        </mesh>
        <mesh
          position={[0.45, 0.18, -0.2]}
          scale={[0.08, 0.36, 0.08]}
          geometry={geoBox()}
          frustumCulled
        >
          <meshStandardMaterial color="#4a3c32" />
        </mesh>
        <mesh
          position={[hw - 1.1, 0.28, 0.4]}
          scale={[0.45, 0.55, 0.45]}
          geometry={geoBox()}
          castShadow
          frustumCulled
        >
          <meshStandardMaterial color="#6d5c4e" roughness={0.85} />
        </mesh>
        <mesh
          position={[-hw + 0.9, 0.4, -hd + 1.0]}
          scale={[0.9, 0.8, 0.4]}
          geometry={geoBox()}
          castShadow
          frustumCulled
        >
          <meshStandardMaterial color="#4e453c" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}
