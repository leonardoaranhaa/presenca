import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { onPlayerPathChange, type NavPoint } from "./navmesh";

/**
 * Polyline do caminho do jogador no chão (Y ≈ 0.04).
 */
export function PlayerPathLine() {
  const [path, setPath] = useState<NavPoint[]>([]);
  const lineRef = useRef<THREE.Line>(null);

  useEffect(() => onPlayerPathChange(setPath), []);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (path.length >= 2) {
      const positions = new Float32Array(path.length * 3);
      for (let i = 0; i < path.length; i++) {
        positions[i * 3] = path[i].x;
        positions[i * 3 + 1] = 0.04;
        positions[i * 3 + 2] = path[i].z;
      }
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    }
    return g;
  }, [path]);

  useEffect(() => {
    return () => {
      geom.dispose();
    };
  }, [geom]);

  if (path.length < 2) return null;

  return (
    <line ref={lineRef as unknown as React.RefObject<THREE.Line>}>
      <bufferGeometry attach="geometry" {...{}} />
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color="#8a9a86" transparent opacity={0.75} linewidth={2} />
    </line>
  );
}

/** Versão com mesh de faixas (mais visível que Line em WebGL). */
export function PlayerPathRibbon() {
  const [path, setPath] = useState<NavPoint[]>([]);
  useEffect(() => onPlayerPathChange(setPath), []);

  const meshes = useMemo(() => {
    if (path.length < 2) return [];
    const out: { key: string; position: [number, number, number]; rot: number; len: number }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      out.push({
        key: `s${i}`,
        position: [(a.x + b.x) / 2, 0.03, (a.z + b.z) / 2],
        rot: Math.atan2(dx, dz),
        len,
      });
    }
    return out;
  }, [path]);

  if (!meshes.length) return null;

  return (
    <group>
      {meshes.map((s) => (
        <mesh key={s.key} position={s.position} rotation={[0, s.rot, 0]}>
          <boxGeometry args={[0.12, 0.02, s.len]} />
          <meshBasicMaterial color="#8a9a86" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      {/* pontos nos waypoints */}
      {path.map((p, i) => (
        <mesh key={`p${i}`} position={[p.x, 0.04, p.z]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#c5c1b7" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
