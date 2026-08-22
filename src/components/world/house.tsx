import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { usePresence } from "@/lib/store";
import { geoBox } from "./shared-geometries";
import { makeGrassTexture, makePlasterTexture, makeStoneTexture, makeWoodTexture } from "./textures";

function Box({
  position,
  size,
  color,
  map,
  receiveShadow = true,
  castShadow = false,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
  map?: THREE.Texture;
  receiveShadow?: boolean;
  castShadow?: boolean;
}) {
  return (
    <mesh
      position={position}
      scale={size}
      geometry={geoBox()}
      receiveShadow={receiveShadow}
      castShadow={castShadow}
    >
      <meshStandardMaterial color={color ?? "#ccc"} map={map} roughness={0.86} metalness={0.02} />
    </mesh>
  );
}

export function House() {
  const q = usePresence((s) => s.getQuality());
  const propsCast = q.castShadowsOnProps;
  const wood = useMemo(() => makeWoodTexture(), []);
  const plaster = useMemo(() => makePlasterTexture(), []);
  const grass = useMemo(() => makeGrassTexture(), []);
  const stone = useMemo(() => makeStoneTexture(), []);

  useLayoutEffect(() => {
    wood.repeat.set(10, 10);
    plaster.repeat.set(4, 2);
    grass.repeat.set(14, 14);
    stone.repeat.set(3, 2);
    wood.anisotropy = q.maxAnisotropy;
    plaster.anisotropy = q.maxAnisotropy;
    grass.anisotropy = q.maxAnisotropy;
  }, [wood, plaster, grass, stone, q.maxAnisotropy]);

  useLayoutEffect(() => {
    return () => {
      wood.dispose();
      plaster.dispose();
      grass.dispose();
      stone.dispose();
    };
  }, [wood, plaster, grass, stone]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 6]} receiveShadow>
        <planeGeometry args={[40, 36]} />
        <meshStandardMaterial map={grass} color="#8a9a7a" roughness={1} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -1.4]} receiveShadow>
        <planeGeometry args={[23.2, 11.2]} />
        <meshStandardMaterial map={wood} roughness={0.78} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 5]} receiveShadow>
        <planeGeometry args={[8.2, 3.4]} />
        <meshStandardMaterial map={wood} roughness={0.78} />
      </mesh>

      {/* Exterior walls */}
      <Box position={[0, 1.5, -7.05]} size={[23.4, 3.1, 0.28]} map={plaster} color="#e4d9cc" />
      <Box position={[-11.7, 1.5, -1.6]} size={[0.28, 3.1, 11.2]} map={plaster} color="#e4d9cc" />
      <Box position={[11.7, 1.5, -1.6]} size={[0.28, 3.1, 11.2]} map={plaster} color="#e4d9cc" />
      <Box position={[-6.35, 1.5, 3.55]} size={[10.7, 3.1, 0.28]} map={plaster} color="#e4d9cc" />
      <Box position={[6.35, 1.5, 3.55]} size={[10.7, 3.1, 0.28]} map={plaster} color="#e4d9cc" />
      <Box position={[0, 2.5, 3.55]} size={[2.1, 1.15, 0.28]} map={plaster} color="#e4d9cc" />

      {/* Interior partitions */}
      <Box position={[5.45, 1.5, -5.1]} size={[0.22, 3.1, 3.8]} map={plaster} color="#ddd3c6" />
      <Box position={[5.45, 2.35, 0.4]} size={[0.22, 1.4, 2.2]} map={plaster} color="#ddd3c6" />
      <Box position={[-5.55, 1.5, -5.1]} size={[0.22, 3.1, 3.8]} map={plaster} color="#ddd3c6" />
      <Box position={[-5.55, 2.35, 0.4]} size={[0.22, 1.4, 2.2]} map={plaster} color="#ddd3c6" />

      {/* Ceiling */}
      <mesh position={[0, 3.12, -1.6]} receiveShadow>
        <boxGeometry args={[23.6, 0.12, 11.4]} />
        <meshStandardMaterial color="#cfc6ba" roughness={1} />
      </mesh>

      <Window position={[-3.2, 1.55, -6.9]} />
      <Window position={[3.2, 1.55, -6.9]} />
      <Window position={[11.55, 1.55, 0.6]} rotation={[0, Math.PI / 2, 0]} />
      <Window position={[-11.55, 1.55, 0.6]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Fireplace */}
      <Box position={[0, 0.7, -6.55]} size={[2.4, 1.4, 0.7]} map={stone} color="#8a8378" castShadow={propsCast} />
      <Box position={[0, 2.1, -6.55]} size={[1.6, 1.4, 0.55]} map={stone} color="#7a746a" />
      <mesh position={[0, 0.55, -6.2]}>
        <boxGeometry args={[1.1, 0.7, 0.2]} />
        <meshStandardMaterial
          color="#e8c9a0"
          emissive="#c4a070"
          emissiveIntensity={1.4}
          roughness={0.6}
        />
      </mesh>
      <pointLight position={[0, 0.7, -5.7]} color="#e0c4a0" intensity={1.6} distance={9} />

      {/* Sofa */}
      <Box position={[0, 0.38, -2.4]} size={[3.4, 0.4, 1.2]} color="#5c5048" castShadow={propsCast} />
      <Box position={[0, 0.85, -2.85]} size={[3.4, 0.7, 0.28]} color="#4e443c" />
      <Box position={[-1.55, 0.7, -2.4]} size={[0.28, 0.55, 1.15]} color="#4e443c" />
      <Box position={[1.55, 0.7, -2.4]} size={[0.28, 0.55, 1.15]} color="#4e443c" />

      {/* Table */}
      <Box position={[0, 0.42, 1.1]} size={[1.6, 0.08, 1.0]} color="#6a5340" />
      <Box position={[0, 0.2, 1.1]} size={[0.12, 0.4, 0.12]} color="#4a3a2c" />
      <Box position={[-2.4, 0.28, 1.2]} size={[0.7, 0.55, 0.7]} color="#6d5a4c" />
      <Box position={[2.4, 0.28, 1.2]} size={[0.7, 0.55, 0.7]} color="#6d5a4c" />

      {/* Kitchen */}
      <Box position={[8.9, 0.48, -1.9]} size={[4.2, 0.9, 0.9]} color="#b7a898" />
      <Box position={[8.9, 1.05, -2.15]} size={[4.2, 0.08, 0.5]} color="#8a9a86" />
      <mesh position={[10.4, 1.22, -1.85]}>
        <cylinderGeometry args={[0.18, 0.18, 0.28, 16]} />
        <meshStandardMaterial color="#cfc6ba" roughness={0.3} metalness={0.4} />
      </mesh>

      {/* Study */}
      <Box position={[-9.0, 0.42, -1.6]} size={[2.4, 0.08, 1.0]} color="#5a4638" />
      <Box position={[-9.0, 0.2, -1.6]} size={[0.12, 0.4, 0.12]} color="#3a2c22" />
      <Box position={[-8.2, 1.4, -2.55]} size={[1.6, 1.8, 0.2]} color="#4a3c32" />

      {/* Porch */}
      <Box position={[-3.6, 1.2, 6.3]} size={[0.22, 2.4, 0.22]} color="#d8cfc3" />
      <Box position={[3.6, 1.2, 6.3]} size={[0.22, 2.4, 0.22]} color="#d8cfc3" />
      <Box position={[0, 2.45, 5]} size={[8.2, 0.12, 3.4]} color="#cfc6ba" />

      <Garden />
      <Frames />
    </group>
  );
}

function Window({
  position,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[1.8, 1.4]} />
        <meshStandardMaterial
          color="#9aacb8"
          emissive="#6a7c90"
          emissiveIntensity={0.55}
          roughness={0.2}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[1.9, 1.5, 0.06]} />
        <meshStandardMaterial color="#6a5344" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Garden() {
  return (
    <group>
      <Tree position={[2.4, 0, 11.4]} />
      <Tree position={[-6.5, 0, 14.2]} scale={0.78} />
      <Tree position={[8.2, 0, 15.1]} scale={0.62} />
      <mesh position={[2.4, 0.28, 13.4]} rotation={[-0.08, 0.4, 0]}>
        <boxGeometry args={[1.5, 0.12, 0.5]} />
        <meshStandardMaterial color="#6a5340" roughness={0.8} />
      </mesh>
      <mesh position={[2.4, 0.55, 13.62]} rotation={[-0.08, 0.4, 0]}>
        <boxGeometry args={[1.5, 0.4, 0.1]} />
        <meshStandardMaterial color="#5c4a3c" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.04, 8.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.2, 8]} />
        <meshStandardMaterial color="#8a7a64" roughness={1} />
      </mesh>
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh
          key={i}
          position={[-4 + (i % 7) * 1.35, 0.12, 9.2 + Math.floor(i / 7) * 3.4]}
          castShadow
        >
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshStandardMaterial color={i % 2 ? "#8a9a86" : "#6d7f6a"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.28, 2.2, 8]} />
        <meshStandardMaterial color="#5a4638" roughness={1} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <sphereGeometry args={[1.35, 14, 12]} />
        <meshStandardMaterial color="#4a5c3c" roughness={0.95} />
      </mesh>
      <mesh position={[0.5, 2.9, 0.3]} castShadow>
        <sphereGeometry args={[0.9, 12, 10]} />
        <meshStandardMaterial color="#5a6e48" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Frames() {
  const mats = ["#8a9a86", "#c5c1b7", "#6d5a4c", "#5c6b7a"];
  return (
    <group>
      {[-4.6, -1.5, 1.5, 4.6].map((x, i) => (
        <mesh key={x} position={[x, 1.7, -6.88]}>
          <planeGeometry args={[0.7, 0.9]} />
          <meshStandardMaterial color={mats[i]} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
