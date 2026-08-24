import { describe, expect, it } from "vitest";
import { MimeticBrain } from "../mimetic-brain";
import type { Memory, Persona } from "../types";

function persona(over: Partial<Persona> = {}): Persona {
  return {
    id: "p1",
    kind: "memorial",
    name: "Antônio",
    relationship: "Avô",
    bio: "Plantava demais, falava de menos.",
    traits: ["Paciente", "Generoso"],
    speechNotes: "Frases curtas.",
    favorites: "Café, a goiabeira.",
    hue: "ink",
    hair: "bald",
    room: "garden",
    memories: [],
    ...over,
  };
}

function memory(over: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    kind: "story",
    title: "A goiabeira",
    body: "Plantou a goiabeira em 1974 e dizia que árvore boa não se poda com pressa.",
    createdAt: Date.now(),
    ...over,
  };
}

describe("retrieveHitsAsync", () => {
  it("devolve hits com excerpt quando há memória relevante", async () => {
    const brain = MimeticBrain.bootstrap(persona({ memories: [memory()] }));
    const hits = await brain.retrieveHitsAsync("goiabeira plantou", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.excerpt.toLowerCase()).toMatch(/goiabeira|plantou|1974/);
  });

  it("sem query relevante ainda pode devolver lista vazia ou baixa", async () => {
    const brain = MimeticBrain.bootstrap(persona({ memories: [memory()] }));
    const hits = await brain.retrieveHitsAsync("xyzzy_not_in_corpus_qqq", 3);
    // pode ser vazio ou hits fracos — só garante que não rebenta
    expect(Array.isArray(hits)).toBe(true);
  });
});
