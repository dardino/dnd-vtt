export interface PointLike {
  x: number;
  y: number;
}

/**
 * Point-in-polygon con ray casting. Il denominatore è protetto contro la
 * divisione per zero, così un lato orizzontale non produce `NaN`.
 */
export const pointInPolygon = (point: PointLike, polygon: readonly PointLike[]): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const before = polygon[previous];
    if (current === undefined || before === undefined) {
      continue;
    }
    const crosses = (current.y > point.y) !== (before.y > point.y)
      && point.x < ((before.x - current.x) * (point.y - current.y))
      / (before.y - current.y === 0 ? Number.EPSILON : before.y - current.y)
      + current.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
};

/** Distanza euclidea fra un punto e il segmento `from`–`to`. */
export const distanceToSegment = (point: PointLike, from: PointLike, to: PointLike): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  if (length === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  const ratio = Math.max(0, Math.min(1,
    ((point.x - from.x) * dx + (point.y - from.y) * dy) / length));
  return Math.hypot(point.x - (from.x + ratio * dx), point.y - (from.y + ratio * dy));
};
