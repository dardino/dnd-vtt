import type { GridConfig, Terrain, TokenState, WallEdge } from '../../schemas/scene.js';
import type { CellPoint } from './grid.js';
import { pixelToCell } from './grid.js';

export interface EdgeRef {
  x: number;
  y: number;
  dir: 'h' | 'v';
}

export const edgeKey = (edge: EdgeRef): string => `${edge.dir}:${edge.x}:${edge.y}`;

export const edgeId = (edge: EdgeRef): string => `edge-${edge.dir}-${edge.x}-${edge.y}`;

export const edgeFromCells = (from: CellPoint, to: CellPoint): EdgeRef[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return [];
  }
  const edges: EdgeRef[] = [];
  if (dx !== 0) {
    edges.push({ x: dx > 0 ? to.x : from.x, y: from.y, dir: 'v' });
  }
  if (dy !== 0) {
    edges.push({ x: from.x, y: dy > 0 ? to.y : from.y, dir: 'h' });
  }
  return edges;
};

export const edgeMidpointPx = (
  grid: GridConfig,
  edge: EdgeRef,
): { x: number; y: number } => {
  const cell = grid.cellSizePx;
  return edge.dir === 'h'
    ? { x: grid.offsetX + (edge.x + 0.5) * cell, y: grid.offsetY + edge.y * cell }
    : { x: grid.offsetX + edge.x * cell, y: grid.offsetY + (edge.y + 0.5) * cell };
};

export const edgeSegmentPx = (
  grid: GridConfig,
  edge: EdgeRef,
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

export const edgeBlocksSight = (edge: WallEdge): boolean => {
  if (edge.kind === 'wall') {
    return true;
  }
  if (edge.kind === 'door') {
    return edge.door !== 'open';
  }
  return false;
};

export const edgeBlocksLight = edgeBlocksSight;

export const edgeBlocksMovement = (edge: WallEdge): boolean => {
  if (edge.kind === 'wall' || edge.kind === 'window' || edge.kind === 'lowWall') {
    return true;
  }
  return edge.kind === 'door' && edge.door !== 'open';
};

export const blockingEdges = (
  terrain: Terrain | undefined,
  mode: 'sight' | 'light' | 'movement',
): WallEdge[] => {
  if (terrain === undefined) {
    return [];
  }
  const predicate = mode === 'movement' ? edgeBlocksMovement : mode === 'light' ? edgeBlocksLight : edgeBlocksSight;
  return terrain.walls.filter(predicate);
};

export const findEdge = (
  terrain: Terrain | undefined,
  edge: EdgeRef,
): WallEdge | undefined => terrain?.walls.find((entry) => edgeKey(entry) === edgeKey(edge));

/**
 * Converte una polilinea libera in una catena di lati della griglia. Campiona
 * il tratto a passi sub-cella e registra ogni cambio di cella, cos� anche una
 * torre circolare diventa un anello di edge senza buchi.
 */
export const rasterizeWallTrace = (
  points: Array<{ x: number; y: number }>,
  grid: GridConfig,
): EdgeRef[] => {
  if (points.length < 2) {
    return [];
  }
  const step = Math.max(2, Math.min(12, grid.cellSizePx / 6));
  const edges = new Map<string, EdgeRef>();
  let previous = pixelToCell(grid, points[0] ?? { x: 0, y: 0 });
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) {
      continue;
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / step));
    for (let tick = 0; tick <= steps; tick += 1) {
      const ratio = tick / steps;
      const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      const cell = pixelToCell(grid, point);
      if (cell.x !== previous.x || cell.y !== previous.y) {
        for (const edge of edgeFromCells(previous, cell)) {
          edges.set(edgeKey(edge), edge);
        }
        previous = cell;
      }
    }
  }
  return [...edges.values()];
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
