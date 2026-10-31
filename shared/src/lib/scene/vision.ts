import type {
  FogState,
  GridConfig,
  PublicDoor,
  Terrain,
  TokenLight,
  TokenState,
  VisionGrid,
} from '../../schemas/scene.js';
import type { CellPoint } from './grid.js';
import { cellCenterPx } from './grid.js';
import { blockingEdges, deriveSegmentEdges, edgeKey, hasLineOfSight, type GridEdge } from './edges.js';

export interface VisionSource {
  cell: CellPoint;
  darkvision?: number;
  blindsight?: number;
  truesight?: number;
  tremorsense?: number;
  light?: TokenLight;
}

export interface VisionOptions {
  widthPx: number;
  heightPx: number;
  grid: GridConfig;
  terrain: Terrain;
  sources: VisionSource[];
}

const cellIndex = (cols: number, cell: CellPoint): number => cell.y * cols + cell.x;

export const visionLevel = (
  vision: VisionGrid | null | undefined,
  cell: CellPoint,
): number => {
  if (vision === null || vision === undefined) {
    return 0;
  }
  if (cell.x < 0 || cell.y < 0 || cell.x >= vision.cols || cell.y >= vision.rows) {
    return 0;
  }
  return vision.levels[cellIndex(vision.cols, cell)] ?? 0;
};

const angleBetween = (from: CellPoint, to: CellPoint): number => {
  const degrees = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (degrees + 360) % 360;
};

const insideCone = (
  light: TokenLight,
  from: CellPoint,
  to: CellPoint,
): boolean => {
  if (light.shape !== 'cone') {
    return true;
  }
  const direction = light.direction ?? 0;
  const target = angleBetween(from, to);
  const delta = Math.abs(((target - direction + 540) % 360) - 180);
  return delta <= light.angle / 2;
};

const lightSources = (
  terrain: Terrain,
  sources: VisionSource[],
): Array<{ cell: CellPoint; light: TokenLight }> => {
  const lights: Array<{ cell: CellPoint; light: TokenLight }> = terrain.lights
    .filter((light) => light.enabled)
    .map((light) => ({
      cell: { x: light.x, y: light.y },
      light,
    }));
  for (const source of sources) {
    if (source.light?.enabled === true) {
      lights.push({ cell: source.cell, light: source.light });
    }
  }
  return lights;
};

const distanceFeetBetween = (from: CellPoint, to: CellPoint, grid: GridConfig): number =>
  Math.hypot(to.x - from.x, to.y - from.y) * grid.feetPerCell;

/**
 * Visione del party su griglia quadrata. Ogni cella ha tre livelli: 0 nascosta,
 * 1 penombra, 2 luce piena. La luce ambientale e le luci vengono tagliate dai
 * muri; i sensi dei PG migliorano l'illuminazione entro il loro raggio.
 */
export const computeVisionGrid = (options: VisionOptions): VisionGrid | null => {
  const { grid, terrain, sources, widthPx, heightPx } = options;
  if (grid.type !== 'square' || !terrain.visionEnabled) {
    return null;
  }
  const cols = Math.max(1, Math.ceil((widthPx - grid.offsetX) / grid.cellSizePx));
  const rows = Math.max(1, Math.ceil((heightPx - grid.offsetY) / grid.cellSizePx));
  const levels = new Uint8Array(cols * rows);
  if (sources.length === 0) {
    return null;
  }
  const ambient = terrain.ambientLight === 'bright' ? 2 : terrain.ambientLight === 'dim' ? 1 : 0;
  if (ambient > 0) {
    levels.fill(ambient);
  }
  const feetPerCell = grid.feetPerCell;
  const maxFeet = Math.min(
    terrain.visionLimitFeet,
    Math.max(cols, rows) * feetPerCell,
  );
  const sightBlocked = new Set(blockingEdges(terrain, 'sight').map(edgeKey));
  const lightBlocked = new Set(blockingEdges(terrain, 'light').map(edgeKey));

  const applyLight = (cell: CellPoint, light: TokenLight): void => {
    const radius = Math.ceil(light.dimFeet / feetPerCell);
    for (let y = Math.max(0, cell.y - radius); y <= Math.min(rows - 1, cell.y + radius); y += 1) {
      for (let x = Math.max(0, cell.x - radius); x <= Math.min(cols - 1, cell.x + radius); x += 1) {
        const target = { x, y };
        if (!insideCone(light, cell, target)) {
          continue;
        }
        const feet = distanceFeetBetween(cell, target, grid);
        if (feet > light.dimFeet) {
          continue;
        }
        if (!hasLineOfSight(cell, target, terrain, 'light', lightBlocked)) {
          continue;
        }
        const level = feet <= light.brightFeet ? 2 : 1;
        const index = cellIndex(cols, target);
        levels[index] = Math.max(levels[index] ?? 0, level);
      }
    }
  };

  for (const entry of lightSources(terrain, sources)) {
    applyLight(entry.cell, entry.light);
  }

  for (const source of sources) {
    const radius = Math.ceil(maxFeet / feetPerCell);
    for (let y = Math.max(0, source.cell.y - radius); y <= Math.min(rows - 1, source.cell.y + radius); y += 1) {
      for (let x = Math.max(0, source.cell.x - radius); x <= Math.min(cols - 1, source.cell.x + radius); x += 1) {
        const target = { x, y };
        const feet = distanceFeetBetween(source.cell, target, grid);
        if (feet > maxFeet) {
          continue;
        }
        const index = cellIndex(cols, target);
        let level = levels[index] ?? 0;
        if (source.darkvision !== undefined && feet <= source.darkvision) {
          level = level === 0 ? 1 : 2;
        }
        if (
          (source.blindsight !== undefined && feet <= source.blindsight)
          || (source.truesight !== undefined && feet <= source.truesight)
        ) {
          level = 2;
        }
        if (level === 0) {
          continue;
        }
        if (!hasLineOfSight(source.cell, target, terrain, 'sight', sightBlocked)) {
          continue;
        }
        levels[index] = Math.max(levels[index] ?? 0, level);
      }
    }
  }

  return { cols, rows, levels: Array.from(levels) };
};

export const shapeContainsCell = (shape: FogState['ops'][number]['shape'], cell: CellPoint): boolean =>
  shape.type === 'cells'
    ? shape.cells.some((entry) => entry.x === cell.x && entry.y === cell.y)
    : false;

const shapeContainsPoint = (
  shape: FogState['ops'][number]['shape'],
  point: { x: number; y: number },
): boolean => {
  switch (shape.type) {
    case 'rect':
      return point.x >= shape.x
        && point.x <= shape.x + shape.width
        && point.y >= shape.y
        && point.y <= shape.y + shape.height;
    case 'circle':
      return Math.hypot(point.x - shape.cx, point.y - shape.cy) <= shape.radius;
    case 'polygon':
      return pointInPolygon(point, shape.points);
    case 'brush':
      return shape.points.some((entry, index) => {
        const next = shape.points[index + 1];
        if (next === undefined) {
          return Math.hypot(point.x - entry.x, point.y - entry.y) <= shape.radius;
        }
        return distanceToSegment(point, entry, next) <= shape.radius;
      });
    case 'cells':
      return false;
    default:
      return false;
  }
};

const pointInPolygon = (
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a === undefined || b === undefined) {
      continue;
    }
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
};

const distanceToSegment = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + ratio * dx), point.y - (a.y + ratio * dy));
};

/** Ultima operazione manuale che copre il punto; `undefined` se nessuna. */
export const manualFogAt = (
  fog: FogState,
  point: { x: number; y: number },
  cell: CellPoint,
): boolean | undefined => {
  if (fog.override === 'reveal') {
    return true;
  }
  if (fog.override === 'hide') {
    return false;
  }
  let result: boolean | undefined;
  for (const op of fog.ops) {
    const covers = op.shape.type === 'cells'
      ? shapeContainsCell(op.shape, cell)
      : shapeContainsPoint(op.shape, point);
    if (covers) {
      result = op.op === 'reveal';
    }
  }
  return result;
};

export const isCellVisible = (
  fog: FogState,
  vision: VisionGrid | null | undefined,
  grid: GridConfig,
  cell: CellPoint,
): boolean => {
  if (cell.x < 0 || cell.y < 0) {
    return false;
  }
  const point = cellCenterPx(grid, cell);
  const manual = manualFogAt(fog, point, cell);
  if (manual !== undefined) {
    return manual;
  }
  if (vision !== null && vision !== undefined) {
    return visionLevel(vision, cell) > 0;
  }
  return fog.base === 'revealed';
};

export const isTokenVisible = (
  fog: FogState,
  vision: VisionGrid | null | undefined,
  grid: GridConfig,
  token: Pick<TokenState, 'x' | 'y' | 'size'>,
): boolean => {
  const size = Math.max(1, Math.ceil(token.size));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isCellVisible(fog, vision, grid, { x: Math.floor(token.x) + x, y: Math.floor(token.y) + y })) {
        return true;
      }
    }
  }
  return false;
};

const adjacentCells = (edge: GridEdge): CellPoint[] =>
  edge.dir === 'h'
    ? [{ x: edge.x, y: edge.y - 1 }, { x: edge.x, y: edge.y }]
    : [{ x: edge.x - 1, y: edge.y }, { x: edge.x, y: edge.y }];

export const doorsForDisplay = (
  terrain: Terrain,
  fog: FogState,
  vision: VisionGrid | null | undefined,
  grid: GridConfig,
): PublicDoor[] => {
  const doors: PublicDoor[] = [];
  for (const segment of terrain.walls) {
    if (segment.kind !== 'door' || segment.door === 'secret') {
      continue;
    }
    const visible = deriveSegmentEdges(segment)
      .flatMap(adjacentCells)
      .some((cell) => isCellVisible(fog, vision, grid, cell));
    if (!visible) {
      continue;
    }
    doors.push({
      id: segment.id,
      a: segment.a,
      b: segment.b,
      state: segment.door === 'open' ? 'open' : 'closed',
    });
  }
  return doors;
};
