/**
 * Extrai colisão 2D a partir de um Object3D (GLB de fotogrametria).
 * - Bounds no plano XZ
 * - Blocos = AABBs de meshes “grandes o suficiente” (móveis)
 * - Grelha opcional por amostragem de altura de vértices (contorno irregular)
 */
import * as THREE from "three";
import type { Rect, ScanCollisionInput } from "./collision";

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _v = new THREE.Vector3();

export type ExtractOptions = {
  /** Altura mínima de um mesh para virar bloco (móvel), metros */
  minBlockHeight?: number;
  /** Área mínima no chão (m²) para considerar obstáculo */
  minBlockArea?: number;
  /** Ignorar meshes quase do tamanho do bounds (paredes/chão) */
  maxBlockFractionOfFloor?: number;
  wallInset?: number;
  agentRadius?: number;
  /** Gerar grelha (melhor contorno, ~1–2 ms em scans médios) */
  buildGrid?: boolean;
  cellSize?: number;
  /** Incluir paredes altas/estreitas como oclusores (collider GLB) */
  includeWallOccluders?: boolean;
};

const DEFAULTS: Required<ExtractOptions> = {
  minBlockHeight: 0.35,
  minBlockArea: 0.15,
  maxBlockFractionOfFloor: 0.45,
  wallInset: 0.35,
  agentRadius: 0.28,
  buildGrid: true,
  cellSize: 0.35,
  includeWallOccluders: false,
};

export function extractScanCollision(
  root: THREE.Object3D,
  opts: ExtractOptions = {},
): ScanCollisionInput {
  const o = { ...DEFAULTS, ...opts };
  root.updateMatrixWorld(true);

  _box.setFromObject(root);
  const bounds: Rect = {
    x0: _box.min.x,
    x1: _box.max.x,
    z0: _box.min.z,
    z1: _box.max.z,
  };

  const floorArea = Math.max(0.01, (bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0));
  const blocks: Rect[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    // Box no espaço de mundo
    mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    const wb = mesh.geometry.boundingBox.clone();
    wb.applyMatrix4(mesh.matrixWorld);

    wb.getSize(_size);
    wb.getCenter(_center);

    const height = _size.y;
    const area = _size.x * _size.z;
    if (height < o.minBlockHeight) return; // chão / tapete
    if (area < o.minBlockArea) return;
    if (area > floorArea * o.maxBlockFractionOfFloor) return; // parede / volume inteiro

    // Só bloqueia se o volume começa perto do chão (não lustre)
    const floorY = _box.min.y;
    if (wb.min.y > floorY + 1.2) return;

    blocks.push({
      x0: wb.min.x,
      x1: wb.max.x,
      z0: wb.min.z,
      z1: wb.max.z,
    });

    // Limita quantidade de blocos (performance)
    if (blocks.length >= 48) return;
  });

  let grid: ScanCollisionInput["grid"];
  if (o.buildGrid) {
    grid = buildOccupancyGrid(root, bounds, o.cellSize, _box.min.y);
  }

  return {
    bounds,
    blocks,
    wallInset: o.wallInset,
    agentRadius: o.agentRadius,
    grid,
  };
}

/**
 * Grelha: célula andável se houver geometria “de chão” perto do Y mínimo
 * e não houver ocupação sólida na altura do torso do jogador.
 *
 * Aproximação rápida: marca células que intersectam o AABB de algum tri/vertice
 * na faixa de chão; depois remove células sob blocos altos.
 */
function buildOccupancyGrid(
  root: THREE.Object3D,
  bounds: Rect,
  cellSize: number,
  floorY: number,
): NonNullable<ScanCollisionInput["grid"]> {
  const width = bounds.x1 - bounds.x0;
  const depth = bounds.z1 - bounds.z0;
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(depth / cellSize));
  const walkable = new Uint8Array(cols * rows); // 0 = blocked

  // 1) Marca células que têm vértices próximos ao chão (superfície)
  const floorBand = 0.45;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.attributes.position;
    if (!pos) return;
    const maxSamples = Math.min(pos.count, 4000);
    const step = Math.max(1, Math.floor(pos.count / maxSamples));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (_v.y > floorY + floorBand) continue;
      const col = Math.floor((_v.x - bounds.x0) / cellSize);
      const row = Math.floor((_v.z - bounds.z0) / cellSize);
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      walkable[row * cols + col] = 1;
    }
  });

  // 2) Flood-fill a partir do centro (só região conexa — evita “ilhas” fora da casa)
  const cx = Math.floor(cols / 2);
  const cz = Math.floor(rows / 2);
  const filled = new Uint8Array(cols * rows);
  const stack: number[] = [];
  // procura semente andável perto do centro
  let seed = -1;
  for (let r = 0; r < rows && seed < 0; r++) {
    for (let c = 0; c < cols && seed < 0; c++) {
      const i = r * cols + c;
      if (walkable[i]) {
        // prefere perto do centro
        if (
          seed < 0 ||
          Math.hypot(c - cx, r - cz) < Math.hypot((seed % cols) - cx, Math.floor(seed / cols) - cz)
        ) {
          seed = i;
        }
      }
    }
  }
  if (seed >= 0) {
    stack.push(seed);
    while (stack.length) {
      const i = stack.pop()!;
      if (filled[i]) continue;
      if (!walkable[i]) continue;
      filled[i] = 1;
      const c = i % cols;
      const r = Math.floor(i / cols);
      if (c > 0) stack.push(i - 1);
      if (c < cols - 1) stack.push(i + 1);
      if (r > 0) stack.push(i - cols);
      if (r < rows - 1) stack.push(i + cols);
    }
    walkable.set(filled);
  }

  // 3) Erode leve pelo raio do agente (~1 célula)
  const eroded = new Uint8Array(walkable);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (!walkable[i]) continue;
      if (!walkable[i - 1] || !walkable[i + 1] || !walkable[i - cols] || !walkable[i + cols]) {
        eroded[i] = 0;
      }
    }
  }

  return {
    originX: bounds.x0,
    originZ: bounds.z0,
    cellSize,
    cols,
    rows,
    walkable: eroded,
  };
}

/**
 * Extrai oclusores (paredes + móveis) a partir de collider GLB low-poly.
 * Paredes: meshes altos e relativamente estreitos em X ou Z.
 * Móveis: mesmos critérios de extractScanCollision.
 */
export function extractScanOccluders(root: THREE.Object3D, opts: ExtractOptions = {}): Rect[] {
  const o = { ...DEFAULTS, includeWallOccluders: true, ...opts };
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  const floorArea = Math.max(0.01, (_box.max.x - _box.min.x) * (_box.max.z - _box.min.z));
  const floorY = _box.min.y;
  const out: Rect[] = [];
  const seen = new Set<string>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    const wb = mesh.geometry.boundingBox.clone();
    wb.applyMatrix4(mesh.matrixWorld);
    wb.getSize(_size);

    const height = _size.y;
    const area = _size.x * _size.z;
    if (height < 0.25) return;
    if (wb.min.y > floorY + 1.4) return;

    const thinX = _size.x < 0.55 && _size.z > 0.4 && height > 1.2;
    const thinZ = _size.z < 0.55 && _size.x > 0.4 && height > 1.2;
    const furniture =
      height >= o.minBlockHeight &&
      area >= o.minBlockArea &&
      area <= floorArea * o.maxBlockFractionOfFloor;

    if (!thinX && !thinZ && !furniture) {
      // paredes grandes (fracção alta do floor mas altura de parede)
      if (height > 1.5 && area > floorArea * 0.08 && area < floorArea * 0.85) {
        // ok — possível parede/volume
      } else {
        return;
      }
    }

    const rect: Rect = {
      x0: wb.min.x,
      x1: wb.max.x,
      z0: wb.min.z,
      z1: wb.max.z,
    };
    const key = `${rect.x0.toFixed(2)}:${rect.x1.toFixed(2)}:${rect.z0.toFixed(2)}:${rect.z1.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(rect);
    if (out.length >= 96) return;
  });

  return out;
}
