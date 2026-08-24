import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  sphereInFrustum,
  updateFrustumFromCamera,
  resetCullStats,
  recordCull,
  getCullStats,
} from "../../components/world/frustum-cull";

describe("frustum-cull", () => {
  it("ponto à frente da câmara está visível", () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 1.6, 5);
    cam.lookAt(0, 1, 0);
    cam.updateMatrixWorld();
    updateFrustumFromCamera(cam);
    expect(sphereInFrustum(0, 1, 0, 1, 0.5)).toBe(true);
  });

  it("ponto muito atrás não está visível", () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 1.6, 5);
    cam.lookAt(0, 1, 0);
    cam.updateMatrixWorld();
    updateFrustumFromCamera(cam);
    expect(sphereInFrustum(0, 1, 40, 1, 0.5)).toBe(false);
  });

  it("stats", () => {
    resetCullStats();
    recordCull(true);
    recordCull(false);
    expect(getCullStats()).toEqual({ tested: 2, visible: 1, culled: 1 });
  });
});
