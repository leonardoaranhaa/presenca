import type { Persona } from "@/lib/types";
import type { MimeticModel } from "./types";

const MAX_TRACES = 200;

export function emptyModel(): MimeticModel {
  return {
    version: 1,
    updatedAt: Date.now(),
    evolvingSummary: "",
    traitWeights: {},
    mannerisms: [],
    catchphrases: [],
    values: [],
    speechPatterns: [],
    trainSteps: 0,
    traces: [],
  };
}

export function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out.slice(0, 24);
}

export function modelFromPersona(p: Persona): MimeticModel {
  const base = p.soul?.mimetic ?? emptyModel();
  const traitWeights = { ...base.traitWeights };
  for (const t of p.traits) traitWeights[t] = (traitWeights[t] ?? 0.5) + 0.1;
  return {
    ...base,
    traitWeights,
    mannerisms: unique([...(base.mannerisms || []), ...(p.soul?.mannerisms || [])]),
    catchphrases: unique([...(base.catchphrases || []), ...(p.soul?.catchphrases || [])]),
    values: unique([...(base.values || []), ...(p.soul?.values || [])]),
    evolvingSummary:
      base.evolvingSummary ||
      p.soul?.summary ||
      `${p.name}: presença mímica a partir de ${p.memories.length} memórias.`,
  };
}

export function pushTrace(model: MimeticModel, trace: MimeticModel["traces"][0]): MimeticModel {
  return {
    ...model,
    traces: [...model.traces, trace].slice(-MAX_TRACES),
    updatedAt: Date.now(),
    trainSteps: model.trainSteps + 1,
    version: model.version + 1,
  };
}

export function bumpTraits(model: MimeticModel, text: string, traits: string[]): MimeticModel {
  const lower = text.toLowerCase();
  const traitWeights = { ...model.traitWeights };
  for (const t of traits) {
    if (lower.includes(t.toLowerCase())) traitWeights[t] = (traitWeights[t] ?? 0) + 0.15;
  }
  const phrases = text.match(/[^.!?\n]{8,40}/g) ?? [];
  let catchphrases = [...model.catchphrases];
  for (const ph of phrases.slice(0, 3)) {
    const p = ph.trim();
    if (p.split(" ").length <= 8) catchphrases.push(p);
  }
  return { ...model, traitWeights, catchphrases: unique(catchphrases).slice(0, 16) };
}
