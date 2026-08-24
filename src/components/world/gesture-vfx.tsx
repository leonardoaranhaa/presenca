import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { onSensationEvent, type SensationEvent } from "@/lib/sensation";

type Ring = {
  x: number;
  z: number;
  until: number;
  color: string;
  baseScale: number;
};

const rings: Ring[] = [];
const MAX = 12;

/** Posição do mundo onde nascer o VFX (actualizado pelo SensationBridge / experience). */
export const gestureAnchor = { x: 0, z: 0 };

/**
 * Anéis no chão quando há gesto — feedback visual sem traje.
 * Eventos já passaram por consentimento LGPD em Sensation.*.
 */
export function GestureVfxLayer() {
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    return onSensationEvent((e: SensationEvent | null) => {
      if (!e) return;
      const g = e.gesture;
      if (g !== "hug" && g !== "hand" && g !== "presence" && g !== "shoulder") return;
      const color =
        g === "hug"
          ? "#c47a8a"
          : g === "hand"
            ? "#c4a882"
            : g === "shoulder"
              ? "#a08ac4"
              : "#8a9a86";
      rings.push({
        x: gestureAnchor.x,
        z: gestureAnchor.z,
        until: performance.now() + (g === "hug" ? 1800 : 1000),
        color,
        baseScale: g === "hug" ? 1.35 : 0.75,
      });
      while (rings.length > MAX) rings.shift();
    });
  }, []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();

    while (g.children.length < rings.length) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.45, 28),
        new THREE.MeshBasicMaterial({
          color: "#c47a8a",
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      g.add(mesh);
    }
    while (g.children.length > rings.length) {
      const c = g.children.pop() as THREE.Mesh | undefined;
      if (c) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]!;
      if (now > r.until) {
        rings.splice(i, 1);
        continue;
      }
      const child = g.children[i] as THREE.Mesh | undefined;
      if (!child) continue;
      const dur = 1800;
      const t = 1 - (r.until - now) / dur;
      child.position.set(r.x, 0.04, r.z);
      child.scale.setScalar(r.baseScale * (0.85 + t * 1.1));
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.color.set(r.color);
      mat.opacity = 0.7 * (1 - Math.max(0, t));
    }
  });

  return <group ref={group} />;
}
