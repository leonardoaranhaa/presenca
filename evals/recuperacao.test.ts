import { describe, expect, it } from "vitest";
import { MimeticBrain } from "@/lib/mimetic-brain";
import { skillRetrieve } from "@/lib/mimetic-brain/skills";
import type { Persona } from "@/lib/types";

/**
 * O que a recuperação encontra, e o que lhe escapa.
 *
 * A recuperação é lexical (BM25F): encontra memórias que partilham palavras
 * com a pergunta. Cobre bem o caso directo. O que não cobre é a pergunta que
 * uma família faz de verdade — "ele gostava de plantas?", "que conselhos ele
 * dava?" — onde nenhuma palavra coincide.
 *
 * A regra que estes testes fixam: quando não há correspondência lexical,
 * devolver **nada** em vez de um resultado do cosseno. O embedding é um hash
 * de 64 dimensões e a semelhança que dá entre textos sem palavras em comum é
 * ruído; entregá-lo ao modelo rotulado como "contexto recuperado" fazia a
 * presença falar da goiabeira a quem perguntou por conselhos.
 */

function antonio(): Persona {
  return {
    id: "p1",
    kind: "memorial",
    name: "Antônio",
    relationship: "Avô",
    bio: "Plantava demais, falava de menos.",
    traits: ["Paciente", "Generoso"],
    speechNotes: "Frases curtas.",
    favorites: "Café, rádio AM.",
    hue: "ink",
    hair: "bald",
    room: "garden",
    memories: [
      {
        id: "m1",
        kind: "story",
        title: "A goiabeira",
        body: "Plantou a goiabeira em 1974, no ano em que a filha nasceu. Dizia que árvore boa não se poda com pressa.",
        createdAt: 1,
      },
      {
        id: "m2",
        kind: "story",
        title: "O café das cinco",
        body: "Todo dia às cinco da manhã passava café. Se você chegasse atrasado, fingia que não tinha feito.",
        createdAt: 2,
      },
      {
        id: "m3",
        kind: "story",
        title: "O cadarço",
        body: "Ensinou a amarrar o cadarço duas vezes — uma para o chão, outra para a vida.",
        createdAt: 3,
      },
    ],
  };
}

/** Só o bloco recuperado, sem o resumo (que lista sempre todos os títulos). */
function recuperado(pergunta: string): string {
  const p = antonio();
  const brain = MimeticBrain.bootstrap(p);
  return skillRetrieve({ persona: p, model: brain.getModel(), query: pergunta }).output ?? "";
}

describe("recuperação — o que encontra", () => {
  it("encontra pela palavra exacta", () => {
    expect(recuperado("fala-me da goiabeira")).toMatch(/goiabeira/i);
  });

  it("encontra a memória certa, não outra qualquer", () => {
    const r = recuperado("o que ele fazia de manhã?");
    expect(r).toMatch(/café|cinco/i);
    expect(r).not.toMatch(/goiabeira/i);
  });

  it("normaliza acentos — 'cafe' encontra 'café'", () => {
    expect(recuperado("cafe")).toMatch(/café/i);
  });
});

describe("recuperação — não inventa relevância", () => {
  // Regressão: sem correspondência lexical, o cosseno de 64 dimensões devolvia
  // um resultado ao acaso e o prompt entregava-o como memória recuperada.

  it("não devolve nada quando nenhuma palavra coincide", () => {
    expect(recuperado("que conselhos ele dava?")).toBe("");
  });

  it("não devolve a goiabeira a quem pergunta por plantas", () => {
    // "plantas" não coincide com "plantou" nem "goiabeira" no índice lexical.
    expect(recuperado("ele gostava de plantas?")).not.toMatch(/goiabeira/i);
  });

  it("pergunta sem relação nenhuma devolve vazio", () => {
    expect(recuperado("qual era o time de futebol dele?")).toBe("");
  });
});

describe("a fronteira que falta atravessar", () => {
  // O alvo da próxima melhoria: recuperação semântica. Estes testes passam
  // enquanto NÃO conseguirmos, e falham assim que conseguirmos — que é o
  // sinal para os mover para a secção de cima.

  it("hoje não liga 'plantas' a 'goiabeira'", () => {
    expect(recuperado("ele gostava de plantas?")).toBe("");
  });

  it("hoje não liga 'conselhos' ao cadarço", () => {
    expect(recuperado("que conselhos ele dava?")).toBe("");
  });
});
