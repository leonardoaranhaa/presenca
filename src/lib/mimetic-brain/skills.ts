import { uid } from "@/lib/utils";
import { embedText, topKHybrid } from "./embed";
import { embedSemantic } from "./semantic";
import { bumpTraits, pushTrace, unique } from "./model";
import type { SkillContext, SkillResult } from "./types";

export function skillIngestMemory(ctx: SkillContext): SkillResult {
  const m = ctx.memory;
  if (!m) return { model: ctx.model, notes: ["sem memória"] };
  const text = `${m.title}. ${m.body}`;
  let model = pushTrace(ctx.model, {
    id: uid("tr"),
    kind: "memory",
    text,
    fields: {
      title: m.title,
      body: m.body,
      kind: m.kind,
    },
    vector: embedText(text),
    weight: 1,
    createdAt: Date.now(),
    sourceMemoryId: m.id,
  });
  model = bumpTraits(model, text, ctx.persona.traits, true);
  // O resumo é recalculado por skillEvolve, que corre logo a seguir em
  // MimeticBrain.absorbMemory. Não há resumo incremental a acumular aqui.
  return { model, notes: ["memória absorvida"] };
}

export function skillIngestChat(ctx: SkillContext): SkillResult {
  const c = ctx.chat;
  if (!c) return { model: ctx.model };
  const kind = c.role === "user" ? "chat_user" : "chat_presence";
  let model = pushTrace(ctx.model, {
    id: uid("tr"),
    kind,
    text: c.text,
    fields: { chat: c.text },
    vector: embedText(c.text),
    weight: c.role === "presence" ? 0.6 : 0.85,
    createdAt: Date.now(),
  });
  if (c.role === "user" && /não (falava|dizia)|na verdade|ele dizia|ela dizia/i.test(c.text)) {
    model = pushTrace(model, {
      id: uid("tr"),
      kind: "correction",
      text: c.text,
      fields: { correction: c.text, chat: c.text },
      vector: embedText(c.text),
      weight: 1.2,
      createdAt: Date.now(),
    });
    model = {
      ...model,
      speechPatterns: unique([...model.speechPatterns, c.text.slice(0, 120)]),
    };
  }
  model = bumpTraits(model, c.text, ctx.persona.traits, c.role === "presence");
  return { model, notes: ["chat absorvido"] };
}

export function skillRetrieve(ctx: SkillContext): SkillResult {
  const q = ctx.query?.trim() || "";
  if (!q || !ctx.model.traces.length) return { model: ctx.model, output: "" };
  // BM25 (70%) + cosine lexical (30%)
  const hits = topKHybrid(
    q,
    ctx.model.traces.map((tr) => ({
      id: tr.id,
      vector: tr.vector,
      text: tr.text,
      weight: tr.weight,
      fields: tr.fields,
      semanticVector: tr.semanticVector,
    })),
    5,
    0.75,
  );
  return {
    model: ctx.model,
    output: hits.map((h, i) => `(${i + 1}) [bm25f=${h.bm25.toFixed(2)}] ${h.text}`).join("\n"),
    notes: [`${hits.length} traços BM25F/hybrid`],
  };
}

/**
 * Recalcula o resumo evolutivo e os maneirismos a partir do estado actual.
 *
 * Antes: `evolvingSummary` era `model.evolvingSummary || <texto base>`, ou
 * seja, depois da primeira memória nunca mais mudava — apesar de a função se
 * chamar "evolve". E os maneirismos recebiam `"eco de <traço>"`, texto de
 * enchimento que ia parar ao systemPrompt sem dizer nada ao modelo.
 *
 * Agora é derivado, não acumulado: recalcular sobre os mesmos traços dá
 * sempre o mesmo resultado, e o tamanho é limitado por construção.
 */
export function skillEvolve(ctx: SkillContext): SkillResult {
  const model = ctx.model;
  const topTraits = Object.entries(model.traitWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);

  const memoryTraces = model.traces
    .filter((t) => t.kind === "memory")
    .sort((a, b) => b.weight - a.weight || b.createdAt - a.createdAt)
    .slice(0, 4)
    .map((t) => (t.fields?.title || t.text).trim().slice(0, 80))
    .filter(Boolean);

  const base = ctx.persona.soul?.summary?.trim() || `Presença mímica de ${ctx.persona.name}.`;

  const parts = [base];
  if (topTraits.length) parts.push(`Traços dominantes: ${topTraits.join(", ")}.`);
  if (memoryTraces.length) parts.push(`Memórias centrais: ${memoryTraces.join("; ")}.`);
  parts.push(`${model.traces.length} traços absorvidos.`);

  return {
    model: {
      ...model,
      evolvingSummary: parts.join(" ").slice(0, 600),
      mannerisms: unique([...model.mannerisms, ...(ctx.persona.soul?.mannerisms ?? [])]).slice(
        0,
        12,
      ),
      updatedAt: Date.now(),
    },
    notes: ["modelo evoluiu"],
  };
}

export function skillComposePrompt(ctx: SkillContext, retrieved: string): SkillResult {
  const m = ctx.model;
  const traits = Object.entries(m.traitWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, w]) => `${k}(${w.toFixed(1)})`)
    .join(", ");
  const block = [
    "## Cérebro mímico (auto-evolutivo, local)",
    `Resumo evolutivo: ${m.evolvingSummary}`,
    `Passos de treino: ${m.trainSteps} · traços: ${m.traces.length}`,
    traits ? `Traços reforçados: ${traits}` : "",
    m.catchphrases.length ? `Bordões observados: ${m.catchphrases.slice(0, 8).join(" | ")}` : "",
    m.speechPatterns.length
      ? `Correções da família: ${m.speechPatterns.slice(0, 4).join(" | ")}`
      : "",
    retrieved
      ? `Memória recuperada para esta fala:\n${retrieved}`
      : "Sem recuperação específica — use só o perfil e memórias do prompt base.",
    "Lembre: você é mímica, não a pessoa. Prefira o recuperado ao inventado.",
  ]
    .filter(Boolean)
    .join("\n");
  return { model: m, output: block };
}

/** Recuperação híbrida com embedding semântico da query (e docs se já indexados). */
export async function skillRetrieveAsync(ctx: SkillContext): Promise<SkillResult> {
  const q = ctx.query?.trim() || "";
  if (!q || !ctx.model.traces.length) return { model: ctx.model, output: "" };
  const querySemantic = await embedSemantic(q);
  const hits = topKHybrid(
    q,
    ctx.model.traces.map((tr) => ({
      id: tr.id,
      vector: tr.vector,
      text: tr.text,
      weight: tr.weight,
      fields: tr.fields,
      semanticVector: tr.semanticVector,
    })),
    5,
    0.75,
    undefined,
    querySemantic,
  );
  return {
    model: ctx.model,
    output: hits
      .map((h, i) => {
        const sem = h.semantic != null ? ` sem=${h.semantic.toFixed(2)}` : "";
        return `(${i + 1}) [bm25f=${h.bm25.toFixed(2)}${sem}] ${h.text}`;
      })
      .join("\n"),
    notes: [`${hits.length} traços hybrid`, querySemantic ? "semantic:on" : "semantic:off"],
  };
}

/** Hits estruturados para citação na UI (não só texto no prompt). */
export type RetrieveHit = {
  id: string;
  excerpt: string;
  score: number;
  bm25: number;
  sourceMemoryId?: string;
};

export function skillRetrieveHits(ctx: SkillContext, k = 5): RetrieveHit[] {
  const q = ctx.query?.trim() || "";
  if (!q || !ctx.model.traces.length) return [];
  const byId = new Map(ctx.model.traces.map((tr) => [tr.id, tr]));
  const hits = topKHybrid(
    q,
    ctx.model.traces.map((tr) => ({
      id: tr.id,
      vector: tr.vector,
      text: tr.text,
      weight: tr.weight,
      fields: tr.fields,
      semanticVector: tr.semanticVector,
    })),
    k,
    0.75,
  );
  return hits.map((h) => {
    const tr = byId.get(h.id);
    const text = h.text.replace(/\s+/g, " ").trim();
    return {
      id: h.id,
      excerpt: text.length > 120 ? text.slice(0, 117) + "…" : text,
      score: h.score,
      bm25: h.bm25,
      sourceMemoryId: tr?.sourceMemoryId,
    };
  });
}

export async function skillRetrieveHitsAsync(ctx: SkillContext, k = 5): Promise<RetrieveHit[]> {
  const q = ctx.query?.trim() || "";
  if (!q || !ctx.model.traces.length) return [];
  const querySemantic = await embedSemantic(q);
  const byId = new Map(ctx.model.traces.map((tr) => [tr.id, tr]));
  const hits = topKHybrid(
    q,
    ctx.model.traces.map((tr) => ({
      id: tr.id,
      vector: tr.vector,
      text: tr.text,
      weight: tr.weight,
      fields: tr.fields,
      semanticVector: tr.semanticVector,
    })),
    k,
    0.75,
    undefined,
    querySemantic,
  );
  return hits.map((h) => {
    const tr = byId.get(h.id);
    const text = h.text.replace(/\s+/g, " ").trim();
    return {
      id: h.id,
      excerpt: text.length > 120 ? text.slice(0, 117) + "…" : text,
      score: h.score,
      bm25: h.bm25,
      sourceMemoryId: tr?.sourceMemoryId,
    };
  });
}

/** Preenche semanticVector em traços que ainda não têm (best-effort). */
export async function enrichTracesWithSemantics(
  model: import("./types").MimeticModel,
): Promise<import("./types").MimeticModel> {
  const { embedSemanticBatch } = await import("./semantic");
  const need = model.traces.filter((t) => !t.semanticVector?.length);
  if (!need.length) return model;
  const vectors = await embedSemanticBatch(need.map((t) => t.text));
  const byId = new Map(need.map((t, i) => [t.id, vectors[i]]));
  return {
    ...model,
    traces: model.traces.map((t) => {
      const v = byId.get(t.id);
      return v?.length ? { ...t, semanticVector: v } : t;
    }),
    updatedAt: Date.now(),
  };
}
