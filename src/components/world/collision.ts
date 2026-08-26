/**
 * Colisão 2D (XZ) para o Presença.
 * Modos: oliveira (demo), simple-room (medidas), scan (GLB bounds + blocos), open.
 *
 * Scan: AABB externo insetado (paredes) + blocos de móveis extraídos do collider/GLB.
 * Opcional: grelha de ocupação para contornos irregulares sem raycast por frame.
 */
import type { RoomMetrics } from "@/lib/room-metrics";
import { metricsToWalkables } from "@/lib/room-metrics";
import { clearNavMesh, setNavMeshFromScan, setNavMeshFromWalkRects } from "./navmesh";

export type Rect = { x0: number; x1: number; z0: number; z1: number };

export type ScanCollisionInput = {
  /** Bounding box do mesh no chão (mundo) */
  bounds: Rect;
  /** Obstáculos (móveis, pilares) */
  blocks?: Rect[];
  /** Recuo das paredes para área andável (metros) */
  wallInset?: number;
  /** Raio do jogador (metros) */
  agentRadius?: number;
  /**
   * Grelha opcional: true = célula andável.
   * originXZ + cellSize definem o mapa; null = só AABB+blocos.
   */
  grid?: {
    originX: number;
    originZ: number;
    cellSize: number;
    cols: number;
    rows: number;
    walkable: Uint8Array;
  };
};

const OLIVEIRA_WALK: Rect[] = [
  { x0: -5.9, x1: 5.4, z0: -6.7, z1: 3.35 },
  { x0: 5.1, x1: 11.2, z0: -2.8, z1: 3.3 },
  { x0: -11.2, x1: -5.6, z0: -2.8, z1: 3.3 },
  { x0: -1.05, x1: 1.05, z0: 3.15, z1: 3.85 },
  { x0: -4.0, x1: 4.0, z0: 3.5, z1: 6.7 },
  { x0: -12.0, x1: 12.0, z0: 6.3, z1: 17.8 },
];

const OLIVEIRA_BLOCKS: Rect[] = [
  { x0: -2.6, x1: 2.6, z0: -3.4, z1: -1.5 },
  { x0: 7.0, x1: 10.8, z0: -2.5, z1: -1.35 },
  { x0: -10.6, x1: -7.4, z0: -2.3, z1: -0.9 },
  { x0: 1.4, x1: 3.2, z0: 10.4, z1: 12.2 },
];

function inside(r: Rect, x: number, z: number) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Expande rect pelo raio do agente (colisão “gorda”). */
function inflate(r: Rect, radius: number): Rect {
  return {
    x0: r.x0 - radius,
    x1: r.x1 + radius,
    z0: r.z0 - radius,
    z1: r.z1 + radius,
  };
}

export type CollisionMode = "oliveira" | "simple-room" | "scan" | "open";

let mode: CollisionMode = "oliveira";
let agentRadius = 0.28;
let simpleWalk: Rect[] = [];
let simpleBlocks: Rect[] = [];
let scanFloor: Rect | null = null;
let scanBlocks: Rect[] = [];
let scanGrid: ScanCollisionInput["grid"] | null = null;
/** Oclusores extra do collider GLB (paredes fiéis). */
let extraOccluders: Rect[] = [];

export function setCollisionMode(
  m: CollisionMode,
  metrics?: RoomMetrics,
  scan?: ScanCollisionInput,
) {
  mode = m;
  simpleWalk = [];
  simpleBlocks = [];
  scanFloor = null;
  scanBlocks = [];
  scanGrid = null;
  if (m !== "scan") extraOccluders = [];
  agentRadius = scan?.agentRadius ?? 0.28;

  if (m === "simple-room" && metrics) {
    const w = metricsToWalkables(metrics);
    simpleWalk = [w.floor, w.doorStrip, w.yard];
    simpleBlocks = [];
  }

  if (m === "scan" && scan) {
    const inset = scan.wallInset ?? 0.35;
    const b = scan.bounds;
    scanFloor = {
      x0: b.x0 + inset,
      x1: b.x1 - inset,
      z0: b.z0 + inset,
      z1: b.z1 - inset,
    };
    // Se o inset inverteu o rect (scan muito estreito), usa bounds cru
    if (scanFloor.x0 >= scanFloor.x1 || scanFloor.z0 >= scanFloor.z1) {
      scanFloor = { ...b };
    }
    scanBlocks = (scan.blocks ?? []).map((r) => inflate(r, agentRadius));
    scanGrid = scan.grid ?? null;
    setNavMeshFromScan(scan);
  }

  if (m === "simple-room" && simpleWalk.length) {
    setNavMeshFromWalkRects(simpleWalk);
  }
  if (m === "oliveira") {
    setNavMeshFromWalkRects(OLIVEIRA_WALK);
  }
  if (m === "open") {
    clearNavMesh();
  }
}

/** Atualiza só a parte scan (quando o GLB termina de carregar). */
export function setScanCollision(scan: ScanCollisionInput) {
  setCollisionMode("scan", undefined, scan);
}

function gridWalkable(x: number, z: number): boolean | null {
  if (!scanGrid) return null;
  const { originX, originZ, cellSize, cols, rows, walkable } = scanGrid;
  const col = Math.floor((x - originX) / cellSize);
  const row = Math.floor((z - originZ) / cellSize);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  return walkable[row * cols + col] === 1;
}

export function isWalkable(x: number, z: number) {
  if (mode === "open") return Math.hypot(x, z) < 40;

  if (mode === "scan") {
    const g = gridWalkable(x, z);
    if (g !== null) {
      if (!g) return false;
      // grelha já inclui obstáculos; ainda respeita blocos inflados se houver
      if (scanBlocks.some((r) => inside(r, x, z))) return false;
      return true;
    }
    if (!scanFloor || !inside(scanFloor, x, z)) return false;
    if (scanBlocks.some((r) => inside(r, x, z))) return false;
    return true;
  }

  if (mode === "simple-room") {
    if (!simpleWalk.some((r) => inside(r, x, z))) return false;
    if (simpleBlocks.some((r) => inside(r, x, z))) return false;
    return true;
  }

  if (!OLIVEIRA_WALK.some((r) => inside(r, x, z))) return false;
  if (OLIVEIRA_BLOCKS.some((r) => inside(r, x, z))) return false;
  return true;
}

export function slideMove(x: number, z: number, nx: number, nz: number) {
  if (isWalkable(nx, nz)) return { x: nx, z: nz };
  if (isWalkable(nx, z)) return { x: nx, z };
  if (isWalkable(x, nz)) return { x, z: nz };
  return { x, z };
}

/** Utilitário: une vários rects filhos num único bounds. */
export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x0);
    x1 = Math.max(x1, r.x1);
    z0 = Math.min(z0, r.z0);
    z1 = Math.max(z1, r.z1);
  }
  return { x0, x1, z0, z1 };
}

/**
 * Rects sólidos para occlusion (móveis + paredes grossas sintéticas).
 * Usado por line-of-sight 2D; não substitui colisão do jogador.
 */
export function setScanOccluders(rects: Rect[]) {
  extraOccluders = rects.slice(0, 96);
  if (typeof window !== "undefined") {
    (window as unknown as { __scanOccluders?: number }).__scanOccluders = extraOccluders.length;
  }
}

export function clearScanOccluders() {
  extraOccluders = [];
}

export function getOccluderRects(): Rect[] {
  const wallT = 0.22;
  if (mode === "scan") {
    const list = [...scanBlocks, ...extraOccluders];
    if (scanFloor) {
      const b = scanFloor;
      // paredes exteriores como lajes finas
      list.push(
        { x0: b.x0 - wallT, x1: b.x0 + wallT * 0.5, z0: b.z0, z1: b.z1 },
        { x0: b.x1 - wallT * 0.5, x1: b.x1 + wallT, z0: b.z0, z1: b.z1 },
        { x0: b.x0, x1: b.x1, z0: b.z0 - wallT, z1: b.z0 + wallT * 0.5 },
        { x0: b.x0, x1: b.x1, z0: b.z1 - wallT * 0.5, z1: b.z1 + wallT },
      );
    }
    return list;
  }
  if (mode === "simple-room") {
    const list = [...simpleBlocks];
    if (simpleWalk[0]) {
      const b = simpleWalk[0];
      list.push(
        { x0: b.x0 - wallT, x1: b.x0, z0: b.z0, z1: b.z1 },
        { x0: b.x1, x1: b.x1 + wallT, z0: b.z0, z1: b.z1 },
        { x0: b.x0, x1: b.x1, z0: b.z0 - wallT, z1: b.z0 },
        // frente: deixar vão da porta (centro ~0)
        { x0: b.x0, x1: -0.55, z0: b.z1, z1: b.z1 + wallT },
        { x0: 0.55, x1: b.x1, z0: b.z1, z1: b.z1 + wallT },
      );
    }
    return list;
  }
  if (mode === "open") return [];
  // oliveira: blocos + paredes entre salas (aprox.)
  return [
    ...OLIVEIRA_BLOCKS,
    // parede sala / jardim (excepto vão central)
    { x0: -5.5, x1: -1.2, z0: 3.2, z1: 3.55 },
    { x0: 1.2, x1: 5.2, z0: 3.2, z1: 3.55 },
    // cozinha
    { x0: -5.95, x1: -5.55, z0: -2.8, z1: 3.2 },
    // estudo
    { x0: 5.15, x1: 5.55, z0: -2.8, z1: 3.2 },
  ];
}
