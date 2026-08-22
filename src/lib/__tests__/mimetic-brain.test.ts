import { describe, expect, it } from "vitest";
import { MimeticBrain } from "../mimetic-brain";
import { bumpTraits, emptyModel, MODEL_VERSION, pushTrace } from "../mimetic-brain/model";
import { embedText } from "../mimetic-brain/embed";
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

describe("bumpTraits", () => {
  it("não recolhe bordões por omissão", () => {
    // Regressão: qualquer texto alimentava os bordões da persona, incluindo
    // o que o utilizador escrevia no chat.
    const m = bumpTraits(emptyModel(), "eu tenho saudades tuas todos os dias", []);
    expect(m.catchphrases).toEqual([]);
  });

  it("recolhe bordões quando o texto é da própria pessoa", () => {
    const m = bumpTraits(emptyModel(), "come, que esfria", [], true);
    expect(m.catchphrases.length).toBeGreaterThan(0);
  });

  it("reforça traços mencionados no texto", () => {
    const m = bumpTraits(emptyModel(), "ele era muito paciente", ["Paciente"]);
    expect(m.traitWeights.Paciente).toBeGreaterThan(0);
  });
});

describe("pushTrace", () => {
  it("conta passos em trainSteps e mantém version como versão de formato", () => {
    let m = emptyModel();
    for (let i = 0; i < 3; i++) {
      m = pushTrace(m, {
        id: `t${i}`,
        kind: "memory",
        text: "x",
        vector: embedText("x"),
        weight: 1,
        createdAt: Date.now(),
      });
    }
    expect(m.trainSteps).toBe(3);
    expect(m.version).toBe(MODEL_VERSION);
  });
});

describe("MimeticBrain", () => {
  it("absorve memórias no bootstrap", () => {
    const brain = MimeticBrain.bootstrap(persona({ memories: [memory()] }));
    expect(brain.getModel().traces.length).toBeGreaterThan(0);
  });

  it("o resumo evolutivo muda quando chegam memórias", () => {
    const semMemoria = MimeticBrain.bootstrap(persona()).getModel().evolvingSummary;
    const comMemoria = MimeticBrain.bootstrap(
      persona({ memories: [memory()] }),
    ).getModel().evolvingSummary;
    // Regressão: skillEvolve curto-circuitava e o resumo ficava congelado.
    expect(comMemoria).not.toBe(semMemoria);
    expect(comMemoria).toContain("A goiabeira");
  });

  it("o resumo é limitado e não cresce sem fim", () => {
    const memories = Array.from({ length: 40 }, (_, i) =>
      memory({ id: `m${i}`, title: `Memória ${i}`, body: "corpo ".repeat(60) }),
    );
    const summary = MimeticBrain.bootstrap(persona({ memories })).getModel().evolvingSummary;
    expect(summary.length).toBeLessThanOrEqual(600);
  });

  it("a fala do utilizador não vira bordão da persona", () => {
    const brain = MimeticBrain.bootstrap(persona({ memories: [memory()] }));
    const antes = [...brain.getModel().catchphrases];
    brain.absorbChat("user", "sinto muito a tua falta, avô, todos os dias");
    expect(brain.getModel().catchphrases).toEqual(antes);
  });

  it("o systemPrompt declara sempre que é mímica", () => {
    const prompt = MimeticBrain.bootstrap(persona({ memories: [memory()] })).composeSystemPrompt(
      "o que plantou?",
    );
    expect(prompt).toContain("mímica");
    expect(prompt).toContain("Limites éticos");
  });

  it("a recuperação traz a memória relevante para o prompt", () => {
    const brain = MimeticBrain.bootstrap(
      persona({
        memories: [
          memory(),
          memory({ id: "m2", title: "O rádio", body: "Ouvia rádio AM ao domingo." }),
        ],
      }),
    );
    const prompt = brain.composeSystemPrompt("fala-me da goiabeira");
    expect(prompt).toContain("goiabeira");
  });
});
