/**
 * Projeção de embeddings de alta dimensão para 3D (PCA leve).
 * Usado só para visualização do cofre mímico — não altera o ranking RAG.
 */

export type Vec3 = { x: number; y: number; z: number };

export type ProjectablePoint = {
  id: string;
  label: string;
  kind: string;
  /** vetor lexical e/ou semântico */
  vector: number[];
};

function dimOf(vectors: number[][]): number {
  return Math.max(0, ...vectors.map((v) => v.length));
}

function pad(v: number[], dim: number): number[] {
  if (v.length === dim) return v;
  const out = v.slice();
  while (out.length < dim) out.push(0);
  return out.slice(0, dim);
}

function meanVec(rows: number[][], dim: number): number[] {
  const m = new Array(dim).fill(0);
  if (!rows.length) return m;
  for (const r of rows) {
    for (let i = 0; i < dim; i++) m[i]! += r[i] ?? 0;
  }
  for (let i = 0; i < dim; i++) m[i]! /= rows.length;
  return m;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a)) || 1e-12;
}

function scale(a: number[], s: number): number[] {
  return a.map((x) => x * s);
}

function sub(a: number[], b: number[]): number[] {
  return a.map((x, i) => x - (b[i] ?? 0));
}

/** Power iteration para o maior autovetor de A^T A sobre dados centrados. */
function powerPrincipal(centered: number[][], dim: number, exclude?: number[]): number[] {
  let v = new Array(dim).fill(0).map((_, i) => Math.sin(i * 12.9898) * 0.5 + 0.5);
  // A ortogonalização contra `exclude` é feita a cada iteração, abaixo.
  // init random-ish but deterministic
  v = v.map((x, i) => x + ((i * 17) % 7) * 0.01);
  v = scale(v, 1 / norm(v));

  for (let iter = 0; iter < 24; iter++) {
    const acc = new Array(dim).fill(0);
    for (const row of centered) {
      const c = dot(row, v);
      for (let i = 0; i < dim; i++) acc[i]! += (row[i] ?? 0) * c;
    }
    if (exclude?.length) {
      const proj = dot(acc, exclude);
      for (let i = 0; i < dim; i++) acc[i]! -= (exclude[i] ?? 0) * proj;
    }
    const n = norm(acc);
    v = scale(acc, 1 / n);
  }
  return v;
}

/**
 * PCA top-3. Com < 2 pontos, espalha numa linha/plano fixo.
 */
export function projectTo3D(points: ProjectablePoint[]): {
  positions: (ProjectablePoint & Vec3)[];
  /** escala usada para caber numa caixa ~[-1,1] */
  extent: number;
} {
  if (!points.length) return { positions: [], extent: 1 };

  const dim = dimOf(points.map((p) => p.vector));
  if (dim === 0) {
    return {
      positions: points.map((p, i) => ({
        ...p,
        x: Math.cos((i / points.length) * Math.PI * 2) * 0.8,
        y: 0,
        z: Math.sin((i / points.length) * Math.PI * 2) * 0.8,
      })),
      extent: 1,
    };
  }

  const rows = points.map((p) => pad(p.vector, dim));
  const mu = meanVec(rows, dim);
  const centered = rows.map((r) => sub(r, mu));

  const e1 = powerPrincipal(centered, dim);
  const e2 = powerPrincipal(centered, dim, e1);
  // terceiro eixo ortogonal a e1 e e2
  let e3 = powerPrincipal(centered, dim, e1);
  {
    const p2 = dot(e3, e2);
    e3 = sub(e3, scale(e2, p2));
    e3 = scale(e3, 1 / norm(e3));
  }

  const raw = centered.map((r) => ({
    x: dot(r, e1),
    y: dot(r, e2),
    z: dot(r, e3),
  }));

  let maxAbs = 1e-6;
  for (const p of raw) {
    maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
  }
  const scaleN = 1 / maxAbs;

  const positions = points.map((p, i) => ({
    ...p,
    x: raw[i]!.x * scaleN,
    y: raw[i]!.y * scaleN,
    z: raw[i]!.z * scaleN,
  }));

  return { positions, extent: 1 };
}

/** Preferir semanticVector se existir; senão vector lexical. */
export function vectorForTrace(tr: {
  text: string;
  vector: number[];
  semanticVector?: number[];
  kind: string;
  id: string;
  fields?: { title?: string };
}): ProjectablePoint {
  return {
    id: tr.id,
    label: (tr.fields?.title || tr.text).slice(0, 48),
    kind: tr.kind,
    vector: tr.semanticVector?.length ? tr.semanticVector : tr.vector,
  };
}
