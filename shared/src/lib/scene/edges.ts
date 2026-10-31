import type {
  DoorState,
  GridConfig,
  Terrain,
  TokenState,
  WallKind,
  WallPoint,
  WallSegment,
} from '../../schemas/scene.js';
import type { CellPoint } from './grid.js';

export interface GridEdge {
  x: number;
  y: number;
  dir: 'h' | 'v';
  kind: WallKind;
  door?: DoorState;
}

export const edgeKey = (edge: Pick<GridEdge, 'x' | 'y' | 'dir'>): string =>
  `${edge.dir}:${edge.x}:${edge.y}`;

export const latticePointPx = (
  grid: GridConfig,
  point: WallPoint,
): { x: number; y: number } => ({
  x: grid.offsetX + point.x * grid.cellSizePx,
  y: grid.offsetY + point.y * grid.cellSizePx,
});

export const wallSegmentPx = (
  grid: GridConfig,
  segment: Pick<WallSegment, 'a' | 'b'>,
): { a: { x: number; y: number }; b: { x: number; y: number } } => ({
  a: latticePointPx(grid, segment.a),
  b: latticePointPx(grid, segment.b),
});

export const edgeSegmentPx = (
  grid: GridConfig,
  edge: Pick<GridEdge, 'x' | 'y' | 'dir'>,
): { a: { x: number; y: number }; b: { x: number; y: number } } => {
  const cell = grid.cellSizePx;
  if (edge.dir === 'h') {
    return {
      a: { x: grid.offsetX + edge.x * cell, y: grid.offsetY + edge.y * cell },
      b: { x: grid.offsetX + (edge.x + 1) * cell, y: grid.offsetY + edge.y * cell },
    };
  }
  return {
    a: { x: grid.offsetX + edge.x * cell, y: grid.offsetY + edge.y * cell },
    b: { x: grid.offsetX + edge.x * cell, y: grid.offsetY + (edge.y + 1) * cell },
  };
};

export const edgeMidpointPx = (
  grid: GridConfig,
  edge: Pick<GridEdge, 'x' | 'y' | 'dir'>,
): { x: number; y: number } => {
  const cell = grid.cellSizePx;
  return edge.dir === 'h'
    ? { x: grid.offsetX + (edge.x + 0.5) * cell, y: grid.offsetY + edge.y * cell }
    : { x: grid.offsetX + edge.x * cell, y: grid.offsetY + (edge.y + 0.5) * cell };
};

export const edgeBlocksSight = (edge: GridEdge): boolean => {
  if (edge.kind === 'wall') {
    return true;
  }
  if (edge.kind === 'door') {
    return edge.door !== 'open';
  }
  return false;
};

export const edgeBlocksLight = edgeBlocksSight;

export const edgeBlocksMovement = (edge: GridEdge): boolean => {
  if (edge.kind === 'wall' || edge.kind === 'window' || edge.kind === 'lowWall') {
    return true;
  }
  return edge.kind === 'door' && edge.door !== 'open';
};

const nearestEdges = (point: WallPoint): GridEdge[] => {
  const horizontal: GridEdge = {
    x: Math.floor(point.x),
    y: Math.round(point.y),
    dir: 'h',
    kind: 'wall',
  };
  const vertical: GridEdge = {
    x: Math.round(point.x),
    y: Math.floor(point.y),
    dir: 'v',
    kind: 'wall',
  };
  return [horizontal, vertical];
};

/**
 * Rasterizza un muro vettoriale negli edge di cella che la visione e il
 * movimento sanno usare. I muri orizzontali/verticali restano esatti; un
 * diagonale diventa una catena di edge (la resa visiva resta il vettore).
 */
export const deriveSegmentEdges = (segment: WallSegment): GridEdge[] => {
  const edges = new Map<string, GridEdge>();
  const add = (edge: GridEdge): void => {
    edges.set(edgeKey(edge), {
      ...edge,
      kind: segment.kind,
      ...(segment.door === undefined ? {} : { door: segment.door }),
    });
  };
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  if (Math.abs(dy) < 1e-9 && Math.abs(segment.a.y - Math.round(segment.a.y)) < 1e-9) {
    const y = Math.round(segment.a.y);
    const from = Math.min(segment.a.x, segment.b.x);
    const to = Math.max(segment.a.x, segment.b.x);
    for (let x = Math.floor(from); x < Math.ceil(to); x += 1) {
      add({ x, y, dir: 'h', kind: segment.kind });
    }
    return [...edges.values()];
  }
  if (Math.abs(dx) < 1e-9 && Math.abs(segment.a.x - Math.round(segment.a.x)) < 1e-9) {
    const x = Math.round(segment.a.x);
    const from = Math.min(segment.a.y, segment.b.y);
    const to = Math.max(segment.a.y, segment.b.y);
    for (let y = Math.floor(from); y < Math.ceil(to); y += 1) {
      add({ x, y, dir: 'v', kind: segment.kind });
    }
    return [...edges.values()];
  }
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length / 0.08));
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const point = {
      x: segment.a.x + dx * ratio,
      y: segment.a.y + dy * ratio,
    };
    for (const edge of nearestEdges(point)) {
      add(edge);
    }
  }
  return [...edges.values()];
};

export const blockingEdges = (
  terrain: Terrain | undefined,
  mode: 'sight' | 'light' | 'movement',
): GridEdge[] => {
  if (terrain === undefined) {
    return [];
  }
  const blocked = new Map<string, GridEdge>();
  for (const segment of terrain.walls) {
    for (const edge of deriveSegmentEdges(segment)) {
      const blocks = mode === 'movement'
        ? edgeBlocksMovement(edge)
        : mode === 'light'
          ? edgeBlocksLight(edge)
          : edgeBlocksSight(edge);
      if (blocks) {
        blocked.set(edgeKey(edge), edge);
      }
    }
  }
  return [...blocked.values()];
};

export const edgeFromCells = (from: CellPoint, to: CellPoint): GridEdge[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return [];
  }
  const edges: GridEdge[] = [];
  if (dx !== 0) {
    edges.push({
      x: dx > 0 ? to.x : from.x,
      y: from.y,
      dir: 'v',
      kind: 'wall',
    });
  }
  if (dy !== 0) {
    edges.push({
      x: from.x,
      y: dy > 0 ? to.y : from.y,
      dir: 'h',
      kind: 'wall',
    });
  }
  return edges;
};

const cellsAlongLine = (from: CellPoint, to: CellPoint): CellPoint[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) {
    return [{ ...from }];
  }
  const cells: CellPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    cells.push({
      x: from.x + Math.round((dx * index) / steps),
      y: from.y + Math.round((dy * index) / steps),
    });
  }
  return cells;
};

const blockedStep = (
  from: CellPoint,
  to: CellPoint,
  blocked: ReadonlySet<string>,
): boolean => edgeFromCells(from, to).some((edge) => blocked.has(edgeKey(edge)));

export const hasLineOfSight = (
  from: CellPoint,
  to: CellPoint,
  terrain: Terrain | undefined,
  mode: 'sight' | 'light' = 'sight',
  precomputed?: ReadonlySet<string>,
): boolean => {
  const blocked = precomputed ?? new Set(blockingEdges(terrain, mode).map(edgeKey));
  const cells = cellsAlongLine(from, to);
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (blockedStep(previous, current, blocked)) {
      return false;
    }
  }
  return true;
};

/** Ultima cella raggiungibile lungo la linea verso il target. */
export const lastReachableCell = (
  from: CellPoint,
  to: CellPoint,
  terrain: Terrain | undefined,
): CellPoint => {
  const blocked = new Set(blockingEdges(terrain, 'movement').map(edgeKey));
  const cells = cellsAlongLine(from, to);
  let last = cells[0] ?? from;
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (blockedStep(previous, current, blocked)) {
      return last;
    }
    last = current;
  }
  return last;
};

export const tokenCenterCell = (token: Pick<TokenState, 'x' | 'y' | 'size'>): CellPoint => ({
  x: Math.floor(token.x + token.size / 2),
  y: Math.floor(token.y + token.size / 2),
});
