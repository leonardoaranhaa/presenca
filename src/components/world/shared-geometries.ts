/**
 * Geometrias e materiais compartilhados — Fase 2.
 * Uma única BufferGeometry por forma evita N alocações e
 * permite que o driver reutilize o mesmo VBO entre meshes.
 */
import * as THREE from "three";

let box: THREE.BoxGeometry | null = null;
let capsule: THREE.CapsuleGeometry | null = null;
let sphere: THREE.SphereGeometry | null = null;
let sphereSm: THREE.SphereGeometry | null = null;
let sphereMd: THREE.SphereGeometry | null = null;
let cylinder: THREE.CylinderGeometry | null = null;
let plane: THREE.PlaneGeometry | null = null;

export function geoBox() {
  return (box ??= new THREE.BoxGeometry(1, 1, 1));
}
export function geoCapsule() {
  return (capsule ??= new THREE.CapsuleGeometry(0.22, 0.7, 6, 12));
}
export function geoSphere() {
  return (sphere ??= new THREE.SphereGeometry(0.2, 16, 14));
}
export function geoSphereSm() {
  return (sphereSm ??= new THREE.SphereGeometry(0.025, 8, 8));
}
export function geoSphereMd() {
  return (sphereMd ??= new THREE.SphereGeometry(0.16, 10, 8));
}
export function geoCylinder() {
  return (cylinder ??= new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8));
}
export function geoPlane() {
  return (plane ??= new THREE.PlaneGeometry(1, 1));
}

/** Escala um box unitário (1x1x1) para size [w,h,d]. */
export function scaleBox(mesh: THREE.Mesh, size: [number, number, number]) {
  mesh.scale.set(size[0], size[1], size[2]);
}

export function disposeSharedGeometries() {
  box?.dispose();
  capsule?.dispose();
  sphere?.dispose();
  sphereSm?.dispose();
  sphereMd?.dispose();
  cylinder?.dispose();
  plane?.dispose();
  box = capsule = sphere = sphereSm = sphereMd = cylinder = plane = null;
}
