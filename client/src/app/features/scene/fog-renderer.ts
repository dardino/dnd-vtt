import Konva from 'konva';
import type { FogOp, FogShape, FogState, GridConfig, VisionGrid } from '@dnd-vtt/shared';

/** Dimensioni in pixel mappa dell'immagine su cui è applicata la nebbia. */
export interface FogMapBounds {
  width: number;
  height: number;
}

export interface FogRenderParams {
  readonly layer: Konva.Layer;
  readonly map: FogMapBounds | null;
  readonly grid: GridConfig;
  readonly fog: FogState;
  readonly vision: VisionGrid | null;
  readonly opacity: number;
}

export interface FogDraftPoint {
  x: number;
  y: number;
}

/** Traccia in corso dello strumento nebbia (rettangolo o pennello). */
export interface FogDraft {
  readonly start: FogDraftPoint;
  readonly current: FogDraftPoint;
  readonly points: readonly FogDraftPoint[];
}

export type FogDraftMode = 'rect' | 'brush' | 'lasso';

export interface FogDraftRenderParams {
  readonly layer: Konva.Layer;
  readonly draft: FogDraft | null;
  readonly mode: FogDraftMode;
  readonly lasso: readonly FogDraftPoint[] | null;
  readonly accent: string;
  readonly brushRadius: number;
  readonly stageScale: number;
}

const MAX_FOG_TEXTURE = 4096;

/**
 * Disegna la nebbia di scena su un layer Konva. Il componente conserva stage,
 * calcolo della visione e orchestrazione: qui arrivano solo layer, stato della
 * nebbia e parametri di resa.
 */
export class FogRenderer {
  /** Ridisegna il layer della nebbia: base, visione a celle e operazioni. */
  public render(params: FogRenderParams): void {
    const { layer, map } = params;
    layer.destroyChildren();
    if (map === null) {
      layer.draw();
      return;
    }
    const scale = Math.min(1, MAX_FOG_TEXTURE / Math.max(map.width, map.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(map.width * scale));
    canvas.height = Math.max(1, Math.round(map.height * scale));
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }
    this.paintBase(context, canvas, params, scale);
    layer.add(new Konva.Image({
      image: canvas,
      x: 0,
      y: 0,
      width: map.width,
      height: map.height,
      opacity: params.opacity,
      listening: false,
    }));
    layer.draw();
  }

  /**
   * Aggiunge i nodi di anteprima della nebbia al layer. Non ripulisce né
   * disegna il layer: il chiamante orchestra il ciclo perché lo stesso layer
   * ospita anche le bozze dei disegni.
   */
  public renderDraft(params: FogDraftRenderParams): void {
    const { layer, draft, mode, lasso, accent, stageScale } = params;
    const scale = Math.max(stageScale, 0.1);
    const strokeWidth = Math.max(1, 2 / scale);
    const dash = [8 / scale, 6 / scale];
    if (draft !== null) {
      if (mode === 'rect') {
        layer.add(new Konva.Rect({
          x: Math.min(draft.start.x, draft.current.x),
          y: Math.min(draft.start.y, draft.current.y),
          width: Math.abs(draft.current.x - draft.start.x),
          height: Math.abs(draft.current.y - draft.start.y),
          stroke: accent,
          strokeWidth,
          dash,
          fill: accent,
          opacity: 0.2,
          listening: false,
        }));
      } else {
        layer.add(new Konva.Line({
          points: draft.points.flatMap((point) => [point.x, point.y]),
          stroke: accent,
          strokeWidth: params.brushRadius * 2,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.25,
          listening: false,
        }));
        layer.add(new Konva.Line({
          points: draft.points.flatMap((point) => [point.x, point.y]),
          stroke: accent,
          strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false,
        }));
      }
    }
    if (lasso !== null && lasso.length > 0) {
      layer.add(new Konva.Line({
        points: lasso.flatMap((point) => [point.x, point.y]),
        stroke: accent,
        strokeWidth,
        closed: lasso.length > 2,
        dash,
        listening: false,
      }));
    }
  }

  private paintBase(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    { grid, fog, vision }: FogRenderParams,
    scale: number,
  ): void {
    if (fog.override === 'hide') {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else if (fog.override === 'none' && fog.base === 'hidden') {
      // La base "rivelata" vince sulla visione automatica: la visione serve a
      // nascondere il non visto solo quando la fog parte coperta. In questo
      // modo le operazioni manuali di reveal/hide restano sempre applicabili.
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (vision !== null) {
        this.paintVision(context, { grid, vision }, scale);
      }
    }
    for (const op of fog.ops) {
      this.paintOp(context, op, grid, scale);
    }
  }

  private paintVision(
    context: CanvasRenderingContext2D,
    { grid, vision }: { grid: GridConfig; vision: VisionGrid },
    scale: number,
  ): void {
    context.globalCompositeOperation = 'destination-out';
    const cell = grid.cellSizePx * scale;
    for (let row = 0; row < vision.rows; row += 1) {
      for (let column = 0; column < vision.cols; column += 1) {
        const level = vision.levels[row * vision.cols + column] ?? 0;
        if (level === 0) {
          continue;
        }
        context.globalAlpha = level === 2 ? 1 : 0.5;
        context.fillRect(
          grid.offsetX * scale + column * cell,
          grid.offsetY * scale + row * cell,
          cell + 0.5,
          cell + 0.5,
        );
      }
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  private paintOp(
    context: CanvasRenderingContext2D,
    op: FogOp,
    grid: GridConfig,
    scale: number,
  ): void {
    context.save();
    context.globalCompositeOperation = op.op === 'reveal' ? 'destination-out' : 'source-over';
    context.filter = op.softness > 0 ? `blur(${op.softness * scale}px)` : 'none';
    context.fillStyle = '#000';
    context.strokeStyle = '#000';
    paintShape(context, op.shape, grid, scale);
    context.restore();
  }
}

const paintShape = (
  context: CanvasRenderingContext2D,
  shape: FogShape,
  grid: GridConfig,
  scale: number,
): void => {
  switch (shape.type) {
    case 'rect':
      context.fillRect(shape.x * scale, shape.y * scale, shape.width * scale, shape.height * scale);
      break;
    case 'circle':
      context.beginPath();
      context.arc(shape.cx * scale, shape.cy * scale, shape.radius * scale, 0, Math.PI * 2);
      context.fill();
      break;
    case 'polygon':
      context.beginPath();
      shape.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x * scale, point.y * scale);
        } else {
          context.lineTo(point.x * scale, point.y * scale);
        }
      });
      context.closePath();
      context.fill();
      break;
    case 'brush':
      context.lineWidth = shape.radius * 2 * scale;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      shape.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x * scale, point.y * scale);
        } else {
          context.lineTo(point.x * scale, point.y * scale);
        }
      });
      context.stroke();
      break;
    case 'cells':
      for (const cell of shape.cells) {
        context.fillRect(
          (grid.offsetX + cell.x * grid.cellSizePx) * scale,
          (grid.offsetY + cell.y * grid.cellSizePx) * scale,
          grid.cellSizePx * scale + 0.5,
          grid.cellSizePx * scale + 0.5,
        );
      }
      break;
    default:
      break;
  }
};
