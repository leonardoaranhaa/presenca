import { Billboard, Text } from "@react-three/drei";
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
          <Billboard position={[0, 1.15, 0]}>
            <Text
              fontSize={0.12}
              color="#e8e0d2"
              outlineWidth={0.006}
              outlineColor="#1c2228"
              anchorX="center"
              maxWidth={2}
            >
              {a.label}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}
