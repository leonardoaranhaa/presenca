/**
 * Escala automática de GLB de fotogrametria.
 * Heurística: altura do bounding box → altura de porta típica ou altura humana alvo.
 */
import * as THREE from "three";

export type ScaleHint = {
  /** Altura do vão de porta no mundo real (m). Default 2.1 */
  doorHeightM?: number;
  /** Se o scan incluir pessoa de pé, altura estimada */
  personHeightM?: number;
  /** Multiplicador manual extra */
  manual?: number;
};

/**
 * Calcula scale para que a altura Y do bbox ≈ doorHeight (ou person).
 */
export function computeScanScale(
  root: THREE.Object3D,
  hint: ScaleHint = {},
): { scale: number; bboxHeight: number; reason: string } {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = Math.max(size.y, 0.01);
  const target =
    hint.personHeightM && hint.personHeightM > 0.5
      ? hint.personHeightM
      : (hint.doorHeightM ?? 2.15);
  // Se o mesh já está perto de metros (1.5–4 m de altura), scale ~1
  let scale = target / h;
  // Evitar explosões em modelos já em metros ou em cm
  if (h > 1.2 && h < 4.5) {
    scale = hint.manual ?? 1;
    return { scale, bboxHeight: h, reason: "já em metros" };
  }
  if (h > 50) {
    // provavelmente mm ou cm
    scale = target / h;
  }
  if (hint.manual && hint.manual > 0) scale *= hint.manual;
  // limites de segurança
  scale = Math.min(20, Math.max(0.01, scale));
  return {
    scale,
    bboxHeight: h,
    reason: `bboxY=${h.toFixed(2)} → target ${target}m`,
  };
}

/** Centra o mesh no XZ e pousa Y=0 no chão do bbox. */
export function groundAndCenter(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}
