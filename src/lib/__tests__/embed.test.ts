import { describe, expect, it } from "vitest";
import {
  buildBm25FIndex,
  cosine,
  embedText,
  tokenize,
  topKBm25F,
  topKHybrid,
} from "../mimetic-brain/embed";
import { radical } from "../mimetic-brain/stem";

describe("tokenize", () => {
  it("remove acentos para 'memoria' casar com 'memória'", () => {
    expect(tokenize("Memória")).toEqual(tokenize("memoria"));
  });

  it("descarta tokens curtos, que só somam ruído ao índice", () => {
    expect(tokenize("o pai de um rapaz")).toEqual(["pai", "rapaz"]);
  });
});

describe("embedText", () => {
  it("devolve um vetor normalizado", () => {
    const v = embedText("a goiabeira do quintal");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("é determinístico — é por isso que pode não ser persistido", () => {
    expect(embedText("café passado na hora")).toEqual(embedText("café passado na hora"));
  });

  it("texto vazio não rebenta", () => {
    expect(embedText("").every((x) => x === 0)).toBe(true);
  });
});

describe("BM25F", () => {
  const docs = [
    { id: "a", text: "goiabeira", fields: { title: "A goiabeira", body: "plantou em 1974" } },
    {
      id: "b",
      text: "café",
      fields: { title: "O café", body: "falava da goiabeira ao passar o café" },
    },
  ];

  it("pesa o título acima do corpo", () => {
    const hits = topKBm25F("goiabeira", docs, 5);
    expect(hits[0]?.id).toBe("a");
  });

  it("consulta sem correspondência devolve vazio", () => {
    expect(topKBm25F("bicicleta", docs, 5)).toEqual([]);
  });

  it("conta df ao nível do documento, não por campo", () => {
    const index = buildBm25FIndex(docs);
    // O índice guarda radicais, não palavras: procurar por "goiabeira" à letra
    // dava undefined e o teste passava a mentir sobre o que o índice tem.
    expect(index.df.get(radical("goiabeira"))).toBe(2);
  });
});

describe("topKHybrid", () => {
  const items = [
    {
      id: "a",
      text: "a goiabeira do quintal",
      vector: embedText("a goiabeira do quintal"),
      weight: 1,
      fields: { title: "A goiabeira", body: "do quintal" },
    },
    {
      id: "b",
      text: "rádio AM no domingo",
      vector: embedText("rádio AM no domingo"),
      weight: 1,
      fields: { title: "O rádio", body: "no domingo" },
    },
  ];

  it("recupera o traço certo", () => {
    expect(topKHybrid("goiabeira", items, 2)[0]?.id).toBe("a");
  });

  it("respeita o k", () => {
    expect(topKHybrid("quintal domingo", items, 1)).toHaveLength(1);
  });
});

describe("cosine", () => {
  it("um texto é mais parecido consigo do que com outro", () => {
    const a = embedText("plantava demais falava de menos");
    const b = embedText("plantava demais falava de menos");
    const c = embedText("rádio AM no domingo de manhã");
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});

describe("topKHybrid RRF", () => {
  const docs = [
    {
      id: "goiaba",
      text: "A goiabeira. Ele plantou a goiabeira no quintal.",
      vector: embedText("A goiabeira. Ele plantou a goiabeira no quintal."),
      weight: 1,
      fields: { title: "A goiabeira", body: "Ele plantou a goiabeira no quintal." },
    },
    {
      id: "cadarco",
      text: "O cadarço. Amarrar o sapato duas vezes.",
      vector: embedText("O cadarço. Amarrar o sapato duas vezes."),
      weight: 1,
      fields: { title: "O cadarço", body: "Amarrar o sapato duas vezes." },
    },
  ];

  it("ranqueia goiabeira para pergunta sobre árvore plantada", () => {
    const hits = topKHybrid("goiabeira plantou no quintal", docs, 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toBe("goiaba");
  });

  it("não devolve hits sem overlap lexical", () => {
    const hits = topKHybrid("conselhos financeiros da bolsa", docs, 2);
    expect(hits).toEqual([]);
  });
});
