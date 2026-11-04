import type { Terrain, WallSegment } from '../../schemas/scene.js';
import { blockingEdges, edgeFromCells, edgeKey } from './edges.js';
import type { CellPoint } from './grid.js';

/** Tolleranza usata per distinguere l'interno di una cella dal suo bordo. */
const EPSILON = 1e-9;

interface OpenRange {
  lo: number;
  hi: number;
}

/** Qualunque muro blocca il movimento; una porta solo se non è aperta. */
export const segmentBlocksMovement = (
  segment: Pick<WallSegment, 'kind' | 'door'>,
): boolean => {
  if (segment.kind === 'door') {
    return segment.door !== 'open';
  }
  return true;
};

/**
 * Intervallo aperto dei parametri `t` per cui `origin + t * delta` sta
 * strettamente fra `min` e `max`. `null` se non esiste.
 */
const openRange = (
  origin: number,
  delta: number,
  min: number,
  max: number,
): OpenRange | null => {
  if (Math.abs(delta) <= EPSILON) {
    return origin > min + EPSILON && origin < max - EPSILON ? { lo: 0, hi: 1 } : null;
  }
  const first = (min - origin) / delta;
  const second = (max - origin) / delta;
  return first <= second ? { lo: first, hi: second } : { lo: second, hi: first };
};

/**
 * Vero solo se il segmento entra nell'interno aperto della cella. Bordi,
 * spigoli e tratti collineari al bordo sono contatti, non attraversamenti.
 */
const segmentIntersectsCellInterior = (
  segment: Pick<WallSegment, 'a' | 'b'>,
  cell: CellPoint,
): boolean => {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON) {
    return segment.a.x > cell.x + EPSILON
      && segment.a.x < cell.x + 1 - EPSILON
      && segment.a.y > cell.y + EPSILON
      && segment.a.y < cell.y + 1 - EPSILON;
  }
  const alongX = openRange(segment.a.x, dx, cell.x, cell.x + 1);
  const alongY = openRange(segment.a.y, dy, cell.y, cell.y + 1);
  if (alongX === null || alongY === null) {
    return false;
  }
  const lo = Math.max(alongX.lo, alongY.lo, 0);
  const hi = Math.min(alongX.hi, alongY.hi, 1);
  return hi > lo;
};

const blockingSegments = (terrain: Terrain | undefined): WallSegment[] =>
  terrain === undefined ? [] : terrain.walls.filter(segmentBlocksMovement);

const footprintCells = (origin: CellPoint, size: number): CellPoint[] => {
  const span = Math.max(1, Math.ceil(size));
  const cells: CellPoint[] = [];
  for (let y = origin.y; y < origin.y + span; y += 1) {
    for (let x = origin.x; x < origin.x + span; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
};

const isPlaceableWith = (
  origin: CellPoint,
  size: number,
  segments: readonly WallSegment[],
): boolean => {
  if (segments.length === 0) {
    return true;
  }
  return footprintCells(origin, size).every((cell) =>
    segments.every((segment) => !segmentIntersectsCellInterior(segment, cell)));
};

/** Vero se l'origine e l'intero footprint di lato `size` sono piazzabili. */
export const isCellPlaceable = (
  cell: CellPoint,
  terrain: Terrain | undefined,
  size = 1,
): boolean => isPlaceableWith(cell, size, blockingSegments(terrain));

export const isFootprintPlaceable = (
  origin: CellPoint,
  size: number,
  terrain: Terrain | undefined,
): boolean => isPlaceableWith(origin, size, blockingSegments(terrain));

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

const stepBlocked = (
  from: CellPoint,
  to: CellPoint,
  blocked: ReadonlySet<string>,
): boolean => edgeFromCells(from, to).some((edge) => blocked.has(edgeKey(edge)));

/**
 * Ultima cella raggiungibile lungo la linea verso il target.
 *
 * Ortogonali: l'edge condiviso non deve essere bloccante. Diagonali: non si
 * tagliano gli angoli (entrambe le componenti ortogonali devono essere libere)
 * e il footprint di destinazione deve essere piazzabile. Se il footprint di
 * partenza non lo è, il primo passo verso un footprint valido ignora gli edge
 * (fuga da una posizione invalida); dopo torna alle regole normali.
 */
export const lastReachableCell = (
  from: CellPoint,
  to: CellPoint,
  terrain: Terrain | undefined,
  size = 1,
): CellPoint => {
  const blocked = new Set(blockingEdges(terrain, 'movement').map((edge) => edgeKey(edge)));
  const segments = blockingSegments(terrain);
  const placeable = (cell: CellPoint): boolean => isPlaceableWith(cell, size, segments);
  const cells = cellsAlongLine(from, to);
  let last = cells[0] ?? from;
  const escaping = !placeable(from);
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (!placeable(current)) {
      return last;
    }
    const escapeStep = escaping && index === 1;
    if (!escapeStep && stepBlocked(previous, current, blocked)) {
      return last;
    }
    last = current;
  }
  return last;
};
