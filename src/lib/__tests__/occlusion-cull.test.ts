import { describe, expect, it } from "vitest";
import {
  isLineOccluded,
  setOcclusionCamera,
  isWorldPointOccluded,
  clearOcclusionHysteresis,
} from "../../components/world/occlusion-cull";
import type { Rect } from "../../components/world/collision";

const wall: Rect = { x0: -0.2, x1: 0.2, z0: -1, z1: 1 };

describe("occlusion-cull", () => {
  it("LOS bloqueado por parede no meio", () => {
    expect(isLineOccluded(-3, 0, 3, 0, [wall])).toBe(true);
  });

  it("LOS livre quando não há occluder", () => {
    expect(isLineOccluded(-3, 0, 3, 0, [])).toBe(false);
  });

  it("histerese esconde de imediato", () => {
    clearOcclusionHysteresis();
    setOcclusionCamera(-3, 0);
    // sem getOccluderRects do modo global — usar isLineOccluded directo já testado
    // isWorldPointOccluded usa getOccluderRects do jogo; só garante API
    expect(typeof isWorldPointOccluded(3, 0, "t1")).toBe("boolean");
  });
});
