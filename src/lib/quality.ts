/**
 * Tier de qualidade — Fase 2.
 * Detecta capacidade aproximada e define sombras, DPR e casters.
 */

export type QualityTier = "low" | "mid" | "high";

export interface QualityProfile {
  tier: QualityTier;
  dpr: [number, number];
  shadowMapSize: number;
  shadows: boolean;
  antialias: boolean;
  maxAnisotropy: number;
  textureSize: number;
  castShadowsOnFigures: boolean;
  castShadowsOnProps: boolean;
}

function detectTier(): QualityTier {
  if (typeof navigator === "undefined") return "mid";
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile || cores <= 4 || mem <= 4) return "low";
  if (cores >= 8 && mem >= 8) return "high";
  return "mid";
}

/**
 * Perfis memoizados por tier.
 *
 * `qualityProfile` é chamada dentro de seletores zustand. Devolver um objeto
 * novo a cada chamada fazia a comparação por identidade falhar sempre, e todo
 * o mundo 3D (Canvas, House, cada Figure) voltava a renderizar a cada
 * escrita no store — várias vezes por segundo com a pose a ser publicada.
 */
const profileCache = new Map<QualityTier, QualityProfile>();

export function qualityProfile(forced?: QualityTier): QualityProfile {
  const tier = forced ?? detectTier();
  const cached = profileCache.get(tier);
  if (cached) return cached;
  const profile = buildProfile(tier);
  profileCache.set(tier, profile);
  return profile;
}

function buildProfile(tier: QualityTier): QualityProfile {
  if (tier === "low") {
    return {
      tier,
      dpr: [1, 1.25],
      shadowMapSize: 0,
      shadows: false,
      antialias: false,
      maxAnisotropy: 2,
      textureSize: 256,
      castShadowsOnFigures: false,
      castShadowsOnProps: false,
    };
  }
  if (tier === "mid") {
    return {
      tier,
      dpr: [1, 1.5],
      shadowMapSize: 512,
      shadows: true,
      antialias: true,
      maxAnisotropy: 4,
      textureSize: 512,
      castShadowsOnFigures: true,
      castShadowsOnProps: false,
    };
  }
  return {
    tier,
    dpr: [1, 1.75],
    shadowMapSize: 1024,
    shadows: true,
    antialias: true,
    maxAnisotropy: 8,
    textureSize: 512,
    castShadowsOnFigures: true,
    castShadowsOnProps: true,
  };
}
