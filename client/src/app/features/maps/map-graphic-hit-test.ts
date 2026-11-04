import {
  isImageGraphic,
  isPolygonGraphic,
  isTextGraphic,
  type GridConfig,
  type MapGraphic,
} from '@dnd-vtt/shared';
import { graphicTextMetrics } from './map-graphics-renderer';

export interface Point2 {
  x: number;
  y: number;
}

export const pointOnSegment = (point: Point2, a: Point2, b: Point2): boolean => {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  return point.x >= Math.min(a.x, b.x) - 1e-9
    && point.x <= Math.max(a.x, b.x) + 1e-9
    && point.y >= Math.min(a.y, b.y) - 1e-9
    && point.y <= Math.max(a.y, b.y) + 1e-9;
};

/** Area con segno (shoelace): vicina a zero per poligoni degeneri o collineari. */
export const signedPolygonArea = (points: readonly Point2[]): number => {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
};

/** Sotto questa soglia (in celle quadrate) il poligono non copre alcuna zona. */
export const SHAPE_AREA_EPSILON = 1e-6;

/** Ray casting con inclusione esplicita dei bordi: i click sul perimetro contano. */
export const polygonContains = (point: Point2, points: readonly Point2[]): boolean => {
  let inside = false;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    if (pointOnSegment(point, a, b)) {
      return true;
    }
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) {
        inside = !inside;
      }
    }
  }
  return inside;
};

/** Punto mappa in coordinate di reticolo (celle, con offset della griglia). */
export const worldToCell = (world: Point2, grid: GridConfig): Point2 => ({
  x: (world.x - grid.offsetX) / grid.cellSizePx,
  y: (world.y - grid.offsetY) / grid.cellSizePx,
});

/** Bounding box stimata del testo, bordi inclusi. */
export const textContains = (item: MapGraphic & { kind: 'text' }, world: Point2): boolean => {
  const metrics = graphicTextMetrics(item);
  return world.x >= metrics.x
    && world.x <= metrics.x + metrics.width
    && world.y >= metrics.y
    && world.y <= metrics.y + metrics.height;
};

/** Hit-test nel sistema locale dell'immagine: rotazione e scala invertite. */
const imageContains = (
  item: MapGraphic & { kind: 'image' },
  natural: { width: number; height: number },
  world: Point2,
): boolean => {
  const radians = (-item.rotation * Math.PI) / 180;
  const dx = world.x - item.x;
  const dy = world.y - item.y;
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
  const scale = Math.abs(item.scale);
  return Math.abs(localX) <= (natural.width * scale) / 2
    && Math.abs(localY) <= (natural.height * scale) / 2;
};

/**
 * Vero se il punto mappa cade nella grafica: bbox dell'immagine o del testo,
 * point-in-polygon (bordi inclusi) per i poligoni in coordinate di cella.
 */
export const graphicContains = (
  item: MapGraphic,
  natural: { width: number; height: number } | null,
  world: Point2,
  grid: GridConfig,
): boolean => {
  if (isImageGraphic(item)) {
    return natural !== null && imageContains(item, natural, world);
  }
  if (isPolygonGraphic(item)) {
    return polygonContains(worldToCell(world, grid), item.points);
  }
  if (isTextGraphic(item)) {
    return textContains(item, world);
  }
  return false;
};
