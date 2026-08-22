import { beforeEach, describe, expect, it } from "vitest";
import { isWalkable, setCollisionMode, slideMove } from "@/components/world/collision";
import { clampMetrics, metricsToWalkables } from "../room-metrics";

describe("clampMetrics", () => {
  it("mantém as medidas dentro de limites habitáveis", () => {
    const m = clampMetrics({ widthM: 0.2, depthM: 999, heightM: 0.1 });
    expect(m.widthM).toBeGreaterThanOrEqual(2.4);
    expect(m.depthM).toBeLessThanOrEqual(20);
    expect(m.heightM).toBeGreaterThanOrEqual(2.2);
  });

  it("a porta nunca é mais larga do que metade da parede", () => {
    const m = clampMetrics({ widthM: 3, doorWidthM: 10 });
    expect(m.doorWidthM!).toBeLessThanOrEqual(1.5);
  });
});

describe("metricsToWalkables", () => {
  it("o chão fica dentro das paredes", () => {
    const m = clampMetrics({ widthM: 6, depthM: 4, wallT: 0.2 });
    const w = metricsToWalkables(m);
    expect(w.floor.x0).toBeCloseTo(-2.8);
    expect(w.floor.x1).toBeCloseTo(2.8);
  });
});

describe("colisão em simple-room", () => {
  beforeEach(() => {
    setCollisionMode("simple-room", clampMetrics({ widthM: 6, depthM: 4 }));
  });

  it("o centro do quarto é andável", () => {
    expect(isWalkable(0, 0)).toBe(true);
  });

  it("fora das paredes não é andável", () => {
    expect(isWalkable(50, 50)).toBe(false);
  });

  it("slideMove nunca devolve uma posição não andável", () => {
    const r = slideMove(0, 0, 50, 0);
    expect(isWalkable(r.x, r.z)).toBe(true);
  });

  it("deslizar ao longo da parede preserva o movimento no outro eixo", () => {
    // empurrar contra +X mas também para +Z: o Z deve avançar
    const r = slideMove(0, 0, 50, 0.5);
    expect(r.z).toBeGreaterThan(0);
  });
});

describe("modo aberto (garden-only)", () => {
  it("anda livremente perto da origem", () => {
    setCollisionMode("open");
    expect(isWalkable(10, -12)).toBe(true);
  });

  it("é um campo de raio 40 m, não um plano infinito", () => {
    setCollisionMode("open");
    expect(isWalkable(120, -80)).toBe(false);
  });
});
