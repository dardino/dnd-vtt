import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import Konva from 'konva';
import {
  cellCenterPx,
  defaultBackgroundTransform,
  distanceToSegment,
  latticePointPx,
  pixelToCell,
  wallSegmentPx,
  type BackgroundTransform,
  type CellPoint,
  type GridConfig,
  type MapSpawn,
  type MapView,
  type PlayerStart,
  type Terrain,
  type WallKind,
  type WallPoint,
  type WallSegment,
} from '@dnd-vtt/shared';
import { canvasKeyboardCommand } from '../../core/canvas-keyboard';
import { MeasurementService } from '../../core/measurement.service';
import { readThemeColors, type CssColorTokens } from '../../core/theme-colors';
import { MapGridRenderer } from './map-grid-renderer';

const EDITOR_COLOR_TOKENS = {
  wall: { variable: '--editor-wall', fallback: '#e8dcc4' },
  door: { variable: '--editor-door', fallback: '#d2a94a' },
  window: { variable: '--editor-window', fallback: '#78c6e0' },
  lowWall: { variable: '--editor-low-wall', fallback: '#a89f91' },
  select: { variable: '--editor-draft', fallback: '#4ea1ff' },
  warning: { variable: '--editor-warning', fallback: '#ff9f43' },
  text: { variable: '--editor-text', fallback: '#eaf4ff' },
  stroke: { variable: '--editor-stroke', fallback: '#0f1c2e' },
  background: { variable: '--editor-bg', fallback: '#111' },
} as const satisfies CssColorTokens;

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

const EDITOR_TOOL_LABELS: Record<EditorTool, string> = {
  select: 'selezione',
  wall: 'muro',
  freehand: 'mano libera',
  door: 'porta',
  window: 'finestra',
  lowWall: 'muretto',
  eraser: 'gomma',
  light: 'luce',
  spawn: 'mostro',
  start: 'punto di partenza',
};

export interface EditorSelection {
  type: 'wall' | 'light' | 'spawn' | 'start';
  id: string;
}

export interface EditorMapImage {
  url: string;
  width: number;
  height: number;
}

export type WallDraft = Omit<WallSegment, 'id'> & { id?: string };

export interface WallsDrawnEvent {
  walls: WallDraft[];
}

interface Camera {
  scale: number;
  x: number;
  y: number;
}

@Component({
  selector: 'app-map-editor-canvas',
  templateUrl: './map-editor-canvas.component.html',
  styleUrl: './map-editor-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapEditorCanvasComponent implements OnDestroy {
  public readonly image = input<EditorMapImage | null>(null);
  public readonly backgroundTransform = input<BackgroundTransform>(defaultBackgroundTransform);
  public readonly grid = input.required<GridConfig>();
  public readonly terrain = input.required<Terrain>();
  public readonly spawns = input<MapSpawn[]>([]);
  public readonly playerStarts = input<PlayerStart[]>([]);
  public readonly tool = input<EditorTool>('select');
  public readonly selected = input<EditorSelection | null>(null);
  public readonly startView = input<MapView | null>(null);
  public readonly showGrid = input(true);

  public readonly wallsDrawn = output<WallsDrawnEvent>();
  public readonly wallRemoved = output<string>();
  public readonly lightPlaced = output<CellPoint>();
  public readonly spawnRequested = output<CellPoint>();
  public readonly startPlaced = output<CellPoint>();
  public readonly elementMoved = output<{ selection: EditorSelection; cell: CellPoint }>();
  public readonly elementSelected = output<EditorSelection | null>();
  public readonly cameraChanged = output<Camera>();
  public readonly gridLines = signal(0);
  public readonly ariaLabel = computed(() =>
    `Editor mappa, strumento ${EDITOR_TOOL_LABELS[this.tool()]}. `
    + 'Frecce per spostare la vista, + e - per lo zoom, Esc per deselezionare.');

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly units = inject(MeasurementService);
  private readonly gridRenderer = new MapGridRenderer();
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
  private wallStart: WallPoint | null = null;
  private wallCurrent: WallPoint | null = null;
  private wallDraftKind: WallKind | null = null;
  private freehand: Array<{ x: number; y: number }> | null = null;
  private erasing = false;
  private erased = new Set<string>();
  private lastTool: EditorTool | null = null;
  private loadedImage: { url: string; element: HTMLImageElement } | null = null;
  private lastImageUrl: string | null = null;
  private panning: { clientX: number; clientY: number; stageX: number; stageY: number } | null = null;
  private renderFrame: number | null = null;

  public constructor() {
    effect(() => {
      this.image();
      this.backgroundTransform();
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
    if (this.renderFrame !== null) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
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
    this.zoomAt(event.evt.deltaY < 0 ? 1.1 : 1 / 1.1, pointer);
  }

  /** Zoom ancorato a un punto schermo, con limiti relativi al fit. */
  private zoomAt(factor: number, anchor: { x: number; y: number }): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const oldScale = stage.scaleX();
    const fit = Math.max(0.0001, this.fitScale());
    const newScale = Math.max(fit * 0.1, Math.min(fit * 20, oldScale * factor));
    const world = {
      x: (anchor.x - stage.x()) / oldScale,
      y: (anchor.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: anchor.x - world.x * newScale,
      y: anchor.y - world.y * newScale,
    });
    this.publishCamera();
    this.scheduleRender();
  }

  /**
   * Scorciatoie da tastiera: pan, zoom e deselezione. `Delete` resta fuori:
   * la rimozione passa da `removeSelected()` nella pagina, che la applica in
   * modo confermabile/annullabile tramite la cronologia comandi.
   */
  public onKeyDown(event: KeyboardEvent): void {
    const command = canvasKeyboardCommand(event);
    if (command === null) {
      return;
    }
    event.preventDefault();
    if (command.type === 'deselect') {
      this.elementSelected.emit(null);
      return;
    }
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    if (command.type === 'zoom') {
      this.zoomAt(command.factor, { x: stage.width() / 2, y: stage.height() / 2 });
      return;
    }
    stage.position({
      x: stage.x() + command.dx,
      y: stage.y() + command.dy,
    });
    this.publishCamera();
    this.scheduleRender();
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
    const world = this.worldPoint(pointer);
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
    if (tool === 'eraser') {
      this.erasing = true;
      this.erased.clear();
      this.eraseAt(world);
      return;
    }
    if (tool === 'freehand') {
      this.freehand = [world];
      this.renderOverlay();
      return;
    }
    const point = this.nearestLatticePoint(world);
    this.wallStart = point;
    this.wallCurrent = point;
    this.wallDraftKind = tool;
    this.renderOverlay();
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
      this.scheduleRender();
      return;
    }
    const pointer = stage.getPointerPosition();
    if (pointer === null) {
      return;
    }
    const world = this.worldPoint(pointer);
    if (this.erasing) {
      this.eraseAt(world);
      return;
    }
    if (this.freehand !== null) {
      this.freehand.push(world);
      this.renderOverlay();
      return;
    }
    if (this.wallDraftKind !== null) {
      this.wallCurrent = this.nearestLatticePoint(world);
      this.renderOverlay();
    }
  }

  private onPointerUp(): void {
    if (this.panning !== null) {
      this.panning = null;
      return;
    }
    if (this.erasing) {
      this.erasing = false;
      this.erased.clear();
      return;
    }
    if (this.freehand !== null) {
      const traces = this.freehand;
      this.freehand = null;
      const walls = this.wallsFromTrace(traces);
      if (walls.length > 0) {
        this.wallsDrawn.emit({ walls });
      }
      this.renderAll();
      return;
    }
    if (this.wallDraftKind !== null) {
      const start = this.wallStart;
      const current = this.wallCurrent;
      const kind = this.wallDraftKind;
      this.wallStart = null;
      this.wallCurrent = null;
      this.wallDraftKind = null;
      if (
        start !== null
        && current !== null
        && (start.x !== current.x || start.y !== current.y)
      ) {
        this.wallsDrawn.emit({
          walls: [{ a: start, b: current, kind, ...(kind === 'door' ? { door: 'closed' } : {}) }],
        });
      }
      this.renderAll();
    }
  }

  private worldPoint(pointer: { x: number; y: number }): { x: number; y: number } {
    const stage = this.stage;
    if (stage === null) {
      return { x: 0, y: 0 };
    }
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  }

  private nearestLatticePoint(world: { x: number; y: number }): WallPoint {
    const grid = this.grid();
    return {
      x: Math.round((world.x - grid.offsetX) / grid.cellSizePx),
      y: Math.round((world.y - grid.offsetY) / grid.cellSizePx),
    };
  }

  private wallsFromTrace(points: Array<{ x: number; y: number }>): WallDraft[] {
    const grid = this.grid();
    const lattice = points
      .map((point) => ({
        x: (point.x - grid.offsetX) / grid.cellSizePx,
        y: (point.y - grid.offsetY) / grid.cellSizePx,
      }))
      .filter((point, index, all) => {
        const previous = all[index - 1];
        return previous === undefined || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.08;
      });
    return lattice.slice(1).map((point, index) => ({
      a: lattice[index] as WallPoint,
      b: point,
      kind: 'wall' as const,
    }));
  }

  private eraseAt(world: { x: number; y: number }): void {
    const grid = this.grid();
    const threshold = Math.max(8, grid.cellSizePx * 0.18);
    const wall = this.terrain().walls.find((entry) => {
      if (this.erased.has(entry.id)) {
        return false;
      }
      const segment = wallSegmentPx(grid, entry);
      return distanceToSegment(world, segment.a, segment.b) <= threshold;
    });
    if (wall === undefined) {
      return;
    }
    this.erased.add(wall.id);
    this.wallRemoved.emit(wall.id);
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
    const wall = this.terrain().walls.find((entry) => {
      const segment = wallSegmentPx(grid, entry);
      const distance = distanceToSegment(world, segment.a, segment.b);
      return distance <= Math.max(6, grid.cellSizePx * 0.12);
    });
    this.elementSelected.emit(wall === undefined ? null : { type: 'wall', id: wall.id });
  }

  private scheduleRender(): void {
    if (this.renderFrame !== null) {
      return;
    }
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      this.renderCameraFrame();
    });
  }

  /**
   * Frame di wheel/pan: lo stage ha già trasformato lo sfondo e gli overlay,
   * quindi ridisegna solo la griglia (spessore dipendente dalla scala) e la
   * bozza attiva, i cui handle/testo compensano la scala.
   */
  private renderCameraFrame(): void {
    this.renderGrid();
    if (this.wallDraftKind !== null || this.freehand !== null) {
      this.renderOverlay();
    }
  }

  /**
   * Ridisegna scena e overlay: è il percorso dei cambi strutturali (documento,
   * selezione, strumento), del resize e dell'immagine.
   */
  private renderAll(): void {
    if (this.renderScene()) {
      this.renderOverlays();
    }
  }

  /**
   * Sfondo, tile/LOD e griglia. Restituisce `false` quando delega il primo
   * render a `fit()`, che a sua volta richiama `renderAll`.
   */
  private renderScene(): boolean {
    if (this.tool() !== this.lastTool) {
      this.lastTool = this.tool();
      this.wallStart = null;
      this.wallCurrent = null;
      this.wallDraftKind = null;
      this.freehand = null;
      this.erasing = false;
      this.erased.clear();
    }
    const url = this.image()?.url ?? null;
    if (url !== this.lastImageUrl) {
      this.lastImageUrl = url;
      this.fitted = false;
    }
    if (!this.fitted && this.image() !== null) {
      this.fit();
      return false;
    }
    this.renderMap();
    this.renderGrid();
    return true;
  }

  /** Muri, luci, spawn, start e bozze: cambiano solo su input strutturali. */
  private renderOverlays(): void {
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
      this.drawBackground(layer, image, this.loadedImage.element);
      return;
    }
    const element = new Image();
    element.onload = () => {
      this.loadedImage = { url: image.url, element };
      this.renderMap();
    };
    element.src = image.url;
  }

  /**
   * Anteprima identica al canvas di scena: x/y/scale dallo sfondo, dimensioni
   * native dell'asset e ritaglio sul rettangolo della mappa.
   */
  private drawBackground(
    layer: Konva.Layer,
    image: EditorMapImage,
    element: HTMLImageElement,
  ): void {
    const transform = this.backgroundTransform();
    const imageWidth = element.naturalWidth > 0 ? element.naturalWidth : image.width;
    const imageHeight = element.naturalHeight > 0 ? element.naturalHeight : image.height;
    layer.destroyChildren();
    const clipped = new Konva.Group({
      listening: false,
      clip: { x: 0, y: 0, width: image.width, height: image.height },
    });
    clipped.add(new Konva.Image({
      image: element,
      x: transform.x,
      y: transform.y,
      width: imageWidth * transform.scale,
      height: imageHeight * transform.scale,
      listening: false,
    }));
    layer.add(clipped);
    layer.draw();
  }

  private renderGrid(): void {
    const layer = this.gridLayer;
    if (layer === null) {
      return;
    }
    this.gridLines.set(this.gridRenderer.render({
      layer,
      grid: this.grid(),
      visible: this.showGrid(),
      scale: this.stage?.scaleX() ?? 1,
      image: this.image(),
    }));
  }

  private renderWalls(): void {
    const layer = this.wallLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.grid();
    const selected = this.selected();
    const colors = this.colors();
    for (const wall of this.terrain().walls) {
      const segment = wallSegmentPx(grid, wall);
      const color = colors[wall.kind];
      const isSelected = selected?.type === 'wall' && selected.id === wall.id;
      layer.add(new Konva.Line({
        points: [segment.a.x, segment.a.y, segment.b.x, segment.b.y],
        stroke: isSelected ? colors.select : color,
        strokeWidth: isSelected ? 7 : 5,
        strokeScaleEnabled: false,
        lineCap: 'round',
        ...(wall.kind === 'window' || wall.kind === 'lowWall' ? { dash: [8, 6] } : {}),
        opacity: wall.kind === 'door' && wall.door === 'open' ? 0.35 : 1,
        perfectDrawEnabled: false,
        listening: false,
      }));
      if (wall.kind === 'door') {
        layer.add(new Konva.Circle({
          x: (segment.a.x + segment.b.x) / 2,
          y: (segment.a.y + segment.b.y) / 2,
          radius: 5,
          fill: wall.door === 'secret' ? colors.secret : color,
          stroke: colors.stroke,
          strokeWidth: 1,
          strokeScaleEnabled: false,
          perfectDrawEnabled: false,
          listening: false,
        }));
      }
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
    const colors = this.colors();
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
          perfectDrawEnabled: false,
          listening: false,
        })
        : new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: dimRadius,
          fill: light.color,
          opacity: light.enabled ? 0.12 : 0.04,
          perfectDrawEnabled: false,
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
          perfectDrawEnabled: false,
          listening: false,
        })
        : new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: brightRadius,
          fill: light.color,
          opacity: light.enabled ? 0.18 : 0.05,
          perfectDrawEnabled: false,
          listening: false,
        }));
      layer.add(new Konva.Circle({
        x: center.x,
        y: center.y,
        radius: 7,
        fill: selected?.type === 'light' && selected.id === light.id ? colors.select : light.color,
        stroke: colors.stroke,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        perfectDrawEnabled: false,
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
    const colors = this.colors();
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
        fill: spawn.hidden ? colors.spawnHidden : colors.spawn,
        stroke: selected?.type === 'spawn' && selected.id === spawn.id ? colors.select : colors.text,
        strokeWidth: selected?.type === 'spawn' && selected.id === spawn.id ? 4 : 2,
        strokeScaleEnabled: false,
        perfectDrawEnabled: false,
      }));
      group.add(new Konva.Text({
        text: spawn.label ?? spawn.source.type,
        x: -size / 2,
        y: -6,
        width: size,
        align: 'center',
        fontSize: 12,
        fill: colors.text,
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
        fill: colors.start,
        stroke: selected?.type === 'start' && selected.id === start.id ? colors.select : colors.text,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        perfectDrawEnabled: false,
      }));
      group.add(new Konva.Text({
        text: start.label ?? 'PG',
        x: -grid.cellSizePx * 0.3,
        y: -6,
        width: grid.cellSizePx * 0.6,
        align: 'center',
        fontSize: 11,
        fill: colors.text,
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
    const colors = this.colors();
    const view = this.startView();
    if (view !== null) {
      layer.add(new Konva.Circle({
        x: view.x,
        y: view.y,
        radius: 12,
        stroke: colors.warning,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        dash: [4, 4],
        listening: false,
      }));
      layer.add(new Konva.Line({
        points: [view.x - 20, view.y, view.x + 20, view.y],
        stroke: colors.warning,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        listening: false,
      }));
      layer.add(new Konva.Line({
        points: [view.x, view.y - 20, view.x, view.y + 20],
        stroke: colors.warning,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        listening: false,
      }));
    }
    if (this.freehand !== null && this.freehand.length > 1) {
      layer.add(new Konva.Line({
        points: this.freehand.flatMap((point) => [point.x, point.y]),
        stroke: colors.select,
        strokeWidth: 3,
        strokeScaleEnabled: false,
        lineCap: 'round',
        lineJoin: 'round',
        opacity: 0.85,
        perfectDrawEnabled: false,
        listening: false,
      }));
    }
    if (
      this.wallStart !== null
      && this.wallCurrent !== null
      && this.wallDraftKind !== null
      && (this.wallStart.x !== this.wallCurrent.x || this.wallStart.y !== this.wallCurrent.y)
    ) {
      const grid = this.grid();
      const a = latticePointPx(grid, this.wallStart);
      const b = latticePointPx(grid, this.wallCurrent);
      const scale = this.stage?.scaleX() ?? 1;
      layer.add(new Konva.Line({
        points: [a.x, a.y, b.x, b.y],
        stroke: colors.select,
        strokeWidth: 3,
        strokeScaleEnabled: false,
        lineCap: 'round',
        dash: [10, 6],
        listening: false,
      }));
      for (const point of [a, b]) {
        layer.add(new Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 6 / Math.max(scale, 0.05),
          fill: colors.select,
          stroke: colors.stroke,
          strokeWidth: 2,
          strokeScaleEnabled: false,
          perfectDrawEnabled: false,
          listening: false,
        }));
      }
      const cells = Math.hypot(
        this.wallCurrent.x - this.wallStart.x,
        this.wallCurrent.y - this.wallStart.y,
      );
      const feet = cells * grid.feetPerCell;
      layer.add(new Konva.Text({
        x: (a.x + b.x) / 2 + 10 / Math.max(scale, 0.05),
        y: (a.y + b.y) / 2 - 18 / Math.max(scale, 0.05),
        text: `${this.units.formatDistance(feet)} · ${cells.toFixed(1)} celle`,
        fontSize: 14 / Math.max(scale, 0.05),
        fill: colors.text,
        stroke: colors.stroke,
        strokeWidth: 3 / Math.max(scale, 0.05),
        fillAfterStrokeEnabled: true,
        listening: false,
      }));
    }
    layer.draw();
  }

  private colors(): Record<
    | WallKind
    | 'select'
    | 'text'
    | 'stroke'
    | 'warning'
    | 'spawn'
    | 'spawnHidden'
    | 'start'
    | 'background'
    | 'secret',
    string
  > {
    return {
      ...readThemeColors(this.container().nativeElement, EDITOR_COLOR_TOKENS),
      spawn: 'rgba(80, 140, 220, 0.65)',
      spawnHidden: 'rgba(160, 60, 60, 0.65)',
      start: 'rgba(80, 200, 120, 0.7)',
      secret: '#9b59b6',
    };
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
