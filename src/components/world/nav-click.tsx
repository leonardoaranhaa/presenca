import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getNavMesh, setNavDestination, snapToNavMesh } from "./navmesh";

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();

/**
 * Clique curto no chão → caminho no NavMesh até o ponto (anel no destino).
 * Arrastar continua sendo look (tratado noutros listeners).
 */
export function NavClickTarget({
  playerPos,
  enabled,
}: {
  playerPos: THREE.Vector3;
  enabled: boolean;
}) {
  const { camera, gl } = useThree();
  const marker = useRef<THREE.Mesh>(null);
  const posRef = useRef(playerPos);
  posRef.current = playerPos;

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;

    const onDown = (e: PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    const onUp = (e: PointerEvent) => {
      if (!enabled || !down) return;
      const dt = performance.now() - down.t;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (dt > 450 || dist > 16) return;
      if (!getNavMesh()) return;

      const rect = el.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      if (!_raycaster.ray.intersectPlane(_ground, _hit)) return;

      const snap = snapToNavMesh(_hit.x, _hit.z);
      if (!snap) return;

      const path = setNavDestination(posRef.current.x, posRef.current.z, snap.x, snap.z);
      if (marker.current) {
        marker.current.position.set(snap.x, 0.06, snap.z);
        marker.current.visible = path.length > 0;
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [enabled, camera, gl]);

  return (
    <mesh ref={marker} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
      <ringGeometry args={[0.2, 0.36, 24]} />
      <meshBasicMaterial color="#8a9a86" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}
