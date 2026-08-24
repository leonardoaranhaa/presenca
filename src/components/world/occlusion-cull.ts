/**
 * Occlusion culling por line-of-sight 2D (XZ) contra AABBs de paredes/móveis.
 *
 * Mais leve que occlusion queries GPU; suficiente para lar / simple-room / scan
 * com blocos. Combina-se com frustum (primeiro frustum, depois LOS).
 *
 * Histerese: um objecto occluded precisa de N frames livres para reaparecer
 * (evita flicker na borda da parede).
 */
import { getOccluderRects, isWalkable, type Rect } from "./collision";

export type OcclusionStats = {
  tested: number;
  occluded: number;
  visible: number;
};

let camX = 0;
let camZ = 0;
let stats: OcclusionStats = { tested: 0, occluded: 0, visible: 0 };

/** Estado por id (histerese). */
const hyster = new Map<string, { occluded: boolean; freeFrames: number }>();

const FREE_FRAMES_TO_SHOW = 2;

export function setOcclusionCamera(x: number, z: number) {
  camX = x;
  camZ = z;
}

export function getOcclusionCamera() {
  return { x: camX, z: camZ };
}

export function resetOcclusionStats() {
  stats = { tested: 0, occluded: 0, visible: 0 };
}

export function getOcclusionStats() {
  return stats;
}

/** Segmento (x1,z1)-(x2,z2) intersecta AABB expandido? */
function segmentHitsRect(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  r: Rect,
  inflate = 0.05,
): boolean {
  const minX = r.x0 - inflate;
  const maxX = r.x1 + inflate;
  const minZ = r.z0 - inflate;
  const maxZ = r.z1 + inflate;

  // Liang-Barsky style clip test
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;

  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };

  if (!clip(-dx, x1 - minX)) return false;
  if (!clip(dx, maxX - x1)) return false;
  if (!clip(-dz, z1 - minZ)) return false;
  if (!clip(dz, maxZ - z1)) return false;
  // intersecção no segmento aberto: exige t0 < 1 e um pouco de comprimento
  return t0 < t1 && t0 < 0.98;
}

/**
 * LOS puro: true se o segmento câmara→alvo atravessa algum occluder
 * (excepto se o alvo está *dentro* do mesmo rect — não ocultar a si).
 */
export function isLineOccluded(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  occluders?: Rect[],
): boolean {
  const list = occluders ?? getOccluderRects();
  const dist = Math.hypot(toX - fromX, toZ - fromZ);
  if (dist < 0.35) return false;

  for (const r of list) {
    if (toX >= r.x0 && toX <= r.x1 && toZ >= r.z0 && toZ <= r.z1) continue;
    if (fromX >= r.x0 && fromX <= r.x1 && fromZ >= r.z0 && fromZ <= r.z1) continue;

    if (segmentHitsRect(fromX, fromZ, toX, toZ, r)) {
      const cx = (r.x0 + r.x1) * 0.5;
      const cz = (r.z0 + r.z1) * 0.5;
      const dCam = Math.hypot(cx - fromX, cz - fromZ);
      if (dCam < dist * 0.98) return true;
    }
  }

  // Amostragem ao longo do raio: células não-andáveis = parede (scan/grid)
  const steps = Math.min(24, Math.max(4, Math.ceil(dist / 0.45)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = fromX + (toX - fromX) * t;
    const sz = fromZ + (toZ - fromZ) * t;
    // não exigir walkable junto ao alvo/câmara
    if (t < 0.08 || t > 0.92) continue;
    try {
      if (!isWalkable(sx, sz)) return true;
    } catch {
      /* modo ainda não inicializado */
    }
  }
  return false;
}

/**
 * Ponto do mundo occluded a partir da câmara de occlusion.
 * @param id chave estável para histerese (personaId / peerId)
 */
export function isWorldPointOccluded(x: number, z: number, id?: string): boolean {
  stats.tested += 1;
  const raw = isLineOccluded(camX, camZ, x, z);
  if (!id) {
    if (raw) stats.occluded += 1;
    else stats.visible += 1;
    return raw;
  }

  let h = hyster.get(id);
  if (!h) {
    h = { occluded: raw, freeFrames: raw ? 0 : FREE_FRAMES_TO_SHOW };
    hyster.set(id, h);
  }

  if (raw) {
    h.occluded = true;
    h.freeFrames = 0;
  } else {
    h.freeFrames += 1;
    if (h.freeFrames >= FREE_FRAMES_TO_SHOW) h.occluded = false;
  }

  if (h.occluded) stats.occluded += 1;
  else stats.visible += 1;
  return h.occluded;
}

/** Limpa histerese (mudança de lugar). */
export function clearOcclusionHysteresis() {
  hyster.clear();
}
