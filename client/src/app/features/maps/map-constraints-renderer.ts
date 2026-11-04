import type { BlockedArea } from '@dnd-vtt/shared';

/** Rettangolo in pixel mappa derivato dai due angoli di griglia dell'area. */
export interface BlockedAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const pixelX = (value: number, cellSizePx: number, offsetX: number): number =>
  offsetX + value * cellSizePx;

const pixelY = (value: number, cellSizePx: number, offsetY: number): number =>
  offsetY + value * cellSizePx;

/**
 * Converte i due angoli opposti di un'area rettangolare in un rettangolo
 * normalizzato: gestisce drag in qualsiasi direzione e non applica clamp.
 */
export const blockedAreaRect = (
  area: BlockedArea,
  cellSizePx: number,
  offsetX: number,
  offsetY: number,
): BlockedAreaRect => {
  const [a, b] = area.points;
  if (a === undefined || b === undefined) {
    return { x: offsetX, y: offsetY, width: 0, height: 0 };
  }
  const ax = pixelX(a.x, cellSizePx, offsetX);
  const ay = pixelY(a.y, cellSizePx, offsetY);
  const bx = pixelX(b.x, cellSizePx, offsetX);
  const by = pixelY(b.y, cellSizePx, offsetY);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
};

/**
 * Converte i vertici di un poligono in coppie piatte `x,y` nell'ordine dato,
 * senza riordinarli né chiudere esplicitamente il tracciato.
 */
export const blockedAreaPoints = (
  area: BlockedArea,
  cellSizePx: number,
  offsetX: number,
  offsetY: number,
): number[] =>
  area.points.flatMap((point) => [
    pixelX(point.x, cellSizePx, offsetX),
    pixelY(point.y, cellSizePx, offsetY),
  ]);
