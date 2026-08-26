/**
 * Cérebro mímico — tipos.
 * Aprende com dados confiados; imita estilo, não inventa identidade.
 */

import type { Memory, Persona } from "@/lib/types";

export type MimeticTraceKind =
  "memory" | "chat_user" | "chat_presence" | "correction" | "style_hint";

/** Campos para BM25F (pesos diferentes por campo). */
export type MimeticFieldName = "title" | "body" | "kind" | "correction" | "chat";

export type MimeticTrace = {
  id: string;
  kind: MimeticTraceKind;
  /** texto concatenado (compat + prompt) */
  text: string;
  /** campos separados para BM25F */
  fields?: Partial<Record<MimeticFieldName, string>>;
  vector: number[];
  /** embedding semântico (API); opcional */
  semanticVector?: number[];
  weight: number;
  createdAt: number;
  sourceMemoryId?: string;
};

export type MimeticModel = {
  version: number;
  updatedAt: number;
  evolvingSummary: string;
  traitWeights: Record<string, number>;
  mannerisms: string[];
  catchphrases: string[];
  values: string[];
  speechPatterns: string[];
  trainSteps: number;
  traces: MimeticTrace[];
};

export type MimeticSkillName =
  "ingest_memory" | "ingest_chat" | "retrieve" | "evolve" | "compose_prompt" | "answer";

export type SkillContext = {
  persona: Persona;
  model: MimeticModel;
  query?: string;
  memory?: Memory;
  chat?: { role: "user" | "presence"; text: string };
};

export type SkillResult = {
  model: MimeticModel;
  output?: string;
  notes?: string[];
};
