/**
 * Exemplo de uso — BM25F + hybrid no cérebro mímico
 *
 * Não é importado pela app em runtime; serve de referência e pode
 * ser colado num teste ou no console do browser.
 *
 * Executar mentalmente / em Node:
 *   import { exampleBm25FSearch, exampleMimeticPipeline } from "./example-bm25f";
 *   console.log(exampleBm25FSearch());
 */

import type { Persona } from "@/lib/types";
import { topKBm25F, topKHybrid, BM25F_FIELD_WEIGHTS, embedText } from "./embed";
import { MimeticBrain } from "./orchestrator";
import { emptyModel } from "./model";

/** Documentos de exemplo (como o cofre indexaria). */
const SAMPLE_DOCS = [
  {
    id: "m1",
    text: "A goiabeira. Ele plantou a goiabeira no dia em que a neta nasceu.",
    weight: 1,
    fields: {
      title: "A goiabeira",
      body: "Ele plantou a goiabeira no dia em que a neta nasceu. Árvore e gente precisam de tempo e água.",
      kind: "story",
    },
    vector: embedText(
      "A goiabeira. Ele plantou a goiabeira no dia em que a neta nasceu.",
    ),
  },
  {
    id: "m2",
    text: "O cadarço. Ensinava a amarrar o sapato duas vezes.",
    weight: 1,
    fields: {
      title: "O cadarço",
      body: "Ensinava a amarrar o sapato duas vezes. Uma para o chão, outra para a vida.",
      kind: "story",
    },
    vector: embedText("O cadarço. Ensinava a amarrar o sapato duas vezes."),
  },
  {
    id: "c1",
    text: "Na verdade ele nunca dizia eu te amo — dizia come que esfria.",
    weight: 1.2,
    fields: {
      correction: "Na verdade ele nunca dizia eu te amo — dizia come que esfria.",
      chat: "Na verdade ele nunca dizia eu te amo — dizia come que esfria.",
    },
    vector: embedText(
      "Na verdade ele nunca dizia eu te amo — dizia come que esfria.",
    ),
  },
];

/**
 * 1) BM25F puro — título/correção pesam mais que chat.
 *
 * Query sobre "goiabeira" → deve ranquear m1 no topo.
 * Query sobre "eu te amo" / "come que esfria" → c1 sobe pelo campo correction (boost 2.5).
 */
export function exampleBm25FSearch() {
  const queryGoiaba = "me fala da goiabeira";
  const queryAmor = "ele dizia eu te amo?";

  const byGoiaba = topKBm25F(queryGoiaba, SAMPLE_DOCS, 3);
  const byAmor = topKBm25F(queryAmor, SAMPLE_DOCS, 3);
  const hybrid = topKHybrid(queryAmor, SAMPLE_DOCS, 3, 0.75);

  return {
    fieldWeights: BM25F_FIELD_WEIGHTS,
    queryGoiaba,
    hitsGoiaba: byGoiaba.map((h) => ({
      id: h.id,
      bm25f: Number(h.bm25.toFixed(3)),
      snippet: h.text.slice(0, 60),
    })),
    queryAmor,
    hitsAmor: byAmor.map((h) => ({
      id: h.id,
      bm25f: Number(h.bm25.toFixed(3)),
      snippet: h.text.slice(0, 60),
    })),
    hybridAmor: hybrid.map((h) => ({
      id: h.id,
      score: Number(h.score.toFixed(3)),
      bm25f: Number(h.bm25.toFixed(3)),
    })),
  };
}

/**
 * 2) Pipeline completo do cérebro mímico (absorver → recuperar → prompt).
 */
export function exampleMimeticPipeline() {
  const persona = {
    id: "ex_antonio",
    kind: "memorial" as const,
    name: "Antônio",
    relationship: "Avô",
    bio: "Plantava demais, falava de menos.",
    traits: ["Paciente", "Humor seco"],
    speechNotes: "Chama de meu bem.",
    favorites: "Café, goiabeira",
    hue: "ink" as const,
    hair: "bald" as const,
    room: "garden" as const,
    memories: [
      {
        id: "m1",
        kind: "story" as const,
        title: "A goiabeira",
        body: "Ele plantou a goiabeira no dia em que a neta nasceu.",
        createdAt: 1,
      },
    ],
    soul: {
      awakenedAt: 1,
      summary: "Presença mímica de exemplo",
      voice: "Grave",
      mannerisms: [],
      catchphrases: ["Meu bem"],
      values: [],
      systemPrompt: "",
      mimetic: emptyModel(),
    },
  } satisfies Persona;

  const brain = MimeticBrain.bootstrap(persona);
  brain.absorbMemory(persona.memories[0]!);
  brain.absorbChat("user", "Na verdade ele nunca dizia eu te amo — dizia come que esfria.");

  const query = "o que ele plantou no jardim?";
  const systemPrompt = brain.composeSystemPrompt(query);
  const model = brain.getModel();

  return {
    query,
    trainSteps: model.trainSteps,
    traceCount: model.traces.length,
    tracesWithFields: model.traces.map((t) => ({
      id: t.id,
      kind: t.kind,
      fields: t.fields ? Object.keys(t.fields) : [],
    })),
    /** extracto do prompt onde entram os hits BM25F */
    promptHasRetrieval: systemPrompt.includes("Memória recuperada"),
    promptSnippet: systemPrompt.slice(-800),
  };
}

/**
 * Uso no chat real (já ligado em presence-chat + store):
 *
 * ```ts
 * import { MimeticBrain } from "@/lib/mimetic-brain";
 *
 * // ao enviar mensagem
 * const brain = MimeticBrain.bootstrap(persona);
 * const systemPrompt = brain.composeSystemPrompt(userMessage);
 * await chatWithPresence({ name, systemPrompt, history, message: userMessage });
 * // store.pushMessage já chama absorbChat e persiste soul.mimetic
 * ```
 *
 * Uso só de ranking:
 *
 * ```ts
 * import { topKBm25F, BM25F_FIELD_WEIGHTS } from "@/lib/mimetic-brain/embed";
 *
 * const hits = topKBm25F("goiabeira", docsComFields, 5);
 * // hits[0].bm25 — score BM25F
 * ```
 */
export const USAGE_SNIPPETS = `
// BM25F isolado
import { topKBm25F } from "@/lib/mimetic-brain/embed";

const hits = topKBm25F("goiabeira", [
  {
    id: "1",
    text: "A goiabeira. Ele plantou...",
    fields: { title: "A goiabeira", body: "Ele plantou a goiabeira..." },
  },
], 5);

// Hybrid (BM25F 75% + cosine 25%)
import { topKHybrid, embedText } from "@/lib/mimetic-brain/embed";

const hits2 = topKHybrid("come que esfria", [
  {
    id: "c1",
    text: "...",
    vector: embedText("..."),
    weight: 1.2,
    fields: { correction: "dizia come que esfria" },
  },
], 5, 0.75);

// Cérebro mímico (orquestração)
import { MimeticBrain } from "@/lib/mimetic-brain";

const brain = MimeticBrain.bootstrap(persona);
brain.absorbMemory(memory);
const systemPrompt = brain.composeSystemPrompt(userText);
`;
