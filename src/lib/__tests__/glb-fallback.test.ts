import { describe, expect, it } from "vitest";
import { validateGlbRef } from "../asset-pipeline";

describe("glb validation + fallback contract", () => {
  it("rejects empty url", () => {
    const v = validateGlbRef({ url: "", kind: "avatar" });
    expect(v.ok).toBe(false);
  });

  it("accepts public path", () => {
    const v = validateGlbRef({ url: "/avatars/x.glb", heightM: 1.7, kind: "avatar" });
    expect(v.ok).toBe(true);
  });

  it("warns extreme height", () => {
    const v = validateGlbRef({ url: "/a.glb", heightM: 0.5, kind: "avatar" });
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
  });
});
