/**
 * NavMesh leve baseado em grelha de ocupação.
 * - Constrói a partir do grid de scan-collision ou rasteriza rects walkable
 * - A* com diagonal opcional
 * - Seguimento de caminho (waypoints em metros)
 *
 * Sem dependência extra (three-pathfinding). Para GLBs enormes, prefira
 * collider low-poly → extractScanCollision → setNavMeshFromScan.
 */

import type { Rect } from "./collision";
import type { ScanCollisionInput } from "./collision";

export type NavPoint = { x: number; z: number };

export type NavMeshData = {
  originX: number;
  originZ: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** 1 = andável */
  walkable: Uint8Array;
};

let active: NavMeshData | null = null;

export function getNavMesh() {
  return active;
}

export function clearNavMesh() {
  active = null;
}

export function setNavMesh(data: NavMeshData | null) {
  active = data;
}

/** A partir do resultado de extractScanCollision / setScanCollision. */
export function setNavMeshFromScan(scan: ScanCollisionInput) {
  if (scan.grid) {
    active = {
      originX: scan.grid.originX,
      originZ: scan.grid.originZ,
      cellSize: scan.grid.cellSize,
      cols: scan.grid.cols,
      rows: scan.grid.rows,
      walkable: scan.grid.walkable,
    };
    return;
  }
  // Fallback: rasteriza o floor AABB
  active = rasterizeRects([scan.bounds], scan.wallInset ?? 0.35, 0.35);
}

/** Rasteriza retângulos andáveis (simple-room / oliveira). */
export function setNavMeshFromWalkRects(walk: Rect[], cellSize = 0.4) {
  active = rasterizeRects(walk, 0, cellSize);
}

function rasterizeRects(rects: Rect[], inset: number, cellSize: number): NavMeshData | null {
  if (!rects.length) return null;
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x0 + inset);
    x1 = Math.max(x1, r.x1 - inset);
    z0 = Math.min(z0, r.z0 + inset);
    z1 = Math.max(z1, r.z1 - inset);
  }
  if (x0 >= x1 || z0 >= z1) return null;
  const cols = Math.max(1, Math.ceil((x1 - x0) / cellSize));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cellSize));
  const walkable = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = x0 + (col + 0.5) * cellSize;
      const cz = z0 + (row + 0.5) * cellSize;
      const ok = rects.some(
        (r) =>
          cx >= r.x0 + inset &&
          cx <= r.x1 - inset &&
          cz >= r.z0 + inset &&
          cz <= r.z1 - inset,
      );
      if (ok) walkable[row * cols + col] = 1;
    }
  }
  return { originX: x0, originZ: z0, cellSize, cols, rows, walkable };
}

function worldToCell(mesh: NavMeshData, x: number, z: number) {
  const col = Math.floor((x - mesh.originX) / mesh.cellSize);
  const row = Math.floor((z - mesh.originZ) / mesh.cellSize);
  return { col, row };
}

function cellToWorld(mesh: NavMeshData, col: number, row: number): NavPoint {
  return {
    x: mesh.originX + (col + 0.5) * mesh.cellSize,
    z: mesh.originZ + (row + 0.5) * mesh.cellSize,
  };
}

function idx(mesh: NavMeshData, col: number, row: number) {
  return row * mesh.cols + col;
}

function inBounds(mesh: NavMeshData, col: number, row: number) {
  return col >= 0 && row >= 0 && col < mesh.cols && row < mesh.rows;
}

function isWalk(mesh: NavMeshData, col: number, row: number) {
  return inBounds(mesh, col, row) && mesh.walkable[idx(mesh, col, row)] === 1;
}

/** Célula andável mais próxima (spiral) — para cliques perto da parede. */
export function snapToNavMesh(x: number, z: number, maxRadiusCells = 12): NavPoint | null {
  const mesh = active;
  if (!mesh) return null;
  const { col, row } = worldToCell(mesh, x, z);
  if (isWalk(mesh, col, row)) return cellToWorld(mesh, col, row);
  for (let r = 1; r <= maxRadiusCells; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (isWalk(mesh, col + dx, row + dy)) {
          return cellToWorld(mesh, col + dx, row + dy);
        }
      }
    }
  }
  return null;
}

/**
 * A* 8-conectado. Retorna waypoints em coordenadas de mundo (centros de célula),
 * já com suavização string-pull simples.
 */
export function findPath(fromX: number, fromZ: number, toX: number, toZ: number): NavPoint[] {
  const mesh = active;
  if (!mesh) return [];

  const startSnap = snapToNavMesh(fromX, fromZ);
  const endSnap = snapToNavMesh(toX, toZ);
  if (!startSnap || !endSnap) return [];

  const start = worldToCell(mesh, startSnap.x, startSnap.z);
  const goal = worldToCell(mesh, endSnap.x, endSnap.z);
  if (!isWalk(mesh, start.col, start.row) || !isWalk(mesh, goal.col, goal.row)) return [];

  const startI = idx(mesh, start.col, start.row);
  const goalI = idx(mesh, goal.col, goal.row);
  if (startI === goalI) return [endSnap];

  const N = mesh.cols * mesh.rows;
  const came = new Int32Array(N).fill(-1);
  const gScore = new Float32Array(N).fill(Infinity);
  const fScore = new Float32Array(N).fill(Infinity);
  const closed = new Uint8Array(N);

  gScore[startI] = 0;
  fScore[startI] = heuristic(start.col, start.row, goal.col, goal.row);

  // binary-heap leve via array + sort ocasional (grids de casa são pequenos)
  const open: number[] = [startI];

  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ] as const;

  let iterations = 0;
  const maxIter = N * 2;

  while (open.length && iterations++ < maxIter) {
    // menor fScore
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[best]]) best = i;
    }
    const current = open[best];
    open[best] = open[open.length - 1];
    open.pop();

    if (current === goalI) {
      const cells = reconstruct(came, current, mesh);
      const world = cells.map((c) => cellToWorld(mesh, c.col, c.row));
      world[world.length - 1] = endSnap; // destino exato
      return stringPull(world, mesh);
    }

    if (closed[current]) continue;
    closed[current] = 1;

    const cc = current % mesh.cols;
    const cr = Math.floor(current / mesh.cols);

    for (const [dx, dy, cost] of neighbors) {
      const nc = cc + dx;
      const nr = cr + dy;
      if (!isWalk(mesh, nc, nr)) continue;
      // evita corte de canto
      if (dx !== 0 && dy !== 0) {
        if (!isWalk(mesh, cc + dx, cr) || !isWalk(mesh, cc, cr + dy)) continue;
      }
      const ni = idx(mesh, nc, nr);
      if (closed[ni]) continue;
      const tent = gScore[current] + cost;
      if (tent < gScore[ni]) {
        came[ni] = current;
        gScore[ni] = tent;
        fScore[ni] = tent + heuristic(nc, nr, goal.col, goal.row);
        open.push(ni);
      }
    }
  }

  return [];
}

function heuristic(c0: number, r0: number, c1: number, r1: number) {
  const dx = Math.abs(c0 - c1);
  const dy = Math.abs(r0 - r1);
  return dx + dy + (1.414 - 2) * Math.min(dx, dy);
}

function reconstruct(came: Int32Array, current: number, mesh: NavMeshData) {
  const out: { col: number; row: number }[] = [];
  let c = current;
  while (c >= 0) {
    out.push({ col: c % mesh.cols, row: Math.floor(c / mesh.cols) });
    c = came[c];
  }
  out.reverse();
  return out;
}

/** String-pull: remove waypoints colineares se o segmento está livre. */
function stringPull(path: NavPoint[], mesh: NavMeshData): NavPoint[] {
  if (path.length <= 2) return path;
  const out: NavPoint[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let furthest = i + 1;
    for (let j = path.length - 1; j > i + 1; j--) {
      if (lineWalkable(mesh, path[i], path[j])) {
        furthest = j;
        break;
      }
    }
    out.push(path[furthest]);
    i = furthest;
  }
  return out;
}

function lineWalkable(mesh: NavMeshData, a: NavPoint, b: NavPoint) {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(dist / (mesh.cellSize * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const { col, row } = worldToCell(mesh, x, z);
    if (!isWalk(mesh, col, row)) return false;
  }
  return true;
}

/** Estado de seguimento de caminho (mutável, lido no useFrame). */
export const navAgent = {
  path: [] as NavPoint[],
  index: 0,
  active: false,
  /** Cancela se o jogador usar WASD/joystick */
  cancelOnInput: true,
};

export function setNavDestination(fromX: number, fromZ: number, toX: number, toZ: number) {
  const path = findPath(fromX, fromZ, toX, toZ);
  navAgent.path = path;
  navAgent.index = 0;
  navAgent.active = path.length > 0;
  notifyPathListeners();
  return path;
}

export function clearNavDestination() {
  navAgent.path = [];
  navAgent.index = 0;
  navAgent.active = false;
  notifyPathListeners();
}

type PathListener = (path: NavPoint[]) => void;
const pathListeners = new Set<PathListener>();

export function onPlayerPathChange(fn: PathListener) {
  pathListeners.add(fn);
  return () => {
    pathListeners.delete(fn);
  };
}

function notifyPathListeners() {
  for (const fn of pathListeners) fn(navAgent.path);
}

/** Agentes NPC (personas) — cada um com o próprio path. */
export type NpcAgent = {
  path: NavPoint[];
  index: number;
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  homeX: number;
  homeZ: number;
};

export const npcAgents = new Map<string, NpcAgent>();

export function ensureNpcAgent(id: string, homeX: number, homeZ: number): NpcAgent {
  let a = npcAgents.get(id);
  if (!a) {
    a = { path: [], index: 0, active: false, x: homeX, z: homeZ, yaw: 0, homeX, homeZ };
    npcAgents.set(id, a);
  }
  return a;
}

export function setNpcDestination(id: string, toX: number, toZ: number) {
  const a = npcAgents.get(id);
  if (!a) return [];
  const path = findPath(a.x, a.z, toX, toZ);
  a.path = path;
  a.index = 0;
  a.active = path.length > 0;
  return path;
}

export function stepNpcAgent(
  id: string,
  speed: number,
  dt: number,
  arriveDist = 0.35,
): { x: number; z: number; yaw: number; moving: boolean } | null {
  const a = npcAgents.get(id);
  if (!a) return null;
  if (!a.active || !a.path.length) {
    return { x: a.x, z: a.z, yaw: a.yaw, moving: false };
  }
  const target = a.path[Math.min(a.index, a.path.length - 1)];
  const dx = target.x - a.x;
  const dz = target.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < arriveDist) {
    if (a.index >= a.path.length - 1) {
      a.active = false;
      a.path = [];
      a.index = 0;
      return { x: a.x, z: a.z, yaw: a.yaw, moving: false };
    }
    a.index++;
    return stepNpcAgent(id, speed, dt, arriveDist);
  }
  const step = Math.min(speed * dt, dist);
  a.x += (dx / dist) * step;
  a.z += (dz / dist) * step;
  a.yaw = Math.atan2(-dx, -dz);
  return { x: a.x, z: a.z, yaw: a.yaw, moving: true };
}


/**
 * Avança ao longo do path. Retorna vetor de movimento desejado (não normalizado)
 * em XZ, ou null se chegou / inativo.
 */
export function stepNavAgent(
  x: number,
  z: number,
  speed: number,
  dt: number,
  arriveDist = 0.28,
): { dx: number; dz: number; done: boolean } | null {
  if (!navAgent.active || !navAgent.path.length) return null;
  const target = navAgent.path[Math.min(navAgent.index, navAgent.path.length - 1)];
  const dx = target.x - x;
  const dz = target.z - z;
  const dist = Math.hypot(dx, dz);
  if (dist < arriveDist) {
    if (navAgent.index >= navAgent.path.length - 1) {
      clearNavDestination();
      return { dx: 0, dz: 0, done: true };
    }
    navAgent.index++;
    return stepNavAgent(x, z, speed, dt, arriveDist);
  }
  const step = Math.min(speed * dt, dist);
  return {
    dx: (dx / dist) * step,
    dz: (dz / dist) * step,
    done: false,
  };
}
