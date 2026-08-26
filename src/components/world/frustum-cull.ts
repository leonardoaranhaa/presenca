/**
 * Frustum culling utilitário para o mundo Presença.
 *
 * Three.js já faz frustumCulled por mesh; isto serve para:
 * 1. Desligar grupos inteiros (Billboard, VFX, labels)
 * 2. Saltar trabalho em useFrame (NPC path, gestos) quando fora de vista
 * 3. Margem (padding) para não “piscar” na borda do ecrã
 */
import * as THREE from "three";

const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _center = new THREE.Vector3();

/** Actualiza o frustum a partir da câmara activa. */
export function updateFrustumFromCamera(camera: THREE.Camera): THREE.Frustum {
  _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_projScreen);
  return _frustum;
}

/**
 * Testa se uma esfera em mundo está (quase) dentro do frustum.
 * @param padding metros extra no raio — evita pop-in na borda
 */
export function sphereInFrustum(
  x: number,
  y: number,
  z: number,
  radius: number,
  padding = 0.75,
): boolean {
  _center.set(x, y, z);
  _sphere.center.copy(_center);
  _sphere.radius = radius + padding;
  return _frustum.intersectsSphere(_sphere);
}

/** AABB rápido (XZ + altura) → esfera envolvente. */
export function boxInFrustum(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0 = 0,
  y1 = 2.2,
  padding = 0.5,
): boolean {
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const rx = (x1 - x0) * 0.5;
  const ry = (y1 - y0) * 0.5;
  const rz = (z1 - z0) * 0.5;
  const radius = Math.sqrt(rx * rx + ry * ry + rz * rz);
  return sphereInFrustum(cx, cy, cz, radius, padding);
}

export type CullStats = {
  tested: number;
  visible: number;
  culled: number;
};

let stats: CullStats = { tested: 0, visible: 0, culled: 0 };

export function resetCullStats() {
  stats = { tested: 0, visible: 0, culled: 0 };
}

export function recordCull(visible: boolean) {
  stats.tested += 1;
  if (visible) stats.visible += 1;
  else stats.culled += 1;
}

export function getCullStats() {
  return stats;
}
