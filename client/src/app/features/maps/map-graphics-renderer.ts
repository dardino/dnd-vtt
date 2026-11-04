import type {
  GridConfig,
  ImageGraphic,
  MapGraphic,
  PolygonGraphic,
  TextGraphic,
} from '@dnd-vtt/shared';

/** Geometria Konva di una grafica decorativa, in pixel mappa. */
export interface GraphicNodeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  zIndex: number;
}

const byZThenId = (a: MapGraphic, b: MapGraphic): number => {
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
};

/**
 * Ordine di disegno delle grafiche: `z` crescente, poi `id` crescente per
 * garantire un ordine deterministico a parità di quota. Non muta l'input.
 */
export const sortedGraphics = (items: readonly MapGraphic[]): MapGraphic[] =>
  [...items].sort(byZThenId);

/**
 * Traduce una grafica nei parametri di un `Konva.Image`: coordinate del centro,
 * dimensioni naturali, offset a metà, flip applicato alla scala e zIndex.
 */
export const graphicNodeGeometry = (
  item: ImageGraphic,
  natural: { width: number; height: number },
): GraphicNodeGeometry => ({
  x: item.x,
  y: item.y,
  width: natural.width,
  height: natural.height,
  offsetX: natural.width / 2,
  offsetY: natural.height / 2,
  scaleX: (item.flipH ? -1 : 1) * item.scale,
  scaleY: (item.flipV ? -1 : 1) * item.scale,
  rotation: item.rotation,
  opacity: item.opacity,
  zIndex: item.z,
});

/**
 * Vertici del poligono convertiti da coordinate di reticolo (celle) a pixel
 * mappa, nell'ordine piatto richiesto da `Konva.Line`. Non muta l'input.
 */
export const graphicPolygonPoints = (
  item: PolygonGraphic,
  grid: GridConfig,
): number[] =>
  item.points.flatMap((point) => [
    grid.offsetX + point.x * grid.cellSizePx,
    grid.offsetY + point.y * grid.cellSizePx,
  ]);

/** Bounding box stimata del testo, ancorata all'angolo in alto a sinistra. */
export interface GraphicTextMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Larghezza media di un carattere rispetto al font size. */
const TEXT_CHARACTER_RATIO = 0.62;
/** Interlinea di una singola riga: il testo non ammette newline. */
const TEXT_LINE_HEIGHT_RATIO = 1.25;

/**
 * Stima deterministica del bounding box: dipende solo dal contenuto e dal
 * font size, così hit-test e selezione non richiedono una misura reale.
 */
export const graphicTextMetrics = (item: TextGraphic): GraphicTextMetrics => ({
  x: item.x,
  y: item.y,
  width: Math.max(item.fontSize, item.text.length * item.fontSize * TEXT_CHARACTER_RATIO),
  height: item.fontSize * TEXT_LINE_HEIGHT_RATIO,
});
