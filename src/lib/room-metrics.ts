/**
 * Medidas simples da casa → layout "simple-room".
 * Unidades em metros. Origem no centro do cômodo.
 */

export type RoomMetrics = {
  /** Largura (eixo X) */
  widthM: number;
  /** Profundidade (eixo Z) */
  depthM: number;
  /** Pé-direito */
  heightM: number;
  /** Espessura das paredes */
  wallT?: number;
  /** Largura da porta na parede +Z (frente) */
  doorWidthM?: number;
  /** Janelas na parede -Z (fundos) */
  windowCount?: number;
};

export const DEFAULT_METRICS: RoomMetrics = {
  widthM: 5.5,
  depthM: 4.2,
  heightM: 2.7,
  wallT: 0.18,
  doorWidthM: 0.9,
  windowCount: 2,
};

export function clampMetrics(m: Partial<RoomMetrics>): RoomMetrics {
  const w = Math.min(20, Math.max(2.4, m.widthM ?? DEFAULT_METRICS.widthM));
  const d = Math.min(20, Math.max(2.4, m.depthM ?? DEFAULT_METRICS.depthM));
  const h = Math.min(5, Math.max(2.2, m.heightM ?? DEFAULT_METRICS.heightM));
  const wallT = Math.min(0.4, Math.max(0.12, m.wallT ?? 0.18));
  const doorWidthM = Math.min(w * 0.5, Math.max(0.7, m.doorWidthM ?? 0.9));
  const windowCount = Math.min(4, Math.max(0, Math.round(m.windowCount ?? 2)));
  return { widthM: w, depthM: d, heightM: h, wallT, doorWidthM, windowCount };
}

/** Retângulos andáveis e bloqueios em coordenadas de mundo (centro = 0,0). */
export function metricsToWalkables(m: RoomMetrics) {
  const hw = m.widthM / 2;
  const hd = m.depthM / 2;
  const t = m.wallT ?? 0.18;
  const door = m.doorWidthM ?? 0.9;
  return {
    floor: { x0: -hw + t, x1: hw - t, z0: -hd + t, z1: hd - t },
    /** faixa da porta para sair à varanda/jardim virtual */
    doorStrip: {
      x0: -door / 2,
      x1: door / 2,
      z0: hd - t - 0.05,
      z1: hd + 1.2,
    },
    /** jardim simples à frente */
    yard: { x0: -hw - 1, x1: hw + 1, z0: hd, z1: hd + 6 },
  };
}
