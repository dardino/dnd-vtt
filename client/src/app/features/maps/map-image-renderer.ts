import {
  backgroundLayer,
  constraintsLayer,
  elementsLayer,
  graphicsLayer,
  type MapDocument,
  type MapElement,
  type MapGraphic,
} from '@dnd-vtt/shared';
import { blockedAreaPoints, blockedAreaRect } from './map-constraints-renderer';
import { graphicNodeGeometry, sortedGraphics } from './map-graphics-renderer';

/** Immagine già decodificata, con dimensioni naturali, pronta per il canvas 2D. */
export interface MapRenderImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

/** Grafica con la sua immagine risolta (`null` quando l'asset manca). */
export interface MapRenderGraphicAsset {
  item: MapGraphic;
  image: MapRenderImage | null;
}

/** Asset necessari a disegnare sfondo e grafiche di un documento. */
export interface MapRenderAssets {
  background: MapRenderImage | null;
  graphics: ReadonlyArray<MapRenderGraphicAsset>;
}

/** Dimensioni del canvas di output e scala uniforme applicata al documento. */
export interface MapRenderSize {
  width: number;
  height: number;
  scale: number;
}

export type MapRenderVariant = 'composite' | 'thumbnail';

export interface MapRenderOptions {
  variant: MapRenderVariant;
}

export interface MapBackgroundCommand {
  kind: 'background';
  color: string;
}

export interface MapImageCommand {
  kind: 'image';
  imageId: string;
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
}

export interface MapRectCommand {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface MapPolygonCommand {
  kind: 'polygon';
  points: number[];
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface MapLineCommand {
  kind: 'line';
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface MapMarkerCommand {
  kind: 'marker';
  x: number;
  y: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type MapDrawCommand = MapBackgroundCommand
  | MapImageCommand
  | MapRectCommand
  | MapPolygonCommand
  | MapLineCommand
  | MapMarkerCommand;

const WALL_STROKE = 'rgba(236, 239, 241, 0.9)';
const BLOCKED_AREA_FILL = 'rgba(255, 99, 99, 0.25)';
const BLOCKED_AREA_STROKE = 'rgba(255, 140, 90, 0.9)';
const MARKER_STROKE = 'rgba(17, 24, 39, 0.85)';

const LIGHT_RADIUS_RATIO = 0.1;
const START_RADIUS_RATIO = 0.3;
const LOOT_RADIUS_RATIO = 0.2;
const SPAWN_COLOR = '#e53935';
const START_COLOR = '#29b6f6';
const LOOT_COLOR = '#ffb300';

/**
 * Dimensioni di rendering: il lato lungo è clampato a `maxSide`, la scala resta
 * uniforme, nessun upscale oltre le dimensioni native e almeno 1px per lato.
 */
export const mapRenderSize = (
  doc: Pick<MapDocument, 'widthPx' | 'heightPx'>,
  maxSide: number,
): MapRenderSize => {
  const longest = Math.max(doc.widthPx, doc.heightPx);
  const limit = Math.max(1, maxSide);
  const scale = Math.min(1, limit / longest);
  return {
    width: Math.max(1, Math.round(doc.widthPx * scale)),
    height: Math.max(1, Math.round(doc.heightPx * scale)),
    scale,
  };
};

const imageCommand = (
  imageId: string,
  geometry: {
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
  },
): MapImageCommand => ({
  kind: 'image',
  imageId,
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
});

const backgroundCommands = (
  doc: MapDocument,
  assets: MapRenderAssets,
): MapDrawCommand[] => {
  const layer = backgroundLayer(doc);
  const commands: MapDrawCommand[] = [{ kind: 'background', color: doc.backgroundColor }];
  if (!layer.visible || layer.imageAssetId === null || assets.background === null) {
    return commands;
  }
  const transform = layer.imageTransform;
  const image = assets.background;
  commands.push(imageCommand('background', {
    x: transform.x,
    y: transform.y,
    width: image.width * transform.scale,
    height: image.height * transform.scale,
    offsetX: 0,
    offsetY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: layer.opacity,
  }));
  return commands;
};

const graphicCommands = (
  doc: MapDocument,
  assets: MapRenderAssets,
): MapDrawCommand[] => {
  const layer = graphicsLayer(doc);
  if (!layer.visible) {
    return [];
  }
  // Le immagini sono per asset: grafiche che condividono l'asset condividono
  // l'esito del caricamento. La prima voce risolve l'asset, le successive
  // restano coerenti anche se la lista arriva da un caricamento parziale.
  const images = new Map<string, MapRenderImage | null>();
  for (const entry of assets.graphics) {
    const assetId = entry.item.assetId;
    if (!images.has(assetId)) {
      images.set(assetId, entry.image);
    }
  }
  const commands: MapDrawCommand[] = [];
  for (const item of sortedGraphics(layer.items)) {
    const image = images.get(item.assetId);
    if (image === undefined || image === null) {
      continue;
    }
    const geometry = graphicNodeGeometry(item, { width: image.width, height: image.height });
    commands.push(imageCommand(item.id, {
      ...geometry,
      opacity: geometry.opacity * layer.opacity,
    }));
  }
  return commands;
};

const constraintCommands = (doc: MapDocument): MapDrawCommand[] => {
  const layer = constraintsLayer(doc);
  if (!layer.visible) {
    return [];
  }
  const { cellSizePx, offsetX, offsetY } = doc.grid;
  const commands: MapDrawCommand[] = [];
  for (const item of layer.items) {
    if ('kind' in item) {
      commands.push({
        kind: 'line',
        points: [
          offsetX + item.a.x * cellSizePx,
          offsetY + item.a.y * cellSizePx,
          offsetX + item.b.x * cellSizePx,
          offsetY + item.b.y * cellSizePx,
        ],
        stroke: WALL_STROKE,
        strokeWidth: 2,
      });
      continue;
    }
    if (item.shape === 'rect') {
      commands.push({
        kind: 'rect',
        ...blockedAreaRect(item, cellSizePx, offsetX, offsetY),
        fill: BLOCKED_AREA_FILL,
        stroke: BLOCKED_AREA_STROKE,
        strokeWidth: 2,
      });
      continue;
    }
    commands.push({
      kind: 'polygon',
      points: blockedAreaPoints(item, cellSizePx, offsetX, offsetY),
      fill: BLOCKED_AREA_FILL,
      stroke: BLOCKED_AREA_STROKE,
      strokeWidth: 2,
    });
  }
  return commands;
};

const markerColor = (element: MapElement): string => {
  switch (element.type) {
    case 'light':
      return element.color;
    case 'spawn':
      return SPAWN_COLOR;
    case 'start':
      return START_COLOR;
    case 'loot':
      return LOOT_COLOR;
  }
};

const markerRadius = (element: MapElement, cellSizePx: number): number => {
  switch (element.type) {
    case 'light':
      return Math.max(1, cellSizePx * LIGHT_RADIUS_RATIO);
    case 'spawn':
      return Math.max(1, (element.size * cellSizePx) / 2);
    case 'start':
      return Math.max(1, cellSizePx * START_RADIUS_RATIO);
    case 'loot':
      return Math.max(1, cellSizePx * LOOT_RADIUS_RATIO);
  }
};

const isVisibleElement = (element: MapElement): boolean => {
  if (element.type === 'spawn') {
    return !element.hidden;
  }
  if (element.type === 'loot') {
    return element.visible;
  }
  return true;
};

const elementCommands = (doc: MapDocument): MapDrawCommand[] => {
  const layer = elementsLayer(doc);
  if (!layer.visible) {
    return [];
  }
  const { cellSizePx, offsetX, offsetY } = doc.grid;
  return layer.items.filter(isVisibleElement).map((element) => ({
    kind: 'marker' as const,
    x: offsetX + (element.x + 0.5) * cellSizePx,
    y: offsetY + (element.y + 0.5) * cellSizePx,
    radius: markerRadius(element, cellSizePx),
    fill: markerColor(element),
    stroke: MARKER_STROKE,
    strokeWidth: 1,
  }));
};

/**
 * Traduce il documento in comandi di disegno indipendenti dal contesto canvas.
 * Il composito contiene solo sfondo e grafiche; la thumbnail aggiunge vincoli
 * ed elementi senza griglia, handle o testi di UI.
 */
export const mapDrawCommands = (
  doc: MapDocument,
  assets: MapRenderAssets,
  options: MapRenderOptions,
): MapDrawCommand[] => {
  const commands = [
    ...backgroundCommands(doc, assets),
    ...graphicCommands(doc, assets),
  ];
  if (options.variant === 'thumbnail') {
    commands.push(...constraintCommands(doc), ...elementCommands(doc));
  }
  return commands;
};
