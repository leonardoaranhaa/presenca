import { describe, expect, it } from "vitest";
import { gestureEnvelope, motionFromGesture } from "../../components/world/glb-gesture";

describe("glb-gesture", () => {
  it("envelope sobe, mantém e desce", () => {
    // `until` é o instante em que o gesto acaba, e `now` avança para lá.
    // Em now=0 o gesto está a começar: o envelope arranca em 0 e sobe — um
    // abraço que aparecesse já no auge pareceria um salto, não um gesto.
    const until = 1000;
    const dur = 1000;

    expect(gestureEnvelope(0, until, dur)).toBe(0); // início
    expect(gestureEnvelope(90, until, dur)).toBeGreaterThan(0.4); // a subir
    expect(gestureEnvelope(180, until, dur)).toBe(1); // auge atingido
    expect(gestureEnvelope(500, until, dur)).toBe(1); // mantém
    expect(gestureEnvelope(950, until, dur)).toBeLessThan(0.5); // a descer
    expect(gestureEnvelope(1000, until, dur)).toBe(0); // acabou
  });

  it("o envelope nunca sai de 0–1", () => {
    for (let t = 0; t <= 1200; t += 25) {
      const v = gestureEnvelope(t, 1000, 1000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("abraço alarga XZ e inclina", () => {
    const m = motionFromGesture("hug", 1);
    expect(m.scaleXZ).toBeGreaterThan(1);
    expect(m.pitch).toBeLessThan(0);
    expect(m.glow).toBeGreaterThan(0.4);
  });

  it("sem gesto = identidade", () => {
    const m = motionFromGesture(null, 0);
    expect(m.scaleXZ).toBe(1);
    expect(m.glow).toBe(0);
  });
});
