import type { FogOp, FogShape, FogState } from '../../schemas/scene.js';
import { distanceToSegment, pointInPolygon, type PointLike } from './geometry.js';

export type FogPoint = PointLike;

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
