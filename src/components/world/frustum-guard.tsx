import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  recordCull,
  resetCullStats,
  sphereInFrustum,
  updateFrustumFromCamera,
} from "./frustum-cull";
import { isWorldPointOccluded } from "./occlusion-cull";

/**
 * Actualiza o frustum uma vez por frame (antes dos filhos).
 */
export function FrustumUpdater() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    resetCullStats();
    updateFrustumFromCamera(camera);
  }, -10);
  return null;
}

type Props = {
  radius?: number;
  padding?: number;
  keepLogic?: boolean;
  children: React.ReactNode;
  position?: [number, number, number];
};

const _world = new THREE.Vector3();

export function FrustumCulledGroup({ radius = 1.2, padding = 1.0, children, position }: Props) {
  const ref = useRef<THREE.Group>(null);
  const wasVisible = useRef(true);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (!position) {
      g.getWorldPosition(_world);
      const vis = sphereInFrustum(_world.x, _world.y + 0.9, _world.z, radius, padding);
      recordCull(vis);
      if (vis !== wasVisible.current) {
        g.visible = vis;
        wasVisible.current = vis;
      }
      return;
    }
    const vis = sphereInFrustum(position[0], position[1] + 0.9, position[2], radius, padding);
    recordCull(vis);
    if (vis !== wasVisible.current) {
      g.visible = vis;
      wasVisible.current = vis;
    }
  });

  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

export function isWorldPointVisible(
  x: number,
  y: number,
  z: number,
  radius = 1.2,
  padding = 1,
): boolean {
  const vis = sphereInFrustum(x, y, z, radius, padding);
  recordCull(vis);
  return vis;
}

/**
 * Frustum + occlusion (LOS). Usar nas figuras / peers.
 */
export function isWorldPointShown(
  x: number,
  y: number,
  z: number,
  radius = 1.2,
  padding = 1,
  occlusionId?: string,
): boolean {
  if (!isWorldPointVisible(x, y, z, radius, padding)) return false;
  if (isWorldPointOccluded(x, z, occlusionId)) return false;
  return true;
}
