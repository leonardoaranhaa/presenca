import { uid } from "@/lib/utils";
import { embedText, topKHybrid } from "./embed";
import { bumpTraits, pushTrace, unique } from "./model";
import type { MimeticModel, SkillContext, SkillResult } from "./types";

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
  model = bumpTraits(model, text, ctx.persona.traits);
  model = {
    ...model,
    evolvingSummary: evolveSummary(model, text, ctx.persona.name),
  };
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
  model = bumpTraits(model, c.text, ctx.persona.traits);
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
    })),
    5,
    0.75,
  );
  return {
    model: ctx.model,
    output: hits
      .map((h, i) => `(${i + 1}) [bm25f=${h.bm25.toFixed(2)}] ${h.text}`)
      .join("\n"),
    notes: [`${hits.length} traços BM25F/hybrid`],
  };
}

export function skillEvolve(ctx: SkillContext): SkillResult {
  const model = ctx.model;
  const topTraits = Object.entries(model.traitWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
  return {
    model: {
      ...model,
      evolvingSummary:
        model.evolvingSummary ||
        `Presença mímica de ${ctx.persona.name} com ${model.traces.length} traços de memória.`,
      mannerisms: unique([...model.mannerisms, ...topTraits.map((t) => `eco de ${t}`)]).slice(0, 12),
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

function evolveSummary(model: MimeticModel, newText: string, name: string): string {
  const prev = model.evolvingSummary || `Presença mímica de ${name}.`;
  const snippet = newText.slice(0, 160).replace(/\s+/g, " ");
  if (prev.includes(snippet.slice(0, 40))) return prev;
  const merged = `${prev} · + ${snippet}`;
  return merged.length > 600 ? merged.slice(merged.length - 600) : merged;
}
