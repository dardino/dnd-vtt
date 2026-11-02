import Konva from 'konva';
import {
  HEX_ROW_RATIO,
  type GridConfig,
} from '@dnd-vtt/shared';

/** Dimensioni in pixel mappa dell'immagine di sfondo, se presente. */
export interface MapGridImageBounds {
  width: number;
  height: number;
}

export interface MapGridRenderParams {
  /** Layer dedicato: viene ripulito e ridisegnato a ogni render. */
  readonly layer: Konva.Layer;
  readonly grid: GridConfig;
  readonly visible: boolean;
  /** Scala dello stage, usata per mantenere lo spessore a schermo. */
  readonly scale: number;
  readonly image: MapGridImageBounds | null;
}

const GRID_STROKE = 'rgba(110, 180, 255, 0.42)';
const MAX_HEX_CELLS = 20_000;

/**
 * Disegna la griglia dell'editor come un'unica `Konva.Shape`: un solo nodo
 * invece di una linea per cella, con gli stessi offset, colori e spessore.
 * Il valore restituito è il numero di tracciati disegnati (linee o celle).
 */
export class MapGridRenderer {
  public render({ layer, grid, visible, scale, image }: MapGridRenderParams): number {
    layer.destroyChildren();
    if (!visible || image === null) {
      layer.draw();
      return 0;
    }
    const layout = grid.type === 'hex'
      ? hexLayout(grid, image)
      : squareLayout(grid, image);
    if (layout.paths === 0) {
      layer.draw();
      return 0;
    }
    const shape = new Konva.Shape({
      listening: false,
      stroke: GRID_STROKE,
      strokeWidth: Math.max(0.5, 1 / Math.max(scale, 0.05)),
      sceneFunc: (context) => {
        context.beginPath();
        if (layout.kind === 'hex') {
          drawHexGrid(context, grid, layout);
        } else {
          drawSquareGrid(context, grid, image, layout);
        }
        context.strokeShape(shape);
      },
    });
    layer.add(shape);
    layer.draw();
    return layout.paths;
  }
}

interface SquareLayout {
  kind: 'square';
  columns: number;
  rows: number;
  paths: number;
}

interface HexLayout {
  kind: 'hex';
  columns: number;
  rows: number;
  paths: number;
}

const squareLayout = (grid: GridConfig, image: MapGridImageBounds): SquareLayout => {
  const columns = image.width < grid.offsetX
    ? 0
    : Math.floor((image.width - grid.offsetX) / grid.cellSizePx) + 1;
  const rows = image.height < grid.offsetY
    ? 0
    : Math.floor((image.height - grid.offsetY) / grid.cellSizePx) + 1;
  return { kind: 'square', columns, rows, paths: columns + rows };
};

const hexLayout = (grid: GridConfig, image: MapGridImageBounds): HexLayout => {
  const rowStep = grid.cellSizePx * HEX_ROW_RATIO;
  const rows = image.height < grid.offsetY
    ? 0
    : Math.ceil((image.height - grid.offsetY) / rowStep) + 1;
  const columns = image.width < grid.offsetX
    ? 0
    : Math.ceil((image.width - grid.offsetX) / grid.cellSizePx) + 1;
  const paths = rows * columns > MAX_HEX_CELLS ? 0 : rows * columns;
  return { kind: 'hex', rows, columns, paths };
};

const drawSquareGrid = (
  context: Konva.Context,
  grid: GridConfig,
  image: MapGridImageBounds,
  { columns, rows }: SquareLayout,
): void => {
  for (let column = 0; column < columns; column += 1) {
    const x = grid.offsetX + column * grid.cellSizePx;
    context.moveTo(x, grid.offsetY);
    context.lineTo(x, image.height);
  }
  for (let row = 0; row < rows; row += 1) {
    const y = grid.offsetY + row * grid.cellSizePx;
    context.moveTo(grid.offsetX, y);
    context.lineTo(image.width, y);
  }
};

const drawHexGrid = (
  context: Konva.Context,
  grid: GridConfig,
  { rows, columns }: HexLayout,
): void => {
  const radius = grid.cellSizePx / Math.sqrt(3);
  const rowStep = grid.cellSizePx * HEX_ROW_RATIO;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const centerX = grid.offsetX
        + (column + 0.5 + (row & 1) / 2) * grid.cellSizePx;
      const centerY = grid.offsetY + (row + 0.5) * rowStep;
      for (let side = 0; side < 6; side += 1) {
        const angle = (Math.PI / 3) * side - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        if (side === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();
    }
  }
};
