import Konva from 'konva';
import {
  HEX_ROW_RATIO,
  cellCenterPx,
  type GridConfig,
} from '@dnd-vtt/shared';

/** Trasformazione dello stage: scala e traslazione in pixel schermo. */
export interface GridCamera {
  scale: number;
  x: number;
  y: number;
}

/** Dimensioni in pixel schermo dello stage. */
export interface GridViewport {
  width: number;
  height: number;
}

/** Dimensioni in pixel mappa dell'immagine di sfondo, se presente. */
export interface GridMapBounds {
  width: number;
  height: number;
}

export interface GridRenderParams {
  readonly layer: Konva.Layer;
  readonly grid: GridConfig;
  readonly visible: boolean;
  readonly color: string;
  readonly camera: GridCamera;
  readonly viewport: GridViewport;
  readonly map: GridMapBounds | null;
}

interface WorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Disegna le linee della griglia su un layer Konva dedicato. Il componente
 * conserva stage, layer e orchestrazione: qui arriva solo ciò che serve al
 * disegno (griglia, camera, clip della mappa).
 */
export class GridRenderer {
  public render(params: GridRenderParams): void {
    const { layer, grid, visible, color, camera, map } = params;
    layer.destroyChildren();
    if (!visible) {
      layer.draw();
      return;
    }
    const bounds = worldBounds(params);
    const shape = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => {
        context.beginPath();
        if (grid.type === 'square') {
          drawSquareGrid(context, grid, bounds);
        } else {
          drawHexGrid(context, grid, bounds);
        }
        context.strokeShape(shape);
      },
      stroke: color,
      strokeWidth: Math.max(0.5, 1 / camera.scale),
      opacity: 0.65,
    });
    layer.clip(map === null
      ? { x: 0, y: 0, width: 0, height: 0 }
      : { x: 0, y: 0, width: map.width, height: map.height });
    layer.add(shape);
    layer.draw();
  }
}

/**
 * Porzione di mondo visibile, limitata alla mappa quando esiste. Lo zoom è
 * sempre relativo al fit, quindi una griglia lontana dal bordo non deve
 * generare linee fuori dall'immagine.
 */
const worldBounds = ({ camera, viewport, map }: GridRenderParams): WorldBounds => {
  const left = Math.max(0, -camera.x / camera.scale);
  const top = Math.max(0, -camera.y / camera.scale);
  const right = Math.min(
    map?.width ?? Number.POSITIVE_INFINITY,
    left + viewport.width / camera.scale,
  );
  const bottom = Math.min(
    map?.height ?? Number.POSITIVE_INFINITY,
    top + viewport.height / camera.scale,
  );
  return { left, top, right, bottom };
};

const drawSquareGrid = (
  context: Konva.Context,
  grid: GridConfig,
  { left, top, right, bottom }: WorldBounds,
): void => {
  const startColumn = Math.floor((left - grid.offsetX) / grid.cellSizePx);
  const endColumn = Math.ceil((right - grid.offsetX) / grid.cellSizePx);
  const startRow = Math.floor((top - grid.offsetY) / grid.cellSizePx);
  const endRow = Math.ceil((bottom - grid.offsetY) / grid.cellSizePx);
  for (let column = startColumn; column <= endColumn; column += 1) {
    const x = grid.offsetX + column * grid.cellSizePx;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (let row = startRow; row <= endRow; row += 1) {
    const y = grid.offsetY + row * grid.cellSizePx;
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
};

const drawHexGrid = (
  context: Konva.Context,
  grid: GridConfig,
  { left, top, right, bottom }: WorldBounds,
): void => {
  const rowStep = grid.cellSizePx * HEX_ROW_RATIO;
  const startRow = Math.floor((top - grid.offsetY) / rowStep) - 1;
  const endRow = Math.ceil((bottom - grid.offsetY) / rowStep) + 1;
  const startColumn = Math.floor((left - grid.offsetX) / grid.cellSizePx) - 1;
  const endColumn = Math.ceil((right - grid.offsetX) / grid.cellSizePx) + 1;
  if ((endColumn - startColumn) * (endRow - startRow) > 30_000) {
    return;
  }
  const radius = grid.cellSizePx / Math.sqrt(3);
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const center = cellCenterPx(grid, { x: column, y: row });
      for (let corner = 0; corner < 6; corner += 1) {
        const angle = Math.PI / 180 * (60 * corner - 30);
        const x = center.x + radius * Math.cos(angle);
        const y = center.y + radius * Math.sin(angle);
        if (corner === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();
    }
  }
};
