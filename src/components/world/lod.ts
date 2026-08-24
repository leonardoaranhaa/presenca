/**
 * LOD por distância à câmara (após frustum/occlusion).
 * 0 = detalhe completo · 1 = médio · 2 = longe (só silhueta)
 */
import { getOcclusionCamera } from "./occlusion-cull";

export type LodLevel = 0 | 1 | 2;

/** Limiares em metros (ajustáveis por qualidade). */
export const LOD_NEAR = 7;
export const LOD_MID = 16;

export function distanceToCameraXZ(x: number, z: number): number {
  const cam = getOcclusionCamera();
  return Math.hypot(x - cam.x, z - cam.z);
}

export function lodLevelForDistance(d: number): LodLevel {
  if (d < LOD_NEAR) return 0;
  if (d < LOD_MID) return 1;
  return 2;
}

export function lodLevelAt(x: number, z: number): LodLevel {
  return lodLevelForDistance(distanceToCameraXZ(x, z));
}
