import type { GridConfig } from '../../schemas/scene.js';

export interface CellPoint {
  x: number;
  y: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export const HEX_ROW_RATIO = Math.sqrt(3) / 2;

/** La matita delle annotazioni è circa un quarto di cella. */
export const DRAWING_WIDTH_CELLS = 0.25;

export const gridDrawingWidth = (
  cellSizePx: number,
  fraction = DRAWING_WIDTH_CELLS,
): number => Math.max(1, cellSizePx * fraction);

const squareDip = (diagonals: number, rule: GridConfig['diagonalRule']): number =>
  rule === '5-5-5'
    ? diagonals
    : diagonals + Math.floor(diagonals / 2);

/**
 * Converte una cella offset `odd-r` nelle coordinate cubiche usate per la
 * distanza esagonale (D10).
 */
export const offsetToCube = (cell: CellPoint): { q: number; r: number; s: number } => {
  const q = cell.x - (cell.y - (cell.y & 1)) / 2;
  const r = cell.y;
  return { q, r, s: -q - r };
};

export const cubeToOffset = (cube: { q: number; r: number }): CellPoint => ({
  x: cube.q + (cube.r - (cube.r & 1)) / 2,
  y: cube.r,
});

export const hexDistance = (from: CellPoint, to: CellPoint): number => {
  const a = offsetToCube(from);
  const b = offsetToCube(to);
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
};

export const squareDistance = (from: CellPoint, to: CellPoint): number =>
  Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));

export const distanceCells = (from: CellPoint, to: CellPoint, grid: GridConfig): number =>
  grid.type === 'hex' ? hexDistance(from, to) : squareDistance(from, to);

/**
 * Distanza in piedi secondo la griglia: Chebyshev con regola diagonale per la
 * quadrata, distanza cubica per la esagonale pointy-top `odd-r`.
 */
export const distanceFeet = (from: CellPoint, to: CellPoint, grid: GridConfig): number => {
  if (grid.type === 'hex') {
    return hexDistance(from, to) * grid.feetPerCell;
  }
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  const diagonals = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonals;
  return (squareDip(diagonals, grid.diagonalRule) + straight) * grid.feetPerCell;
};

export interface MeasureResult {
  from: CellPoint;
  to: CellPoint;
  cells: number;
  feet: number;
}

export const measureDistance = (
  from: CellPoint,
  to: CellPoint,
  grid: GridConfig,
): MeasureResult => ({
  from,
  to,
  cells: distanceCells(from, to, grid),
  feet: distanceFeet(from, to, grid),
});

export const cellCenterPx = (grid: GridConfig, cell: CellPoint): PixelPoint => {
  const cellSize = grid.cellSizePx;
  if (grid.type === 'hex') {
    return {
      x: grid.offsetX + (cell.x + 0.5 + (cell.y & 1) / 2) * cellSize,
      y: grid.offsetY + (cell.y + 0.5) * cellSize * HEX_ROW_RATIO,
    };
  }
  return {
    x: grid.offsetX + (cell.x + 0.5) * cellSize,
    y: grid.offsetY + (cell.y + 0.5) * cellSize,
  };
};

const cubeRound = (q: number, r: number): { q: number; r: number } => {
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  const roundedS = Math.round(-q - r);
  const qDiff = Math.abs(roundedQ - q);
  const rDiff = Math.abs(roundedR - r);
  const sDiff = Math.abs(roundedS - -q - r);
  if (qDiff > rDiff && qDiff > sDiff) {
    roundedQ = -roundedR - roundedS;
  } else if (rDiff > sDiff) {
    roundedR = -roundedQ - roundedS;
  }
  return { q: roundedQ, r: roundedR };
};

/** Cella esagonale più vicina a un punto immagine, con arrotondamento cubico. */
export const pixelToHexCell = (grid: GridConfig, point: PixelPoint): CellPoint => {
  const size = grid.cellSizePx / Math.sqrt(3);
  const localX = point.x - grid.offsetX - grid.cellSizePx / 2;
  const localY = point.y - grid.offsetY - grid.cellSizePx * HEX_ROW_RATIO / 2;
  const q = (Math.sqrt(3) / 3 * localX - localY / 3) / size;
  const r = (2 / 3 * localY) / size;
  const rounded = cubeRound(q, r);
  return cubeToOffset(rounded);
};

export const pixelToCell = (grid: GridConfig, point: PixelPoint): CellPoint => {
  if (grid.type === 'hex') {
    return pixelToHexCell(grid, point);
  }
  return {
    x: Math.floor((point.x - grid.offsetX) / grid.cellSizePx),
    y: Math.floor((point.y - grid.offsetY) / grid.cellSizePx),
  };
};

/**
 * Snap del centro del token alla cella più vicina. Per la griglia quadrata
 * `x`/`y` rappresentano l'angolo in alto a sinistra dell'ingombro; per
 * l'esagonale rappresentano la cella centrale.
 */
export const snapTokenCell = (
  grid: GridConfig,
  point: PixelPoint,
  size = 1,
): CellPoint => {
  if (grid.type === 'hex') {
    return pixelToHexCell(grid, point);
  }
  return {
    x: Math.round((point.x - grid.offsetX) / grid.cellSizePx - size / 2),
    y: Math.round((point.y - grid.offsetY) / grid.cellSizePx - size / 2),
  };
};

export const tokenCenterPx = (
  grid: GridConfig,
  token: { x: number; y: number; size: number },
): PixelPoint => {
  if (grid.type === 'hex') {
    return cellCenterPx(grid, { x: token.x, y: token.y });
  }
  return {
    x: grid.offsetX + (token.x + token.size / 2) * grid.cellSizePx,
    y: grid.offsetY + (token.y + token.size / 2) * grid.cellSizePx,
  };
};

export const tokenFootprintPx = (
  grid: GridConfig,
  token: { size: number },
): number => grid.cellSizePx * token.size;
