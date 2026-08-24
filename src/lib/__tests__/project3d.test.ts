import { describe, expect, it } from "vitest";
import { projectTo3D } from "../mimetic-brain/project3d";

describe("projectTo3D", () => {
  it("projeta N pontos para coordenadas finitas", () => {
    const { positions } = projectTo3D([
      { id: "a", label: "goiaba", kind: "memory", vector: [1, 0, 0, 0.2] },
      { id: "b", label: "cadarco", kind: "memory", vector: [0, 1, 0, 0.1] },
      { id: "c", label: "cafe", kind: "memory", vector: [0, 0, 1, 0.3] },
    ]);
    expect(positions).toHaveLength(3);
    for (const p of positions) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.01);
    }
  });

  it("lista vazia", () => {
    expect(projectTo3D([])).toEqual({ positions: [], extent: 1 });
  });
});
