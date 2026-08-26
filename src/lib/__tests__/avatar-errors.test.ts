import { describe, expect, it } from "vitest";
import { avatarError, errorFromCaught, errorFromHttp, formatAvatarError } from "../avatar-errors";

describe("avatar-errors", () => {
  it("marca 429 como rate_limited e retryable", () => {
    const e = errorFromHttp(429, { error: "lento" });
    expect(e.code).toBe("rate_limited");
    expect(e.retryable).toBe(true);
  });

  it("AbortError → aborted", () => {
    const e = errorFromCaught(new DOMException("Aborted", "AbortError"));
    expect(e.code).toBe("aborted");
    expect(e.retryable).toBe(false);
  });

  it("formatAvatarError tem título", () => {
    const f = formatAvatarError(avatarError("glb_load", "404"));
    expect(f.title).toMatch(/GLB/i);
    expect(f.detail).toContain("404");
  });
});
