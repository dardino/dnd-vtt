import type { FogOp, FogShape, FogState } from '../../schemas/scene.js';

export interface FogPoint {
  x: number;
  y: number;
}

const pointInPolygon = (point: FogPoint, points: readonly FogPoint[]): boolean => {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const before = points[previous];
    if (current === undefined || before === undefined) {
      continue;
    }
    const intersects = (current.y > point.y) !== (before.y > point.y)
      && point.x < ((before.x - current.x) * (point.y - current.y))
      / (before.y - current.y === 0 ? Number.EPSILON : before.y - current.y)
      + current.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
};

const distanceToSegment = (point: FogPoint, from: FogPoint, to: FogPoint): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  const t = Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
};

const shapeContains = (shape: FogShape, point: FogPoint): boolean => {
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
        return next === undefined
          ? Math.hypot(point.x - entry.x, point.y - entry.y) <= shape.radius
          : distanceToSegment(point, entry, next) <= shape.radius;
      });
    default:
      return false;
  }
};

export const isPointRevealed = (fog: FogState, point: FogPoint): boolean => {
  let revealed = fog.base === 'revealed';
  for (const op of fog.ops) {
    if (shapeContains(op.shape, point)) {
      revealed = op.op === 'reveal';
    }
  }
  return revealed;
};

export const isTokenRevealed = (
  fog: FogState,
  cellCenter: FogPoint,
): boolean => isPointRevealed(fog, cellCenter);

export const latestFogOp = (ops: readonly FogOp[], id: string): FogOp | undefined =>
  ops.find((op) => op.id === id);

/** Diametro del pennello fog in celle: 3 celle coprono ~7 esagoni o 9 quadrati. */
export const FOG_BRUSH_CELLS = 3;

export const fogBrushRadius = (cellSizePx: number, cells = FOG_BRUSH_CELLS): number =>
  Math.max(1, (cellSizePx * cells) / 2);
