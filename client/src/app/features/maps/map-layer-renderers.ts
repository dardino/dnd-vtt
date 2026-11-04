import Konva from 'konva';
import {
  isImageGraphic,
  isPolygonGraphic,
  isTextGraphic,
  type BlockedArea,
  type GridConfig,
  type MapGraphic,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import { blockedAreaPoints, blockedAreaRect } from './map-constraints-renderer';
import {
  graphicNodeGeometry,
  graphicPolygonPoints,
  sortedGraphics,
} from './map-graphics-renderer';
import { textFontStack } from './map-text-fonts';

const BLOCKED_AREA_FILL = 'rgba(255, 99, 99, 0.25)';
const BLOCKED_AREA_STROKE = 'rgba(255, 140, 90, 0.9)';
const POLYGON_STROKE = 'rgba(15, 28, 46, 0.55)';
const POLYGON_STROKE_WIDTH = 2;

/** Immagine già risolta per una grafica, in dimensioni naturali. */
export interface LayerGraphicImage {
  url: string;
  width: number;
  height: number;
}

export interface LayerGraphic {
  item: MapGraphic;
  image: LayerGraphicImage | null;
}

export interface GraphicsLayerParams {
  readonly layer: Konva.Layer;
  readonly graphics: readonly LayerGraphic[];
  /** Griglia del documento: i poligoni vivono in celle, non in pixel. */
  readonly grid: GridConfig;
  /** Cache condivisa con il resto dell'editor: `null` mentre è in caricamento. */
  readonly loadImage: (url: string, onLoad: () => void) => HTMLImageElement | null;
  readonly onImageLoaded: () => void;
  /**
   * Quando il layer è editabile con lo strumento select le grafiche ascoltano
   * e si trascinano; `dragend` riporta la posizione in coordinate mondo.
   */
  readonly interactive?: boolean;
  readonly onDragEnd?: (id: string, x: number, y: number) => void;
  /** I poligoni si spostano in celle intere, non in pixel liberi. */
  readonly onPolygonDragEnd?: (id: string, dx: number, dy: number) => void;
}

export interface BlockedAreasLayerParams {
  readonly layer: Konva.Layer;
  readonly areas: readonly BlockedArea[];
  readonly grid: GridConfig;
  /** Riempimento/bordo risolti dal tema; i default restano validi per gli altri usi. */
  readonly fill?: string;
  readonly stroke?: string;
}

/** Configurazione comune a tutte le grafiche: selezione e trascinamento. */
const interactionConfig = (interactive: boolean): {
  listening: boolean;
  draggable: boolean;
} => ({
  listening: interactive,
  draggable: interactive,
});

const imageNode = (
  item: MapGraphic & { kind: 'image' },
  image: LayerGraphicImage,
  params: GraphicsLayerParams,
): Konva.Image | null => {
  const element = params.loadImage(image.url, params.onImageLoaded);
  if (element === null) {
    return null;
  }
  const geometry = graphicNodeGeometry(item, { width: image.width, height: image.height });
  const node = new Konva.Image({
    image: element,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    offsetX: geometry.offsetX,
    offsetY: geometry.offsetY,
    scaleX: geometry.scaleX,
    scaleY: geometry.scaleY,
    rotation: geometry.rotation,
    opacity: geometry.opacity,
    ...interactionConfig(params.interactive === true),
  });
  if (params.interactive === true && params.onDragEnd !== undefined) {
    const onDragEnd = params.onDragEnd;
    node.on('dragend', () => onDragEnd(item.id, node.x(), node.y()));
  }
  return node;
};

const polygonNode = (
  item: PolygonGraphic,
  params: GraphicsLayerParams,
): Konva.Line => {
  const node = new Konva.Line({
    points: graphicPolygonPoints(item, params.grid),
    closed: true,
    fill: item.fill,
    stroke: POLYGON_STROKE,
    strokeWidth: POLYGON_STROKE_WIDTH,
    strokeScaleEnabled: false,
    perfectDrawEnabled: false,
    opacity: item.opacity,
    ...interactionConfig(params.interactive === true),
  });
  if (params.interactive === true && params.onPolygonDragEnd !== undefined) {
    const onPolygonDragEnd = params.onPolygonDragEnd;
    const { cellSizePx } = params.grid;
    node.on('dragend', () => {
      const dx = Math.round(node.x() / cellSizePx);
      const dy = Math.round(node.y() / cellSizePx);
      // Il nodo torna all'origine: il delta vive nell'evento, non nel nodo.
      node.x(0);
      node.y(0);
      if (dx !== 0 || dy !== 0) {
        onPolygonDragEnd(item.id, dx, dy);
      }
    });
  }
  return node;
};

const textNode = (item: TextGraphic, params: GraphicsLayerParams): Konva.Text => {
  const node = new Konva.Text({
    text: item.text,
    x: item.x,
    y: item.y,
    fontFamily: textFontStack(item.fontFamily),
    fontSize: item.fontSize,
    fill: item.color,
    opacity: item.opacity,
    perfectDrawEnabled: false,
    ...interactionConfig(params.interactive === true),
  });
  if (params.interactive === true && params.onDragEnd !== undefined) {
    const onDragEnd = params.onDragEnd;
    node.on('dragend', () => onDragEnd(item.id, node.x(), node.y()));
  }
  return node;
};

/**
 * Disegna le grafiche ordinate per `z`, con un unico stack visivo tra
 * immagini, poligoni e testi. Le immagini senza asset vengono saltate; le
 * forme non dipendono da asset e restano sempre visibili.
 */
export const drawGraphicsLayer = (params: GraphicsLayerParams): void => {
  const { graphics, layer } = params;
  const images = new Map<string, LayerGraphicImage | null>();
  for (const entry of graphics) {
    images.set(entry.item.id, entry.image);
  }
  for (const item of sortedGraphics(graphics.map((entry) => entry.item))) {
    if (isImageGraphic(item)) {
      const image = images.get(item.id);
      if (image === undefined || image === null) {
        continue;
      }
      const node = imageNode(item, image, params);
      if (node !== null) {
        layer.add(node);
      }
      continue;
    }
    if (isPolygonGraphic(item)) {
      layer.add(polygonNode(item, params));
      continue;
    }
    if (isTextGraphic(item)) {
      layer.add(textNode(item, params));
    }
  }
  layer.draw();
};

/** Disegna le aree bloccate con riempimento semitrasparente e bordo distinto. */
export const drawBlockedAreasLayer = ({
  layer,
  areas,
  grid,
  fill = BLOCKED_AREA_FILL,
  stroke = BLOCKED_AREA_STROKE,
}: BlockedAreasLayerParams): void => {
  for (const area of areas) {
    if (area.shape === 'rect') {
      const rect = blockedAreaRect(area, grid.cellSizePx, grid.offsetX, grid.offsetY);
      layer.add(new Konva.Rect({
        ...rect,
        fill,
        stroke,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        perfectDrawEnabled: false,
        listening: false,
      }));
      continue;
    }
    const points = blockedAreaPoints(area, grid.cellSizePx, grid.offsetX, grid.offsetY);
    layer.add(new Konva.Line({
      points,
      closed: true,
      fill,
      stroke,
      strokeWidth: 2,
      strokeScaleEnabled: false,
      perfectDrawEnabled: false,
      listening: false,
    }));
  }
  layer.draw();
};
