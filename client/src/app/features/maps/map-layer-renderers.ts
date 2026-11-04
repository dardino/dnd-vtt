import Konva from 'konva';
import type { BlockedArea, GridConfig, MapGraphic } from '@dnd-vtt/shared';
import { blockedAreaPoints, blockedAreaRect } from './map-constraints-renderer';
import { graphicNodeGeometry, sortedGraphics } from './map-graphics-renderer';

const BLOCKED_AREA_FILL = 'rgba(255, 99, 99, 0.25)';
const BLOCKED_AREA_STROKE = 'rgba(255, 140, 90, 0.9)';

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
  /** Cache condivisa con il resto dell'editor: `null` mentre è in caricamento. */
  readonly loadImage: (url: string, onLoad: () => void) => HTMLImageElement | null;
  readonly onImageLoaded: () => void;
  /**
   * Quando il layer è editabile con lo strumento select le immagini ascoltano
   * e si trascinano; `dragend` riporta il centro in coordinate mondo.
   */
  readonly interactive?: boolean;
  readonly onDragEnd?: (id: string, x: number, y: number) => void;
}

export interface BlockedAreasLayerParams {
  readonly layer: Konva.Layer;
  readonly areas: readonly BlockedArea[];
  readonly grid: GridConfig;
  /** Riempimento/bordo risolti dal tema; i default restano validi per gli altri usi. */
  readonly fill?: string;
  readonly stroke?: string;
}

/** Disegna le grafiche ordinate per `z`, saltando quelle senza immagine. */
export const drawGraphicsLayer = ({
  layer,
  graphics,
  loadImage,
  onImageLoaded,
  interactive = false,
  onDragEnd,
}: GraphicsLayerParams): void => {
  const images = new Map<string, LayerGraphicImage | null>();
  for (const entry of graphics) {
    images.set(entry.item.id, entry.image);
  }
  for (const item of sortedGraphics(graphics.map((entry) => entry.item))) {
    const image = images.get(item.id);
    if (image === undefined || image === null) {
      continue;
    }
    const element = loadImage(image.url, onImageLoaded);
    if (element === null) {
      continue;
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
      listening: interactive,
      draggable: interactive,
    });
    if (interactive && onDragEnd !== undefined) {
      node.on('dragend', () => onDragEnd(item.id, node.x(), node.y()));
    }
    layer.add(node);
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
