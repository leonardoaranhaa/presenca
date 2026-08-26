/**
 * Embeddings lexicais + BM25 + BM25F (campos com pesos).
 *
 * BM25F: o mesmo termo em "title" vale mais que em "body" ou "chat".
 */

import { radical } from "./stem";

const DIM = 64;

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** Pesos por campo (BM25F). Ajustáveis sem mudar o resto do pipeline. */
export const BM25F_FIELD_WEIGHTS: Record<string, number> = {
  title: 3.0,
  correction: 2.5,
  body: 1.0,
  kind: 0.5,
  chat: 0.6,
};

export type FieldName = keyof typeof BM25F_FIELD_WEIGHTS | string;

/**
 * Palavras vazias do português.
 *
 * O IDF do BM25 devia tratar disto sozinho — palavras comuns aparecem em
 * muitos documentos e perdem peso. Mas isso pressupõe um corpus; aqui o
 * "corpus" é o cofre de uma família, às vezes três memórias. Com tão pouco,
 * "que" aparecer numa memória e não noutra dá-lhe IDF alto, e a pergunta
 * "que conselhos ele dava?" recuperava a memória da goiabeira porque ambas
 * continham "que".
 *
 * Inclui pronomes e verbos auxiliares que dominam as perguntas de família
 * ("ele gostava de…", "o que ele fazia…") sem dizer nada sobre o conteúdo.
 * Sem acentos: `tokenize` normaliza antes de comparar.
 */
const VAZIAS = new Set([
  // artigos e preposições
  "que",
  "com",
  "para",
  "por",
  "dos",
  "das",
  "nos",
  "nas",
  "pelo",
  "pela",
  "num",
  "numa",
  "uns",
  "umas",
  "aos",
  "sem",
  "sob",
  "sobre",
  "entre",
  "ate",
  // pronomes
  "ele",
  "ela",
  "eles",
  "elas",
  "voce",
  "voces",
  "nos",
  "meu",
  "minha",
  "seu",
  "sua",
  "dele",
  "dela",
  "deles",
  "delas",
  "isso",
  "isto",
  "aquilo",
  "esse",
  "essa",
  "este",
  "esta",
  "aquele",
  "aquela",
  "quem",
  "qual",
  "quais",
  // verbos auxiliares e de ligação
  "era",
  "eram",
  "foi",
  "foram",
  "ser",
  "estar",
  "esta",
  "estava",
  "estavam",
  "tem",
  "tinha",
  "tinham",
  "ter",
  "havia",
  "sao",
  "eras",
  "seja",
  "fosse",
  // advérbios e conectores frequentes
  "nao",
  "sim",
  "mais",
  "menos",
  "muito",
  "muita",
  "muitos",
  "muitas",
  "todo",
  "toda",
  "todos",
  "todas",
  "mas",
  "como",
  "quando",
  "onde",
  "porque",
  "pois",
  "entao",
  "tambem",
  "ainda",
  "sempre",
  "nunca",
  "agora",
  "depois",
  "antes",
  "aqui",
  "ali",
  "lah",
  "assim",
  "bem",
  "mal",
  "ja",
  "so",
  "outro",
  "outra",
]);

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 2 && !VAZIAS.has(t))
      // Radicalizar aqui serve o BM25F e o vetor de uma vez: são ambos
      // construídos a partir desta lista. Ver `stem.ts` para o porquê.
      .map(radical)
  );
}

function hashToken(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % DIM;
}

export function embedText(text: string): number[] {
  const v = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) return v;
  // unigramas — tokens mais longos pesam um pouco mais (sinal lexical)
  for (const t of tokens) {
    const w = 1 + Math.min(0.5, (t.length - 3) * 0.08);
    v[hashToken(t)] += w;
  }
  // bigramas: "goiabeira plantou" captura contigüidade que BM25 já cobre
  // parcialmente, e ajuda o cosseno quando a query reordena as palavras.
  for (let i = 0; i < tokens.length - 1; i++) {
    const bi = tokens[i]! + "_" + tokens[i + 1]!;
    v[hashToken(bi)] += 0.65;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/**
 * Reciprocal Rank Fusion — funde listas ordenadas sem calibrar escalas.
 * score(d) = sum_i 1 / (k + rank_i(d))
 * k=60 é o default clássico de Cormack et al.
 */
export function reciprocalRankFusion(
  rankedLists: { id: string; text: string; bm25?: number; cosine?: number; semantic?: number }[][],
  kRrf = 60,
): Map<string, { score: number; text: string; bm25: number; cosine: number }> {
  const acc = new Map<string, { score: number; text: string; bm25: number; cosine: number }>();
  for (const list of rankedLists) {
    list.forEach((hit, rank) => {
      const prev = acc.get(hit.id) ?? {
        score: 0,
        text: hit.text,
        bm25: 0,
        cosine: 0,
      };
      prev.score += 1 / (kRrf + rank + 1);
      prev.bm25 = Math.max(prev.bm25, hit.bm25 ?? 0);
      prev.cosine = Math.max(prev.cosine, hit.cosine ?? 0);
      prev.text = hit.text || prev.text;
      acc.set(hit.id, prev);
    });
  }
  return acc;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

// ——— BM25 (documento único) ———

export type Bm25Doc = {
  id: string;
  text: string;
  weight: number;
  tf: Map<string, number>;
  length: number;
};

export type Bm25Index = {
  docs: Bm25Doc[];
  df: Map<string, number>;
  avgdl: number;
  n: number;
};

export function buildBm25Index(items: { id: string; text: string; weight?: number }[]): Bm25Index {
  const docs: Bm25Doc[] = [];
  const df = new Map<string, number>();
  let totalLen = 0;
  for (const it of items) {
    const tokens = tokenize(it.text);
    const tf = termFreq(tokens);
    const length = tokens.length || 1;
    totalLen += length;
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    docs.push({
      id: it.id,
      text: it.text,
      weight: it.weight ?? 1,
      tf,
      length,
    });
  }
  const n = docs.length || 1;
  return { docs, df, avgdl: totalLen / n, n: docs.length };
}

function idf(term: string, n: number, df: Map<string, number>): number {
  const d = df.get(term) ?? 0;
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}

export function bm25Score(
  queryTokens: string[],
  doc: Bm25Doc,
  index: Bm25Index,
  k1 = BM25_K1,
  b = BM25_B,
): number {
  if (!queryTokens.length || !doc.length) return 0;
  let score = 0;
  const seen = new Set<string>();
  for (const t of queryTokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    const f = doc.tf.get(t) ?? 0;
    if (f === 0) continue;
    const idfT = idf(t, index.n, index.df);
    const denom = f + k1 * (1 - b + b * (doc.length / (index.avgdl || 1)));
    score += idfT * ((f * (k1 + 1)) / denom);
  }
  return score * (0.5 + 0.5 * Math.min(1.5, doc.weight));
}

// ——— BM25F (multi-campo) ———

export type Bm25FFieldStats = {
  name: string;
  boost: number;
  tf: Map<string, number>;
  length: number;
};

export type Bm25FDoc = {
  id: string;
  text: string;
  weight: number;
  fields: Bm25FFieldStats[];
  /** comprimento virtual = sum(boost * fieldLen) */
  virtualLength: number;
};

export type Bm25FIndex = {
  docs: Bm25FDoc[];
  /** df global (doc conta se o termo aparece em qualquer campo) */
  df: Map<string, number>;
  avgVirtualLength: number;
  n: number;
  fieldBoosts: Record<string, number>;
};

export type Bm25FItem = {
  id: string;
  text: string;
  weight?: number;
  /** se omitido, todo o text vai para body */
  fields?: Partial<Record<string, string>>;
};

/**
 * Índice BM25F: TF por campo, IDF document-level, comprimento virtual ponderado.
 */
export function buildBm25FIndex(
  items: Bm25FItem[],
  fieldBoosts: Record<string, number> = BM25F_FIELD_WEIGHTS,
): Bm25FIndex {
  const docs: Bm25FDoc[] = [];
  const df = new Map<string, number>();
  let totalVirtual = 0;

  for (const it of items) {
    const rawFields =
      it.fields && Object.keys(it.fields).length > 0 ? it.fields : { body: it.text };

    const fields: Bm25FFieldStats[] = [];
    let virtualLength = 0;
    const termsInDoc = new Set<string>();

    for (const [name, content] of Object.entries(rawFields)) {
      if (!content?.trim()) continue;
      const boost = fieldBoosts[name] ?? 1;
      const tokens = tokenize(content);
      const tf = termFreq(tokens);
      const length = tokens.length || 1;
      virtualLength += boost * length;
      for (const term of tf.keys()) termsInDoc.add(term);
      fields.push({ name, boost, tf, length });
    }

    if (!fields.length) {
      const tokens = tokenize(it.text);
      const tf = termFreq(tokens);
      const length = tokens.length || 1;
      virtualLength = length;
      for (const term of tf.keys()) termsInDoc.add(term);
      fields.push({ name: "body", boost: 1, tf, length });
    }

    for (const term of termsInDoc) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }

    totalVirtual += virtualLength || 1;
    docs.push({
      id: it.id,
      text: it.text,
      weight: it.weight ?? 1,
      fields,
      virtualLength: virtualLength || 1,
    });
  }

  const n = docs.length || 1;
  return {
    docs,
    df,
    avgVirtualLength: totalVirtual / n,
    n: docs.length,
    fieldBoosts,
  };
}

/**
 * Frequência ponderada do termo no doc:
 * tf_w = sum_field (boost_f * tf_{f,t})
 */
function weightedTf(doc: Bm25FDoc, term: string): number {
  let w = 0;
  for (const f of doc.fields) {
    const c = f.tf.get(term) ?? 0;
    if (c) w += f.boost * c;
  }
  return w;
}

export function bm25FScore(
  queryTokens: string[],
  doc: Bm25FDoc,
  index: Bm25FIndex,
  k1 = BM25_K1,
  b = BM25_B,
): number {
  if (!queryTokens.length) return 0;
  let score = 0;
  const seen = new Set<string>();
  const avg = index.avgVirtualLength || 1;

  for (const t of queryTokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    const f = weightedTf(doc, t);
    if (f === 0) continue;
    const idfT = idf(t, index.n, index.df);
    const denom = f + k1 * (1 - b + b * (doc.virtualLength / avg));
    score += idfT * ((f * (k1 + 1)) / denom);
  }
  return score * (0.5 + 0.5 * Math.min(1.5, doc.weight));
}

export type RankedHit = {
  id: string;
  text: string;
  score: number;
  bm25: number;
  cosine?: number;
  semantic?: number;
};

export function topKBm25(
  query: string,
  items: { id: string; text: string; weight?: number }[],
  k: number,
): RankedHit[] {
  if (!items.length || !query.trim()) return [];
  const index = buildBm25Index(items);
  const qTokens = tokenize(query);
  return index.docs
    .map((doc) => {
      const raw = bm25Score(qTokens, doc, index);
      return { id: doc.id, text: doc.text, score: raw, bm25: raw };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Top-K BM25F puro. */
export function topKBm25F(
  query: string,
  items: Bm25FItem[],
  k: number,
  fieldBoosts?: Record<string, number>,
): RankedHit[] {
  if (!items.length || !query.trim()) return [];
  const index = buildBm25FIndex(items, fieldBoosts ?? BM25F_FIELD_WEIGHTS);
  const qTokens = tokenize(query);
  return index.docs
    .map((doc) => {
      const raw = bm25FScore(qTokens, doc, index);
      return { id: doc.id, text: doc.text, score: raw, bm25: raw };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Hybrid BM25F + embeddings lexicais (unigram+bigram) via Reciprocal Rank Fusion.
 *
 * - BM25F manda no ranking lexical por campos (title/correction/body).
 * - O cosseno só entra em docs com bm25 > 0 (evita ruído do hash 64-D).
 * - RRF funde as duas listas sem calibrar escalas (melhor que alpha fixo).
 * - `alpha` mantém-se na assinatura por compat: se != 0.75, cai no blend linear.
 */
export function topKHybrid(
  query: string,
  items: {
    id: string;
    text: string;
    vector: number[];
    weight: number;
    fields?: Partial<Record<string, string>>;
    /** embedding semântico opcional (API) */
    semanticVector?: number[];
  }[],
  k: number,
  alpha = 0.75,
  fieldBoosts?: Record<string, number>,
  /** vetor semântico da query (mesmo espaço que semanticVector dos docs) */
  querySemantic?: number[] | null,
): RankedHit[] {
  if (!items.length || !query.trim()) return [];
  const index = buildBm25FIndex(items, fieldBoosts ?? BM25F_FIELD_WEIGHTS);
  const qTokens = tokenize(query);
  const qVec = embedText(query);
  const byId = new Map(items.map((i) => [i.id, i]));

  const scored = index.docs.map((doc) => {
    const item = byId.get(doc.id);
    const bm = bm25FScore(qTokens, doc, index);
    const cos = item ? cosine(qVec, item.vector) * (0.5 + 0.5 * Math.min(1, item.weight)) : 0;
    let sem = 0;
    if (querySemantic?.length && item?.semanticVector?.length) {
      sem = cosine(querySemantic, item.semanticVector) * (0.5 + 0.5 * Math.min(1, item.weight));
    }
    return { id: doc.id, text: doc.text, bm25: bm, cosine: cos, semantic: sem };
  });

  // Gate: precisa de sinal lexical OU semântico forte
  const comSinal = scored.filter((s) => s.bm25 > 0 || s.semantic > 0.35);
  if (!comSinal.length) return [];

  // Compat blend linear
  if (alpha !== 0.75) {
    const maxBm = Math.max(...comSinal.map((s) => s.bm25), 1e-9);
    const maxCos = Math.max(...comSinal.map((s) => s.cosine ?? 0), 1e-9);
    const maxSem = Math.max(...comSinal.map((s) => s.semantic ?? 0), 1e-9);
    return comSinal
      .map((s) => {
        const bmN = s.bm25 / maxBm;
        const cosN = (s.cosine ?? 0) / maxCos;
        const semN = (s.semantic ?? 0) / maxSem;
        const score = alpha * bmN + (1 - alpha) * 0.5 * cosN + (1 - alpha) * 0.5 * semN;
        return {
          id: s.id,
          text: s.text,
          score,
          bm25: s.bm25,
          cosine: s.cosine,
          semantic: s.semantic,
        };
      })
      .filter((x) => x.score > 0.02)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  const byBm = [...comSinal].filter((s) => s.bm25 > 0).sort((a, b) => b.bm25 - a.bm25);
  const byCos = [...comSinal].sort((a, b) => (b.cosine ?? 0) - (a.cosine ?? 0));
  const lists = [byBm, byCos];
  if (querySemantic?.length) {
    const bySem = [...comSinal]
      .filter((s) => (s.semantic ?? 0) > 0.2)
      .sort((a, b) => (b.semantic ?? 0) - (a.semantic ?? 0));
    if (bySem.length) lists.push(bySem);
  }

  const fused = reciprocalRankFusion(lists, 60);

  return [...fused.entries()]
    .map(([id, v]) => {
      const raw = scored.find((s) => s.id === id);
      return {
        id,
        text: v.text,
        score: v.score,
        bm25: raw?.bm25 ?? v.bm25,
        cosine: raw?.cosine ?? v.cosine,
        semantic: raw?.semantic,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function topKSimilar(
  query: number[],
  items: { id: string; vector: number[]; text: string; weight: number }[],
  k: number,
): { id: string; text: string; score: number }[] {
  return items
    .map((it) => ({
      id: it.id,
      text: it.text,
      score: cosine(query, it.vector) * (0.5 + 0.5 * Math.min(1, it.weight)),
    }))
    .filter((x) => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
