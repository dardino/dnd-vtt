import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import Konva from 'konva';
import {
  HEX_ROW_RATIO,
  cellCenterPx,
  edgeMidpointPx,
  edgeSegmentPx,
  pixelToCell,
  rasterizeWallTrace,
  type CellPoint,
  type EdgeRef,
  type GridConfig,
  type MapSpawn,
  type MapView,
  type PlayerStart,
  type Terrain,
  type WallKind,
} from '@dnd-vtt/shared';

export type EditorTool
  = | 'select'
    | 'wall'
    | 'freehand'
    | 'door'
    | 'window'
    | 'lowWall'
    | 'eraser'
    | 'light'
    | 'spawn'
    | 'start';

export interface EditorSelection {
  type: 'wall' | 'light' | 'spawn' | 'start';
  id: string;
}

export interface EditorMapImage {
  url: string;
  width: number;
  height: number;
}

export interface EdgesPaintedEvent {
  edges: EdgeRef[];
  kind: WallKind | 'erase';
}

interface Camera {
  scale: number;
  x: number;
  y: number;
}

const WALL_COLORS: Record<WallKind, string> = {
  wall: '#e8dcc4',
  door: '#d2a94a',
  window: '#78c6e0',
  lowWall: '#a89f91',
};

@Component({
  selector: 'app-map-editor-canvas',
  templateUrl: './map-editor-canvas.component.html',
  styleUrl: './map-editor-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEditorCanvasComponent implements OnDestroy {
  public readonly image = input<EditorMapImage | null>(null);
  public readonly grid = input.required<GridConfig>();
  public readonly terrain = input.required<Terrain>();
  public readonly spawns = input<MapSpawn[]>([]);
  public readonly playerStarts = input<PlayerStart[]>([]);
  public readonly tool = input<EditorTool>('select');
  public readonly selected = input<EditorSelection | null>(null);
  public readonly startView = input<MapView | null>(null);
  public readonly showGrid = input(true);

  public readonly edgesPainted = output<EdgesPaintedEvent>();
  public readonly lightPlaced = output<CellPoint>();
  public readonly spawnRequested = output<CellPoint>();
  public readonly startPlaced = output<CellPoint>();
  public readonly elementMoved = output<{ selection: EditorSelection; cell: CellPoint }>();
  public readonly elementSelected = output<EditorSelection | null>();
  public readonly cameraChanged = output<Camera>();

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private stage: Konva.Stage | null = null;
  private mapLayer: Konva.Layer | null = null;
  private gridLayer: Konva.Layer | null = null;
  private wallLayer: Konva.Layer | null = null;
  private lightLayer: Konva.Layer | null = null;
  private actorLayer: Konva.Layer | null = null;
  private overlayLayer: Konva.Layer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private camera = signal<Camera>({ scale: 1, x: 0, y: 0 });
  private fitted = false;
  private draft: EdgeRef[] = [];
  private draftKind: WallKind | null = null;
  private freehand: Array<{ x: number; y: number }> | null = null;
  private loadedImage: { url: string; element: HTMLImageElement } | null = null;
  private lastImageUrl: string | null = null;
  private panning: { clientX: number; clientY: number; stageX: number; stageY: number } | null = null;

  public constructor() {
    effect(() => {
      this.image();
      this.grid();
      this.terrain();
      this.spawns();
      this.playerStarts();
      this.tool();
      this.selected();
      this.showGrid();
      this.startView();
      if (this.stage !== null) {
        this.renderAll();
      }
    });
    afterNextRender(() => this.createStage());
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
    this.stage = null;
  }

  public currentView(): MapView {
    const stage = this.stage;
    if (stage === null) {
      return { x: 0, y: 0, zoom: 1 };
    }
    const fit = this.fitScale();
    return {
      x: (stage.width() / 2 - stage.x()) / stage.scaleX(),
      y: (stage.height() / 2 - stage.y()) / stage.scaleY(),
      zoom: stage.scaleX() / fit,
    };
  }

  private createStage(): void {
    const container = this.container().nativeElement;
    const stage = new Konva.Stage({
      container,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    });
    this.stage = stage;
    this.mapLayer = new Konva.Layer({ listening: false });
    this.gridLayer = new Konva.Layer({ listening: false });
    this.wallLayer = new Konva.Layer({ listening: false });
    this.lightLayer = new Konva.Layer({ listening: false });
    this.actorLayer = new Konva.Layer();
    this.overlayLayer = new Konva.Layer({ listening: false });
    for (const layer of [
      this.mapLayer,
      this.gridLayer,
      this.wallLayer,
      this.lightLayer,
      this.actorLayer,
      this.overlayLayer,
    ]) {
      stage.add(layer);
    }
    stage.on('wheel', (event) => this.onWheel(event));
    stage.on('contextmenu', (event) => event.evt.preventDefault());
    stage.on('mousedown touchstart', (event) => this.onPointerDown(
      event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    ));
    stage.on('mousemove touchmove', (event) => this.onPointerMove(
      event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    ));
    stage.on('mouseup touchend', () => this.onPointerUp());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderAll();
    this.fit();
  }

  private resize(): void {
    const stage = this.stage;
    const container = this.container().nativeElement;
    if (stage === null) {
      return;
    }
    stage.size({
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    });
    this.fit();
  }

  private fitScale(): number {
    const stage = this.stage;
    const image = this.image();
    if (stage === null || image === null) {
      return 1;
    }
    return Math.min(stage.width() / image.width, stage.height() / image.height);
  }

  private fit(): void {
    const stage = this.stage;
    const image = this.image();
    if (stage === null || image === null) {
      return;
    }
    const scale = Math.max(0.01, this.fitScale());
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stage.width() - image.width * scale) / 2,
      y: (stage.height() - image.height * scale) / 2,
    });
    this.fitted = true;
    this.publishCamera();
    this.renderAll();
  }

  private onWheel(event: Konva.KonvaEventObject<WheelEvent>): void {
    event.evt.preventDefault();
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (pointer === null) {
      return;
    }
    const oldScale = stage.scaleX();
    const factor = event.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const fit = Math.max(0.0001, this.fitScale());
    const newScale = Math.max(fit * 0.1, Math.min(fit * 20, oldScale * factor));
    const world = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - world.x * newScale,
      y: pointer.y - world.y * newScale,
    });
    this.publishCamera();
    this.renderAll();
  }

  private onPointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    const mouse = event.evt instanceof MouseEvent ? event.evt : null;
    if (mouse !== null && (mouse.button === 2 || mouse.button === 1)) {
      const stage = this.stage;
      if (stage !== null) {
        this.panning = {
          clientX: mouse.clientX,
          clientY: mouse.clientY,
          stageX: stage.x(),
          stageY: stage.y(),
        };
      }
      return;
    }
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (pointer === null) {
      return;
    }
    const world = {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
    const tool = this.tool();
    if (tool === 'select') {
      this.selectAt(world);
      return;
    }
    if (tool === 'light' || tool === 'spawn' || tool === 'start') {
      const cell = pixelToCell(this.grid(), world);
      if (cell.x < 0 || cell.y < 0) {
        return;
      }
      if (tool === 'light') {
        this.lightPlaced.emit(cell);
      } else if (tool === 'spawn') {
        this.spawnRequested.emit(cell);
      } else {
        this.startPlaced.emit(cell);
      }
      return;
    }
    if (tool === 'freehand') {
      this.freehand = [world];
      return;
    }
    const edge = this.nearestEdge(world);
    if (edge === null) {
      return;
    }
    this.draftKind = tool === 'eraser' ? 'wall' : tool;
    this.draft = [edge];
    this.renderDraft();
  }

  private onPointerMove(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    if (this.panning !== null) {
      const mouse = event.evt instanceof MouseEvent ? event.evt : null;
      const touch = event.evt instanceof TouchEvent ? event.evt.touches[0] : undefined;
      const clientX = mouse?.clientX ?? touch?.clientX;
      const clientY = mouse?.clientY ?? touch?.clientY;
      if (clientX === undefined || clientY === undefined) {
        return;
      }
      stage.position({
        x: this.panning.stageX + (clientX - this.panning.clientX),
        y: this.panning.stageY + (clientY - this.panning.clientY),
      });
      this.publishCamera();
      this.renderAll();
      return;
    }
    if (this.freehand !== null) {
      const pointer = stage.getPointerPosition();
      if (pointer !== null) {
        this.freehand.push({
          x: (pointer.x - stage.x()) / stage.scaleX(),
          y: (pointer.y - stage.y()) / stage.scaleY(),
        });
        this.renderDraft();
      }
      return;
    }
    if (this.draftKind !== null) {
      const pointer = stage.getPointerPosition();
      if (pointer === null) {
        return;
      }
      const edge = this.nearestEdge({
        x: (pointer.x - stage.x()) / stage.scaleX(),
        y: (pointer.y - stage.y()) / stage.scaleY(),
      });
      if (edge !== null && !this.draft.some((entry) =>
        entry.x === edge.x && entry.y === edge.y && entry.dir === edge.dir)) {
        this.draft.push(edge);
        this.renderDraft();
      }
    }
  }

  private onPointerUp(): void {
    if (this.panning !== null) {
      this.panning = null;
      return;
    }
    if (this.freehand !== null) {
      const traces = this.freehand;
      this.freehand = null;
      if (traces.length >= 2) {
        this.edgesPainted.emit({
          edges: rasterizeWallTrace(traces, this.grid()),
          kind: 'wall',
        });
      }
      this.renderAll();
      return;
    }
    if (this.draftKind !== null && this.draft.length > 0) {
      this.edgesPainted.emit({
        edges: this.draft,
        kind: this.tool() === 'eraser' ? 'erase' : this.draftKind,
      });
      this.draft = [];
      this.draftKind = null;
      this.renderAll();
    }
  }

  private nearestEdge(point: { x: number; y: number }): EdgeRef | null {
    const grid = this.grid();
    const cell = grid.cellSizePx;
    const gx = (point.x - grid.offsetX) / cell;
    const gy = (point.y - grid.offsetY) / cell;
    const horizontal = {
      x: Math.max(0, Math.floor(gx)),
      y: Math.max(0, Math.round(gy)),
      dir: 'h' as const,
    };
    const vertical = {
      x: Math.max(0, Math.round(gx)),
      y: Math.max(0, Math.floor(gy)),
      dir: 'v' as const,
    };
    const horizontalDistance = Math.abs(gy - Math.round(gy));
    const verticalDistance = Math.abs(gx - Math.round(gx));
    return horizontalDistance <= verticalDistance ? horizontal : vertical;
  }

  private selectAt(world: { x: number; y: number }): void {
    const grid = this.grid();
    const cell = pixelToCell(grid, world);
    const start = this.playerStarts().find((entry) => entry.x === cell.x && entry.y === cell.y);
    if (start !== undefined) {
      this.elementSelected.emit({ type: 'start', id: start.id });
      return;
    }
    const spawn = this.spawns().find((entry) => entry.x === cell.x && entry.y === cell.y);
    if (spawn !== undefined) {
      this.elementSelected.emit({ type: 'spawn', id: spawn.id });
      return;
    }
    const light = this.terrain().lights.find((entry) =>
      Math.hypot(entry.x - cell.x, entry.y - cell.y) < 0.7);
    if (light !== undefined) {
      this.elementSelected.emit({ type: 'light', id: light.id });
      return;
    }
    const edge = this.terrain().walls.find((entry) => {
      const segment = edgeSegmentPx(grid, entry);
      const distance = distanceToSegment(world, segment.a, segment.b);
      return distance <= Math.max(6, grid.cellSizePx * 0.12);
    });
    this.elementSelected.emit(edge === undefined ? null : { type: 'wall', id: edge.id });
  }

  private renderAll(): void {
    const url = this.image()?.url ?? null;
    if (url !== this.lastImageUrl) {
      this.lastImageUrl = url;
      this.fitted = false;
    }
    if (!this.fitted && this.image() !== null) {
      this.fit();
      return;
    }
    this.renderMap();
    this.renderGrid();
    this.renderWalls();
    this.renderLights();
    this.renderActors();
    this.renderOverlay();
  }

  private renderMap(): void {
    const layer = this.mapLayer;
    if (layer === null) {
      return;
    }
    const image = this.image();
    if (image === null) {
      layer.destroyChildren();
      layer.draw();
      return;
    }
    if (this.loadedImage?.url === image.url) {
      layer.destroyChildren();
      layer.add(new Konva.Image({
        image: this.loadedImage.element,
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
        listening: false,
      }));
      layer.draw();
      return;
    }
    const element = new Image();
    element.onload = () => {
      this.loadedImage = { url: image.url, element };
      this.renderMap();
    };
    element.src = image.url;
  }

  private renderGrid(): void {
    const layer = this.gridLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.grid();
    const image = this.image();
    if (!this.showGrid() || image === null) {
      layer.draw();
      return;
    }
    if (grid.type === 'hex') {
      const radius = grid.cellSizePx / Math.sqrt(3);
      const rowStep = grid.cellSizePx * HEX_ROW_RATIO;
      const rows = Math.ceil((image.height - grid.offsetY) / rowStep);
      const columns = Math.ceil((image.width - grid.offsetX) / grid.cellSizePx);
      if (rows * columns > 20_000) {
        layer.draw();
        return;
      }
      for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
          const centerX = grid.offsetX + (column + 0.5 + (row & 1) / 2) * grid.cellSizePx;
          const centerY = grid.offsetY + (row + 0.5) * rowStep;
          const points: number[] = [];
          for (let side = 0; side < 6; side += 1) {
            const angle = (Math.PI / 3) * side - Math.PI / 2;
            points.push(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
          }
          layer.add(new Konva.Line({
            points,
            closed: true,
            stroke: 'rgba(255,255,255,0.10)',
            strokeWidth: 1,
            listening: false,
          }));
        }
      }
      layer.draw();
      return;
    }
    const cell = grid.cellSizePx;
    for (let x = grid.offsetX; x <= image.width; x += cell) {
      layer.add(new Konva.Line({
        points: [x, grid.offsetY, x, image.height],
        stroke: 'rgba(255,255,255,0.10)',
        strokeWidth: 1,
        listening: false,
      }));
    }
    for (let y = grid.offsetY; y <= image.height; y += cell) {
      layer.add(new Konva.Line({
        points: [grid.offsetX, y, image.width, y],
        stroke: 'rgba(255,255,255,0.10)',
        strokeWidth: 1,
        listening: false,
      }));
    }
    layer.draw();
  }

  private renderWalls(): void {
    const layer = this.wallLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.grid();
    const selected = this.selected();
    for (const edge of this.terrain().walls) {
      const segment = edgeSegmentPx(grid, edge);
      const color = WALL_COLORS[edge.kind];
      const isSelected = selected?.type === 'wall' && selected.id === edge.id;
      layer.add(new Konva.Line({
        points: [segment.a.x, segment.a.y, segment.b.x, segment.b.y],
        stroke: isSelected ? '#4ea1ff' : color,
        strokeWidth: isSelected ? 7 : 5,
        lineCap: 'round',
        dash: edge.kind === 'window' || edge.kind === 'lowWall' ? [8, 6] : undefined,
        opacity: edge.kind === 'door' && edge.door === 'open' ? 0.35 : 1,
        listening: false,
      }));
      if (edge.kind === 'door') {
        const midpoint = edgeMidpointPx(grid, edge);
        layer.add(new Konva.Circle({
          x: midpoint.x,
          y: midpoint.y,
          radius: 5,
          fill: edge.door === 'secret' ? '#9b59b6' : color,
          stroke: '#1b1b1b',
          strokeWidth: 1,
          listening: false,
        }));
      }
    }
    for (const edge of this.draft) {
      const segment = edgeSegmentPx(grid, edge);
      layer.add(new Konva.Line({
        points: [segment.a.x, segment.a.y, segment.b.x, segment.b.y],
        stroke: '#4ea1ff',
        strokeWidth: 6,
        opacity: 0.7,
        listening: false,
      }));
    }
    if (this.freehand !== null && this.freehand.length > 1) {
      layer.add(new Konva.Line({
        points: this.freehand.flatMap((point) => [point.x, point.y]),
        stroke: '#4ea1ff',
        strokeWidth: 4,
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.8,
        listening: false,
      }));
    }
    layer.draw();
  }

  private renderLights(): void {
    const layer = this.lightLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.grid();
    const selected = this.selected();
    for (const light of this.terrain().lights) {
      const center = cellCenterPx(grid, light);
      const brightRadius = (light.brightFeet / grid.feetPerCell) * grid.cellSizePx;
      const dimRadius = (light.dimFeet / grid.feetPerCell) * grid.cellSizePx;
      const shape = light.shape === 'cone'
        ? new Konva.Wedge({
          x: center.x,
          y: center.y,
          radius: dimRadius,
          angle: light.angle,
          rotation: light.direction ?? 0,
          fill: light.color,
          opacity: light.enabled ? 0.12 : 0.04,
          listening: false,
        })
        : new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: dimRadius,
          fill: light.color,
          opacity: light.enabled ? 0.12 : 0.04,
          listening: false,
        });
      layer.add(shape);
      layer.add(light.shape === 'cone'
        ? new Konva.Wedge({
          x: center.x,
          y: center.y,
          radius: brightRadius,
          angle: light.angle,
          rotation: light.direction ?? 0,
          fill: light.color,
          opacity: light.enabled ? 0.18 : 0.05,
          listening: false,
        })
        : new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: brightRadius,
          fill: light.color,
          opacity: light.enabled ? 0.18 : 0.05,
          listening: false,
        }));
      layer.add(new Konva.Circle({
        x: center.x,
        y: center.y,
        radius: 7,
        fill: selected?.type === 'light' && selected.id === light.id ? '#4ea1ff' : light.color,
        stroke: '#1b1b1b',
        strokeWidth: 2,
        listening: false,
      }));
    }
    layer.draw();
  }

  private renderActors(): void {
    const layer = this.actorLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.grid();
    const selected = this.selected();
    for (const spawn of this.spawns()) {
      const center = cellCenterPx(grid, { x: spawn.x, y: spawn.y });
      const size = spawn.size * grid.cellSizePx;
      const group = new Konva.Group({
        x: center.x,
        y: center.y,
        draggable: this.tool() === 'select',
      });
      group.add(new Konva.Circle({
        x: 0,
        y: 0,
        radius: size / 2,
        fill: spawn.hidden ? 'rgba(160,60,60,0.65)' : 'rgba(80,140,220,0.65)',
        stroke: selected?.type === 'spawn' && selected.id === spawn.id ? '#4ea1ff' : '#f0f0f0',
        strokeWidth: selected?.type === 'spawn' && selected.id === spawn.id ? 4 : 2,
      }));
      group.add(new Konva.Text({
        text: spawn.label ?? spawn.source.type,
        x: -size / 2,
        y: -6,
        width: size,
        align: 'center',
        fontSize: 12,
        fill: '#fff',
        listening: false,
      }));
      group.on('dragend', () => {
        const cell = pixelToCell(grid, { x: group.x(), y: group.y() });
        this.elementMoved.emit({ selection: { type: 'spawn', id: spawn.id }, cell });
      });
      layer.add(group);
    }
    for (const start of this.playerStarts()) {
      const center = cellCenterPx(grid, start);
      const group = new Konva.Group({
        x: center.x,
        y: center.y,
        draggable: this.tool() === 'select',
      });
      group.add(new Konva.Circle({
        x: 0,
        y: 0,
        radius: grid.cellSizePx * 0.3,
        fill: 'rgba(80,200,120,0.7)',
        stroke: selected?.type === 'start' && selected.id === start.id ? '#4ea1ff' : '#fff',
        strokeWidth: 2,
      }));
      group.add(new Konva.Text({
        text: start.label ?? 'PG',
        x: -grid.cellSizePx * 0.3,
        y: -6,
        width: grid.cellSizePx * 0.6,
        align: 'center',
        fontSize: 11,
        fill: '#fff',
        listening: false,
      }));
      group.on('dragend', () => {
        const cell = pixelToCell(grid, { x: group.x(), y: group.y() });
        this.elementMoved.emit({ selection: { type: 'start', id: start.id }, cell });
      });
      layer.add(group);
    }
    layer.draw();
  }

  private renderOverlay(): void {
    const layer = this.overlayLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const view = this.startView();
    if (view !== null) {
      layer.add(new Konva.Circle({
        x: view.x,
        y: view.y,
        radius: 12,
        stroke: '#ff9f43',
        strokeWidth: 2,
        dash: [4, 4],
        listening: false,
      }));
      layer.add(new Konva.Line({
        points: [view.x - 20, view.y, view.x + 20, view.y],
        stroke: '#ff9f43',
        strokeWidth: 2,
        listening: false,
      }));
      layer.add(new Konva.Line({
        points: [view.x, view.y - 20, view.x, view.y + 20],
        stroke: '#ff9f43',
        strokeWidth: 2,
        listening: false,
      }));
    }
    layer.draw();
  }

  private renderDraft(): void {
    this.renderWalls();
  }

  private publishCamera(): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    this.camera.set({ scale: stage.scaleX(), x: stage.x(), y: stage.y() });
    this.cameraChanged.emit(this.camera());
  }
}

const distanceToSegment = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + ratio * dx), point.y - (a.y + ratio * dy));
};
