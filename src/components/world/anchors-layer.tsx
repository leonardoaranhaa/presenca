import { Rotulo3D } from "./rotulo-3d";
import type { Place } from "@/lib/places";
import { setNavDestination, snapToNavMesh } from "./navmesh";
import * as THREE from "three";

/**
 * Âncoras do lugar: clique → caminhar até ao ponto (sofá, mesa…).
 */
export function AnchorsLayer({
  place,
  playerPos,
  visible = true,
}: {
  place: Place | undefined;
  playerPos: React.MutableRefObject<THREE.Vector3>;
  visible?: boolean;
}) {
  if (!place?.anchors?.length || !visible) return null;

  return (
    <group>
      {place.anchors.map((a) => (
        <group key={a.id} position={[a.x, 0, a.z]}>
          <mesh
            position={[0, 0.03, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            frustumCulled
            onClick={(e) => {
              e.stopPropagation();
              const p = playerPos.current;
              const snap = snapToNavMesh(a.x, a.z) ?? { x: a.x, z: a.z };
              setNavDestination(p.x, p.z, snap.x, snap.z);
            }}
          >
            <circleGeometry args={[0.28, 20]} />
            <meshBasicMaterial color="#8a9a86" transparent opacity={0.45} depthWrite={false} />
          </mesh>
          <Rotulo3D texto={a.label} position={[0, 1.15, 0]} fontSize={0.12} maxWidth={2} />
        </group>
      ))}
    </group>
  );
}
