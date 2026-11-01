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
  HEX_ROW_RATIO,
  TILE_SIZE_PX,
  cellCenterPx,
  newId,
  pointInPolygon,
  latticePointPx,
  gridDrawingWidth,
  lastReachableCell,
  pixelToCell,
  snapTokenCell,
  tileLevelForScale,
  tileUrl,
  tokenCenterPx,
  measureDistance,
  type CellPoint,
  type Drawing,
  type FogOp,
  type FogShape,
  type GridConfig,
  type MeasureResult,
  type PublicDoor,
  type SceneState,
  type TokenState,
  type Viewport,
  type VisionGrid,
} from '@dnd-vtt/shared';
import { MeasurementService } from '../../core/measurement.service';

export type SceneTool
  = | 'select'
    | 'measure'
    | 'fog-reveal'
    | 'fog-hide'
    | 'fog-rect'
    | 'fog-lasso'
    | 'draw';

export interface ActorPortraitThumb {
  url: string;
  focusX: number;
  focusY: number;
  zoom: number;
}

export interface SceneMapImage {
  url: string;
  previewUrl: string;
  hash: string;
  width: number;
  height: number;
  tiled: boolean;
}

export interface TokenMoveEvent {
  tokenId: string;
  x: number;
  y: number;
  force?: boolean;
}

export interface ActorDropEvent {
  actorId: string;
  pointX: number;
  pointY: number;
}

interface Camera {
  scale: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

// Lo zoom è sempre relativo al fit: un'immagine piccola su uno schermo grande
// produce un fitScale alto e non deve esaurire il margine di ingrandimento.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const MIN_SCALE = 0.01;
const VIEW_PADDING = 48;
const IDLE_MS = 160;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

@Component({
  selector: 'app-scene-canvas',
  templateUrl: './scene-canvas.component.html',
  styleUrl: './scene-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneCanvasComponent implements OnDestroy {
  public readonly map = input<SceneMapImage | null>(null);
  public readonly state = input.required<SceneState>();
  public readonly selectedTokenId = input<string | null>(null);
  public readonly tool = input<SceneTool>('select');
  public readonly gridVisible = input(true);
  public readonly readOnly = input(false);
  public readonly fogSoftness = input(0);
  public readonly brushRadius = input(150);
  public readonly drawingWidthPx = input<number | null>(null);
  public readonly actorPortraits = input<Record<string, ActorPortraitThumb>>({});
  public readonly tokenPortraits = input<Record<string, ActorPortraitThumb>>({});
  public readonly viewport = input<Viewport | null>(null);
  public readonly vision = input<VisionGrid | null>(null);
  public readonly doors = input<PublicDoor[]>([]);
  public readonly fogSnap = input(false);
  public readonly fogOpacity = input(0.5);

  public readonly tokenMoved = output<TokenMoveEvent>();
  public readonly tokenSelected = output<string | null>();
  public readonly actorDropped = output<ActorDropEvent>();
  public readonly measured = output<MeasureResult | null>();
  public readonly fogApplied = output<FogOp>();
  public readonly drawingAdded = output<Drawing>();
  public readonly cameraChanged = output<Camera>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly units = inject(MeasurementService);

  public readonly camera = signal<Camera>({ scale: 1, x: 0, y: 0 });
  public readonly tiled = signal(false);
  public readonly tilesReady = signal(false);
  public readonly interacting = signal(false);
  public readonly measurement = signal<MeasureResult | null>(null);
  public readonly canvasSize = signal({ width: 0, height: 0 });

  public readonly statusLabel = computed(() => {
    const measure = this.measurement();
    return measure === null
      ? ''
      : `${this.units.formatDistance(measure.feet)} · ${measure.cells} celle`;
  });

  private stage: Konva.Stage | null = null;
  private mapLayer: Konva.Layer | null = null;
  private gridLayer: Konva.Layer | null = null;
  private doorLayer: Konva.Layer | null = null;
  private fogLayer: Konva.Layer | null = null;
  private fogPreviewLayer: Konva.Layer | null = null;
  private tokenLayer: Konva.Layer | null = null;
  private drawingLayer: Konva.Layer | null = null;
  private measureLayer: Konva.Layer | null = null;
  private previewNode: Konva.Image | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeAssetId: string | null = null;
  private mapGeneration = 0;
  private lastGrid: GridConfig | null = null;
  private lastGridVisible: boolean | null = null;
  private lastMapHash: string | null = null;
  private lastFog: SceneState['fog'] | null = null;
  private lastVision: VisionGrid | null | undefined = undefined;
  private lastDoors: PublicDoor[] | null = null;
  private lastDrawings: Drawing[] | null = null;
  private lastTool: string | null = null;
  private fogDraft: { start: Point; current: Point; points: Point[] } | null = null;
  private drawingDraft: Point[] | null = null;
  private lassoPoints: Point[] | null = null;
  private draggingMeasure = false;
  private rightPan: { stageX: number; stageY: number; pointerX: number; pointerY: number } | null = null;
  private loadingImages = new Map<string, Promise<HTMLImageElement>>();
  private portraitImages = new Map<string, HTMLImageElement>();

  constructor() {
    effect(() => {
      this.map();
      this.state();
      this.selectedTokenId();
      this.tool();
      this.gridVisible();
      this.readOnly();
      this.actorPortraits();
      this.tokenPortraits();
      this.viewport();
      this.vision();
      this.doors();
      this.units.unit();
      if (this.stage !== null) {
        this.renderAll();
      }
    });
    effect(() => {
      const portraits = [
        ...Object.values(this.actorPortraits()),
        ...Object.values(this.tokenPortraits()),
      ];
      for (const portrait of portraits) {
        if (this.portraitImages.has(portrait.url)) {
          continue;
        }
        void this.loadImage(portrait.url).then((image) => {
          this.portraitImages.set(portrait.url, image);
          this.renderTokens();
        }).catch(() => undefined);
      }
    });
    afterNextRender(() => {
      this.createStage();
    });
  }

  public ngOnDestroy(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
    this.stage = null;
  }

  public zoomBy(factor: number): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const oldScale = stage.scaleX();
    const bounds = this.scaleBounds();
    const newScale = clamp(oldScale * factor, bounds.min, bounds.max);
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    const world = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: center.x - world.x * newScale, y: center.y - world.y * newScale });
    this.publishCamera();
    this.beginInteraction();
  }

  public fit(): void {
    const stage = this.stage;
    const map = this.map();
    if (stage === null || map === null) {
      return;
    }
    const width = Math.max(1, stage.width() - VIEW_PADDING);
    const height = Math.max(1, stage.height() - VIEW_PADDING);
    const scale = Math.max(
      Math.min(width / map.width, height / map.height),
      MIN_SCALE,
    );
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stage.width() - map.width * scale) / 2,
      y: (stage.height() - map.height * scale) / 2,
    });
    this.publishCamera();
    this.renderGrid();
    this.scheduleTiles();
  }

  /**
   * Scala dello stage che mostra l'intera mappa nello spazio disponibile.
   * È il riferimento di "100%": lo zoom salvato è sempre un multiplo di questo
   * valore, così dialog e schermo reale restano coerenti a ogni risoluzione.
   */
  private fitScale(): number {
    const stage = this.stage;
    const map = this.map();
    if (stage === null || map === null) {
      return 1;
    }
    return Math.min(stage.width() / map.width, stage.height() / map.height);
  }

  private scaleBounds(): { min: number; max: number } {
    if (this.stage === null || this.map() === null) {
      return { min: MIN_SCALE, max: 1 };
    }
    const fit = Math.max(this.fitScale(), 0.0001);
    return { min: fit * MIN_ZOOM, max: fit * MAX_ZOOM };
  }

  private applyViewportOrFit(): void {
    const viewport = this.viewport();
    const stage = this.stage;
    const map = this.map();
    if (viewport === null || stage === null || map === null) {
      this.fit();
      return;
    }
    const bounds = this.scaleBounds();
    const scale = clamp(this.fitScale() * viewport.zoom, bounds.min, bounds.max);
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: stage.width() / 2 - viewport.x * scale,
      y: stage.height() / 2 - viewport.y * scale,
    });
    this.publishCamera();
    this.renderGrid();
    this.scheduleTiles();
  }

  public focusToken(tokenId: string): void {
    const token = this.state().tokens.find((entry) => entry.id === tokenId);
    const stage = this.stage;
    if (token === undefined || stage === null) {
      return;
    }
    const center = tokenCenterPx(this.state().grid, token);
    stage.position({
      x: stage.width() / 2 - center.x * stage.scaleX(),
      y: stage.height() / 2 - center.y * stage.scaleY(),
    });
    this.publishCamera();
    this.beginInteraction();
  }

  public onDragOver(event: DragEvent): void {
    if (this.readOnly()) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  public onDrop(event: DragEvent): void {
    if (this.readOnly()) {
      return;
    }
    event.preventDefault();
    const actorId = event.dataTransfer?.getData('application/x-dnd-vtt-actor') ?? '';
    if (actorId === '') {
      return;
    }
    const point = this.worldPointFromClient(event.clientX, event.clientY);
    if (point !== null) {
      this.actorDropped.emit({ actorId, pointX: point.x, pointY: point.y });
    }
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
    this.doorLayer = new Konva.Layer({ listening: false });
    this.fogLayer = new Konva.Layer({ listening: false });
    this.fogPreviewLayer = new Konva.Layer({ listening: false });
    this.tokenLayer = new Konva.Layer();
    this.drawingLayer = new Konva.Layer({ listening: false });
    this.measureLayer = new Konva.Layer({ listening: false });
    stage.add(this.mapLayer);
    stage.add(this.gridLayer);
    stage.add(this.doorLayer);
    stage.add(this.fogLayer);
    stage.add(this.fogPreviewLayer);
    stage.add(this.tokenLayer);
    stage.add(this.drawingLayer);
    stage.add(this.measureLayer);

    stage.on('wheel', (event) => this.onWheel(event));
    stage.on('contextmenu', (event) => event.evt.preventDefault());
    stage.on('dragstart', () => this.beginInteraction());
    stage.on('dragmove', () => this.publishCamera());
    stage.on('dragend', () => this.scheduleTiles());
    stage.on('click tap', (event) => {
      if (event.target === stage) {
        this.tokenSelected.emit(null);
      }
    });
    stage.on('mousedown touchstart', (event) => {
      this.onPointerDown(event as Konva.KonvaEventObject<MouseEvent | TouchEvent>);
    });
    stage.on('dblclick dbltap', () => this.finishLasso());
    stage.on('mousemove touchmove', () => this.onPointerMove());
    stage.on('mouseup touchend', () => this.onPointerUp());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.canvasSize.set({ width: stage.width(), height: stage.height() });
    this.renderAll();
  }

  private resize(): void {
    const stage = this.stage;
    const container = this.container().nativeElement;
    if (stage === null) {
      return;
    }
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    stage.size({ width, height });
    this.canvasSize.set({ width, height });
    if (this.viewport() !== null) {
      this.applyViewportOrFit();
      return;
    }
    this.renderGrid();
    this.renderMeasure();
    this.scheduleTiles();
  }

  private renderAll(): void {
    const map = this.map();
    const stage = this.stage;
    if (stage !== null) {
      stage.draggable(this.tool() === 'select' && !this.readOnly());
    }
    if (this.tool() !== this.lastTool) {
      this.lastTool = this.tool();
      this.fogDraft = null;
      this.lassoPoints = null;
      this.drawingDraft = null;
      this.renderDraftPreview();
    }
    if (this.activeAssetId !== (map?.hash ?? null)) {
      this.loadMap(map);
    }
    const grid = this.state().grid;
    const mapHash = map?.hash ?? null;
    if (
      grid !== this.lastGrid
      || this.gridVisible() !== this.lastGridVisible
      || mapHash !== this.lastMapHash
    ) {
      this.lastGrid = grid;
      this.lastGridVisible = this.gridVisible();
      this.lastMapHash = mapHash;
      this.renderGrid();
    }
    const fog = this.state().fog;
    const vision = this.vision();
    if (fog !== this.lastFog || vision !== this.lastVision) {
      this.lastFog = fog;
      this.lastVision = vision;
      this.renderFog();
    }
    const doors = this.doors();
    if (doors !== this.lastDoors) {
      this.lastDoors = doors;
      this.renderDoors();
    }
    const drawings = this.state().drawings;
    if (drawings !== this.lastDrawings) {
      this.lastDrawings = drawings;
      this.renderDrawings();
    }
    this.renderTokens();
    this.renderMeasure();
    this.scheduleTiles();
    if (this.viewport() !== null) {
      this.applyViewportOrFit();
    }
  }

  private loadMap(map: SceneMapImage | null): void {
    this.activeAssetId = map?.hash ?? null;
    this.mapGeneration += 1;
    const generation = this.mapGeneration;
    this.mapLayer?.destroyChildren();
    this.previewNode = null;
    this.tiled.set(map?.tiled ?? false);
    this.tilesReady.set(false);
    if (map === null) {
      return;
    }
    const url = map.tiled ? map.previewUrl : map.url;
    const place = (image: HTMLImageElement): void => {
      if (generation !== this.mapGeneration || this.mapLayer === null) {
        return;
      }
      const node = new Konva.Image({
        image,
        x: 0,
        y: 0,
        width: map.width,
        height: map.height,
        listening: false,
      });
      this.mapLayer.add(node);
      if (map.tiled) {
        this.previewNode = node;
      }
      this.mapLayer.draw();
      this.applyViewportOrFit();
      this.renderFog();
      this.renderDrawings();
      this.scheduleTiles();
    };
    void this.loadImage(url)
      .then(place)
      .catch(() => {
        // Mappa precedente alla pipeline di tile: si ripiega sull'immagine intera.
        if (!map.tiled) {
          this.tilesReady.set(false);
          return;
        }
        void this.loadImage(map.url).then(place).catch(() => this.tilesReady.set(false));
      });
  }

  private onWheel(event: Konva.KonvaEventObject<WheelEvent>): void {
    event.evt.preventDefault();
    if (this.readOnly()) {
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
    const oldScale = stage.scaleX();
    const factor = event.evt.deltaY < 0 ? 1.08 : 1 / 1.08;
    const bounds = this.scaleBounds();
    const newScale = clamp(oldScale * factor, bounds.min, bounds.max);
    const world = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: pointer.x - world.x * newScale, y: pointer.y - world.y * newScale });
    this.publishCamera();
    this.beginInteraction();
  }

  private beginInteraction(): void {
    const map = this.map();
    this.interacting.set(true);
    if (map?.tiled === true && this.previewNode !== null) {
      this.previewNode.visible(true);
      this.mapLayer?.getChildren().forEach((child) => {
        if (child !== this.previewNode) {
          child.visible(false);
        }
      });
      this.tilesReady.set(false);
    }
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.interacting.set(false);
      this.renderTiles();
      this.renderGrid();
    }, IDLE_MS);
  }

  private scheduleTiles(): void {
    if (this.map()?.tiled !== true) {
      return;
    }
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.interacting.set(false);
      this.renderTiles();
      this.renderGrid();
    }, IDLE_MS);
  }

  private renderTiles(): void {
    const stage = this.stage;
    const map = this.map();
    const layer = this.mapLayer;
    if (stage === null || map === null || layer === null || map.tiled !== true) {
      return;
    }
    if (this.interacting()) {
      return;
    }
    const scale = stage.scaleX();
    const level = tileLevelForScale(scale, map.width, map.height);
    const worldLeft = Math.max(0, -stage.x() / scale);
    const worldTop = Math.max(0, -stage.y() / scale);
    const worldRight = Math.min(map.width, worldLeft + stage.width() / scale);
    const worldBottom = Math.min(map.height, worldTop + stage.height() / scale);
    const tileWorld = TILE_SIZE_PX * level.scale;
    const firstColumn = Math.max(0, Math.floor(worldLeft / tileWorld) - 1);
    const lastColumn = Math.min(level.columns - 1, Math.ceil(worldRight / tileWorld) + 1);
    const firstRow = Math.max(0, Math.floor(worldTop / tileWorld) - 1);
    const lastRow = Math.min(level.rows - 1, Math.ceil(worldBottom / tileWorld) + 1);

    for (const child of [...layer.getChildren()]) {
      if (child !== this.previewNode) {
        child.destroy();
      }
    }
    const group = new Konva.Group({ listening: false });
    layer.add(group);
    let pending = 0;
    let failed = 0;
    const generation = this.mapGeneration;
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        pending += 1;
        const url = tileUrl(map.hash, level.level, column, row);
        void this.loadImage(url)
          .then((image) => {
            if (generation !== this.mapGeneration || this.interacting()) {
              return;
            }
            const tileWidth = Math.min(level.width - column * TILE_SIZE_PX, TILE_SIZE_PX);
            const tileHeight = Math.min(level.height - row * TILE_SIZE_PX, TILE_SIZE_PX);
            group.add(new Konva.Image({
              image,
              x: column * tileWorld,
              y: row * tileWorld,
              // Un pixel di sovrapposizione evita cuciture visibili a scale frazionarie.
              width: tileWidth * level.scale + 1,
              height: tileHeight * level.scale + 1,
              listening: false,
            }));
            layer.batchDraw();
          })
          .catch(() => {
            failed += 1;
          })
          .finally(() => {
            pending -= 1;
            if (generation !== this.mapGeneration || this.interacting()) {
              return;
            }
            if (pending === 0) {
              if (failed > 0) {
                this.tilesReady.set(false);
                this.previewNode?.visible(true);
              } else {
                this.tilesReady.set(true);
                this.previewNode?.visible(false);
              }
              layer.batchDraw();
            }
          });
      }
    }
    if (pending === 0) {
      this.tilesReady.set(true);
      this.previewNode?.visible(false);
    }
  }

  private renderGrid(): void {
    const stage = this.stage;
    const layer = this.gridLayer;
    if (stage === null || layer === null) {
      return;
    }
    layer.destroyChildren();
    if (!this.gridVisible()) {
      layer.draw();
      return;
    }
    const grid = this.state().grid;
    const colors = this.colors();
    const map = this.map();
    const scale = stage.scaleX();
    const worldLeft = Math.max(0, -stage.x() / scale);
    const worldTop = Math.max(0, -stage.y() / scale);
    const worldRight = Math.min(map?.width ?? Number.POSITIVE_INFINITY, worldLeft + stage.width() / scale);
    const worldBottom = Math.min(map?.height ?? Number.POSITIVE_INFINITY, worldTop + stage.height() / scale);
    const shape = new Konva.Shape({
      listening: false,
      sceneFunc: (context) => {
        context.beginPath();
        if (grid.type === 'square') {
          this.drawSquareGrid(context, grid, worldLeft, worldTop, worldRight, worldBottom);
        } else {
          this.drawHexGrid(context, grid, worldLeft, worldTop, worldRight, worldBottom);
        }
        context.strokeShape(shape);
      },
      stroke: colors.grid,
      strokeWidth: Math.max(0.5, 1 / scale),
      opacity: 0.65,
    });
    if (map === null) {
      layer.clip({ x: 0, y: 0, width: 0, height: 0 });
    } else {
      layer.clip({ x: 0, y: 0, width: map.width, height: map.height });
    }
    layer.add(shape);
    layer.draw();
  }

  private drawSquareGrid(
    context: Konva.Context,
    grid: GridConfig,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): void {
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
  }

  private drawHexGrid(
    context: Konva.Context,
    grid: GridConfig,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): void {
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
  }

  private renderDoors(): void {
    const layer = this.doorLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.state().grid;
    for (const door of this.doors()) {
      const a = latticePointPx(grid, door.a);
      const b = latticePointPx(grid, door.b);
      const color = door.state === 'open' ? '#7fbf7f' : '#c9a227';
      if (door.state === 'open') {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) {
          continue;
        }
        const unitX = (dx / length) * Math.min(10, length / 4);
        const unitY = (dy / length) * Math.min(10, length / 4);
        layer.add(new Konva.Line({
          points: [a.x, a.y, a.x + unitX, a.y + unitY],
          stroke: color,
          strokeWidth: 4,
          lineCap: 'round',
          listening: false,
        }));
        layer.add(new Konva.Line({
          points: [b.x, b.y, b.x - unitX, b.y - unitY],
          stroke: color,
          strokeWidth: 4,
          lineCap: 'round',
          listening: false,
        }));
      } else {
        layer.add(new Konva.Line({
          points: [a.x, a.y, b.x, b.y],
          stroke: color,
          strokeWidth: 5,
          lineCap: 'round',
          listening: false,
        }));
        layer.add(new Konva.Circle({
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          radius: 4,
          fill: color,
          stroke: '#1b1b1b',
          strokeWidth: 1,
          listening: false,
        }));
      }
    }
    layer.draw();
  }

  private renderFog(): void {
    const map = this.map();
    const layer = this.fogLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    if (map === null) {
      layer.draw();
      return;
    }
    const grid = this.state().grid;
    const fog = this.state().fog;
    const vision = this.vision();
    const scale = Math.min(1, 4096 / Math.max(map.width, map.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(map.width * scale));
    canvas.height = Math.max(1, Math.round(map.height * scale));
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }
    const drawVision = vision !== null && fog.override === 'none';
    if (fog.override === 'hide') {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else if (fog.override === 'none') {
      // La base "rivelata" vince sulla visione automatica: la visione serve a
      // nascondere il non visto solo quando la fog parte coperta. In questo
      // modo le operazioni manuali di reveal/hide restano sempre applicabili.
      if (fog.base === 'hidden') {
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (vision !== null) {
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
      }
    }
    if (!drawVision || fog.override === 'none') {
      for (const op of fog.ops) {
        this.paintFogOp(context, op, scale);
      }
    }
    layer.add(new Konva.Image({
      image: canvas,
      x: 0,
      y: 0,
      width: map.width,
      height: map.height,
      opacity: this.fogOpacity(),
      listening: false,
    }));
    layer.draw();
  }

  private paintFogOp(context: CanvasRenderingContext2D, op: FogOp, scale: number): void {
    context.save();
    context.globalCompositeOperation = op.op === 'reveal' ? 'destination-out' : 'source-over';
    context.filter = op.softness > 0 ? `blur(${op.softness * scale}px)` : 'none';
    context.fillStyle = '#000';
    context.strokeStyle = '#000';
    this.paintFogShape(context, op.shape, scale);
    context.restore();
  }

  private paintFogShape(context: CanvasRenderingContext2D, shape: FogShape, scale: number): void {
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
      case 'cells': {
        const grid = this.state().grid;
        for (const cell of shape.cells) {
          context.fillRect(
            (grid.offsetX + cell.x * grid.cellSizePx) * scale,
            (grid.offsetY + cell.y * grid.cellSizePx) * scale,
            grid.cellSizePx * scale + 0.5,
            grid.cellSizePx * scale + 0.5,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  private renderDrawings(): void {
    const layer = this.drawingLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    for (const drawing of this.state().drawings) {
      if (!drawing.visible) {
        continue;
      }
      layer.add(new Konva.Line({
        points: drawing.points.flatMap((point) => [point.x, point.y]),
        stroke: drawing.color,
        strokeWidth: drawing.width,
        lineCap: 'round',
        lineJoin: 'round',
        listening: false,
      }));
    }
    layer.draw();
  }

  private renderDraftPreview(): void {
    const layer = this.fogPreviewLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const colors = this.colors();
    const scale = this.stage?.scaleX() ?? 1;
    const strokeWidth = Math.max(1, 2 / Math.max(scale, 0.1));
    if (this.fogDraft !== null) {
      const draft = this.fogDraft;
      const mode = this.fogMode();
      if (mode === 'rect') {
        const x = Math.min(draft.start.x, draft.current.x);
        const y = Math.min(draft.start.y, draft.current.y);
        layer.add(new Konva.Rect({
          x,
          y,
          width: Math.abs(draft.current.x - draft.start.x),
          height: Math.abs(draft.current.y - draft.start.y),
          stroke: colors.accent,
          strokeWidth,
          dash: [8 / Math.max(scale, 0.1), 6 / Math.max(scale, 0.1)],
          fill: colors.accent,
          opacity: 0.2,
          listening: false,
        }));
      } else {
        layer.add(new Konva.Line({
          points: draft.points.flatMap((point) => [point.x, point.y]),
          stroke: colors.accent,
          strokeWidth: this.brushRadius() * 2,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.25,
          listening: false,
        }));
        layer.add(new Konva.Line({
          points: draft.points.flatMap((point) => [point.x, point.y]),
          stroke: colors.accent,
          strokeWidth,
          lineCap: 'round',
          lineJoin: 'round',
          listening: false,
        }));
      }
    }
    if (this.lassoPoints !== null && this.lassoPoints.length > 0) {
      layer.add(new Konva.Line({
        points: this.lassoPoints.flatMap((point) => [point.x, point.y]),
        stroke: colors.accent,
        strokeWidth,
        closed: this.lassoPoints.length > 2,
        dash: [8 / Math.max(scale, 0.1), 6 / Math.max(scale, 0.1)],
        listening: false,
      }));
    }
    if (this.drawingDraft !== null) {
      layer.add(new Konva.Line({
        points: this.drawingDraft.flatMap((point) => [point.x, point.y]),
        stroke: colors.accent,
        strokeWidth: this.drawingWidth(),
        lineCap: 'round',
        lineJoin: 'round',
        listening: false,
      }));
    }
    layer.draw();
  }

  public exportPng(): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const url = stage.toDataURL({ pixelRatio: 2 });
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'scena.png';
    anchor.click();
  }

  private renderTokens(): void {
    const layer = this.tokenLayer;
    const stage = this.stage;
    if (layer === null || stage === null) {
      return;
    }
    layer.destroyChildren();
    const grid = this.state().grid;
    const scale = stage.scaleX();
    const colors = this.colors();
    const selectedId = this.selectedTokenId();
    for (const token of this.state().tokens) {
      if (!token.visible && selectedId !== token.id) {
        continue;
      }
      const group = this.buildToken(token, grid, scale, colors, selectedId === token.id);
      layer.add(group);
    }
    layer.draw();
  }

  private buildToken(
    token: TokenState,
    grid: GridConfig,
    scale: number,
    colors: Record<'text' | 'surface' | 'accent' | 'danger' | 'ok', string>,
    selected: boolean,
  ): Konva.Group {
    const center = tokenCenterPx(grid, token);
    const footprint = grid.cellSizePx * token.size;
    const group = new Konva.Group({
      x: center.x,
      y: center.y,
      draggable: this.tool() === 'select' && !this.readOnly(),
    });
    const surface = new Konva.Rect({
      x: -footprint / 2,
      y: -footprint / 2,
      width: footprint,
      height: footprint,
      cornerRadius: grid.type === 'hex' ? footprint / 2 : 6,
      fill: token.owner === 'players' ? colors.ok : colors.surface,
      stroke: selected ? colors.accent : colors.text,
      strokeWidth: (selected ? 2.5 : 1.25) / Math.max(scale, 0.2),
      opacity: token.visible ? 1 : 0.45,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowBlur: 6,
    });
    const portrait = token.actorId === undefined
      ? this.tokenPortraits()[token.id]
      : this.actorPortraits()[token.actorId];
    const portraitImage = portrait === undefined ? undefined : this.portraitImages.get(portrait.url);
    if (portrait !== undefined && portraitImage !== undefined) {
      const naturalWidth = portraitImage.naturalWidth;
      const naturalHeight = portraitImage.naturalHeight;
      const baseScale = Math.max(footprint / naturalWidth, footprint / naturalHeight);
      const imageScale = baseScale * portrait.zoom;
      const imageWidth = naturalWidth * imageScale;
      const imageHeight = naturalHeight * imageScale;
      const clip = new Konva.Group({
        opacity: token.visible ? 1 : 0.45,
        clipFunc: (context) => {
          context.beginPath();
          if (grid.type === 'hex') {
            context.arc(0, 0, footprint / 2, 0, Math.PI * 2, false);
          } else {
            context.roundRect(-footprint / 2, -footprint / 2, footprint, footprint, 6);
          }
          context.closePath();
        },
      });
      clip.add(new Konva.Image({
        image: portraitImage,
        x: -portrait.focusX * imageWidth,
        y: -portrait.focusY * imageHeight,
        width: imageWidth,
        height: imageHeight,
        listening: false,
      }));
      group.add(clip);
      group.add(new Konva.Rect({
        x: -footprint / 2,
        y: -footprint / 2,
        width: footprint,
        height: footprint,
        cornerRadius: grid.type === 'hex' ? footprint / 2 : 6,
        fillEnabled: false,
        stroke: selected ? colors.accent : colors.text,
        strokeWidth: (selected ? 2.5 : 1.25) / Math.max(scale, 0.2),
        opacity: token.visible ? 1 : 0.45,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowBlur: 6,
      }));
    } else {
      group.add(surface);
    }

    const barWidth = footprint * 0.8;
    const barHeight = Math.max(3, 5 / Math.max(scale, 0.2));
    const ratio = token.hp.max > 0 ? clamp(token.hp.current / token.hp.max, 0, 1) : 0;
    group.add(new Konva.Rect({
      x: -barWidth / 2,
      y: -footprint / 2 - barHeight - 2,
      width: barWidth,
      height: barHeight,
      fill: colors.danger,
      cornerRadius: barHeight / 2,
    }));
    group.add(new Konva.Rect({
      x: -barWidth / 2,
      y: -footprint / 2 - barHeight - 2,
      width: barWidth * ratio,
      height: barHeight,
      fill: colors.ok,
      cornerRadius: barHeight / 2,
    }));

    const fontSize = Math.max(10, 12 / Math.max(scale, 0.15));
    const labelWidth = footprint * 4;
    const longestWord = Math.max(1, ...token.label.split(/\s+/).map((word) => word.length));
    const labelFontSize = Math.min(fontSize, labelWidth / (longestWord * 0.62));
    group.add(new Konva.Text({
      x: -footprint * 2,
      y: footprint / 2 + 2,
      width: labelWidth,
      align: 'center',
      text: token.label,
      fontSize: labelFontSize,
      fontFamily: 'system-ui, sans-serif',
      fill: colors.text,
      wrap: 'word',
      listening: false,
    }));

    group.on('click tap', (event) => {
      event.cancelBubble = true;
      this.tokenSelected.emit(token.id);
    });
    group.on('dragstart', (event) => {
      event.cancelBubble = true;
    });
    group.on('dragend', (event) => {
      const force = event.evt instanceof MouseEvent && event.evt.altKey;
      const raw = snapTokenCell(grid, { x: group.x(), y: group.y() }, token.size);
      const snapped = force
        ? raw
        : lastReachableCell(
          { x: Math.round(token.x), y: Math.round(token.y) },
          raw,
          this.state().terrain,
        );
      const next = tokenCenterPx(grid, { ...snapped, size: token.size });
      group.position(next);
      this.tokenLayer?.batchDraw();
      if (snapped.x !== token.x || snapped.y !== token.y) {
        this.tokenMoved.emit({
          tokenId: token.id,
          x: snapped.x,
          y: snapped.y,
          ...(force ? { force: true } : {}),
        });
      }
    });
    return group;
  }

  private onPointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (
      event.evt instanceof MouseEvent
      && event.evt.button === 2
      && this.stage !== null
      && !this.readOnly()
    ) {
      const pointer = this.stage.getPointerPosition();
      if (pointer !== null) {
        this.rightPan = {
          stageX: this.stage.x(),
          stageY: this.stage.y(),
          pointerX: pointer.x,
          pointerY: pointer.y,
        };
        this.stage.draggable(false);
      }
      event.evt.preventDefault();
      return;
    }
    const tool = this.tool();
    if (tool === 'select' || this.stage === null) {
      return;
    }
    // Il flag `draggable` è applicato da un effect: forzarlo qui evita che il
    // primo mousedown dopo il cambio strumento faccia partire anche il pan.
    this.stage.draggable(false);
    event.evt.preventDefault();
    const point = this.worldPoint();
    if (point === null) {
      return;
    }
    if (tool === 'measure') {
      this.draggingMeasure = true;
      const cell = pixelToCell(this.state().grid, point);
      this.updateMeasurement(cell, cell);
      return;
    }
    if (tool === 'draw') {
      this.drawingDraft = [point];
      this.renderDraftPreview();
      return;
    }
    if (tool === 'fog-lasso') {
      this.lassoPoints = [...(this.lassoPoints ?? []), point];
      this.renderDraftPreview();
      return;
    }
    this.fogDraft = { start: point, current: point, points: [point] };
    this.renderDraftPreview();
  }

  private onPointerMove(): void {
    const stage = this.stage;
    if (this.rightPan !== null && stage !== null) {
      const pointer = stage.getPointerPosition();
      if (pointer !== null) {
        stage.position({
          x: this.rightPan.stageX + pointer.x - this.rightPan.pointerX,
          y: this.rightPan.stageY + pointer.y - this.rightPan.pointerY,
        });
        this.publishCamera();
      }
      return;
    }
    const point = this.worldPoint();
    if (point === null) {
      return;
    }
    if (this.draggingMeasure) {
      const current = this.measurement();
      if (current !== null) {
        this.updateMeasurement(current.from, pixelToCell(this.state().grid, point));
      }
      return;
    }
    if (this.drawingDraft !== null) {
      this.drawingDraft = [...this.drawingDraft, point];
      this.renderDraftPreview();
      return;
    }
    if (this.fogDraft !== null) {
      this.fogDraft = {
        ...this.fogDraft,
        current: point,
        ...(this.fogMode() === 'brush'
          ? { points: [...this.fogDraft.points, point] }
          : {}),
      };
      this.renderDraftPreview();
    }
  }

  private onPointerUp(): void {
    if (this.rightPan !== null) {
      this.rightPan = null;
      this.stage?.draggable(this.tool() === 'select' && !this.readOnly());
      return;
    }
    if (this.draggingMeasure) {
      this.draggingMeasure = false;
      const measure = this.measurement();
      if (measure !== null) {
        this.measured.emit(measure);
      }
      return;
    }
    if (this.drawingDraft !== null) {
      if (this.drawingDraft.length >= 2) {
        this.drawingAdded.emit({
          id: newId(),
          points: this.drawingDraft,
          color: this.colors().accent,
          width: this.drawingWidth(),
          visible: true,
        });
      }
      this.drawingDraft = null;
      this.renderDraftPreview();
      return;
    }
    if (this.fogDraft !== null) {
      this.commitFogDraft();
    }
  }

  private fogMode(): 'rect' | 'brush' | 'lasso' {
    const tool = this.tool();
    if (tool === 'fog-rect') {
      return 'rect';
    }
    if (tool === 'fog-lasso') {
      return 'lasso';
    }
    return 'brush';
  }

  private commitFogDraft(): void {
    const draft = this.fogDraft;
    if (draft === null) {
      return;
    }
    const mode = this.fogMode();
    let shape: FogShape | null = null;
    if (this.fogSnap()) {
      const cells = mode === 'rect'
        ? this.cellsInRect(draft.start, draft.current)
        : mode === 'lasso'
          ? this.cellsInPolygon(this.lassoPoints ?? [])
          : this.cellsInBrush(draft.points);
      if (cells.length > 0) {
        shape = { type: 'cells', cells };
      }
    } else if (mode === 'rect') {
      const width = Math.abs(draft.current.x - draft.start.x);
      const height = Math.abs(draft.current.y - draft.start.y);
      if (width >= 1 && height >= 1) {
        shape = {
          type: 'rect',
          x: Math.min(draft.start.x, draft.current.x),
          y: Math.min(draft.start.y, draft.current.y),
          width,
          height,
        };
      }
    } else if (draft.points.length >= 2) {
      shape = { type: 'brush', points: draft.points, radius: Math.max(1, this.brushRadius()) };
    }
    this.fogDraft = null;
    this.renderDraftPreview();
    if (shape !== null) {
      this.fogApplied.emit({
        id: newId(),
        op: this.tool() === 'fog-hide' ? 'hide' : 'reveal',
        shape,
        softness: this.fogSnap() ? 0 : Math.max(0, this.fogSoftness()),
        createdAt: new Date().toISOString(),
      });
    }
  }

  private cellsInRect(start: Point, current: Point): CellPoint[] {
    const grid = this.state().grid;
    const first = pixelToCell(grid, {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
    });
    const last = pixelToCell(grid, {
      x: Math.max(start.x, current.x) - 0.001,
      y: Math.max(start.y, current.y) - 0.001,
    });
    return this.clampCells(first, last);
  }

  private cellsInBrush(points: Point[]): CellPoint[] {
    const grid = this.state().grid;
    const radiusCells = Math.max(0.5, (this.brushRadius() / grid.cellSizePx));
    const cells = new Map<string, CellPoint>();
    for (const point of points) {
      const center = pixelToCell(grid, point);
      const radius = Math.ceil(radiusCells);
      for (let y = center.y - radius; y <= center.y + radius; y += 1) {
        for (let x = center.x - radius; x <= center.x + radius; x += 1) {
          if (Math.hypot(x - center.x, y - center.y) <= radiusCells) {
            cells.set(`${x}:${y}`, { x, y });
          }
        }
      }
    }
    return this.clampCellList([...cells.values()]);
  }

  private cellsInPolygon(points: Point[]): CellPoint[] {
    if (points.length < 3) {
      return [];
    }
    const grid = this.state().grid;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const first = pixelToCell(grid, { x: Math.min(...xs), y: Math.min(...ys) });
    const last = pixelToCell(grid, { x: Math.max(...xs), y: Math.max(...ys) });
    const cells: CellPoint[] = [];
    for (let y = first.y; y <= last.y; y += 1) {
      for (let x = first.x; x <= last.x; x += 1) {
        const center = cellCenterPx(grid, { x, y });
        if (pointInPolygon(center, points)) {
          cells.push({ x, y });
        }
      }
    }
    return this.clampCellList(cells);
  }

  private clampCells(first: CellPoint, last: CellPoint): CellPoint[] {
    const cells: CellPoint[] = [];
    for (let y = first.y; y <= last.y; y += 1) {
      for (let x = first.x; x <= last.x; x += 1) {
        cells.push({ x, y });
      }
    }
    return this.clampCellList(cells);
  }

  private clampCellList(cells: CellPoint[]): CellPoint[] {
    const map = this.map();
    if (map === null) {
      return cells;
    }
    const grid = this.state().grid;
    const cols = Math.ceil((map.width - grid.offsetX) / grid.cellSizePx);
    const rows = Math.ceil((map.height - grid.offsetY) / grid.cellSizePx);
    return cells.filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < cols && cell.y < rows);
  }

  private finishLasso(): void {
    const points = this.lassoPoints;
    if (points === null || points.length < 3) {
      return;
    }
    this.lassoPoints = null;
    this.renderDraftPreview();
    const cells = this.fogSnap() ? this.cellsInPolygon(points) : [];
    this.fogApplied.emit({
      id: newId(),
      op: this.tool() === 'fog-hide' ? 'hide' : 'reveal',
      shape: cells.length > 0
        ? { type: 'cells', cells }
        : { type: 'polygon', points },
      softness: this.fogSnap() ? 0 : Math.max(0, this.fogSoftness()),
      createdAt: new Date().toISOString(),
    });
  }

  private updateMeasurement(from: CellPoint, to: CellPoint): void {
    const measure = measureDistance(from, to, this.state().grid);
    this.measurement.set(measure);
    this.renderMeasure();
  }

  private renderMeasure(): void {
    const layer = this.measureLayer;
    if (layer === null) {
      return;
    }
    layer.destroyChildren();
    const measure = this.measurement();
    if (measure !== null) {
      const grid = this.state().grid;
      const colors = this.colors();
      const from = cellCenterPx(grid, measure.from);
      const to = cellCenterPx(grid, measure.to);
      const scale = this.stage?.scaleX() ?? 1;
      layer.add(new Konva.Line({
        points: [from.x, from.y, to.x, to.y],
        stroke: colors.accent,
        strokeWidth: 2 / Math.max(scale, 0.1),
        dash: [8 / Math.max(scale, 0.1), 6 / Math.max(scale, 0.1)],
        listening: false,
      }));
      for (const point of [from, to]) {
        layer.add(new Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 5 / Math.max(scale, 0.1),
          fill: colors.accent,
          listening: false,
        }));
      }
      layer.add(new Konva.Text({
        x: (from.x + to.x) / 2 + 8 / Math.max(scale, 0.1),
        y: (from.y + to.y) / 2 - 8 / Math.max(scale, 0.1),
        text: this.units.formatDistance(measure.feet),
        fontSize: Math.max(11, 13 / Math.max(scale, 0.15)),
        fontFamily: 'system-ui, sans-serif',
        fill: colors.text,
        listening: false,
      }));
    }
    layer.draw();
  }

  private drawingWidth(): number {
    const override = this.drawingWidthPx();
    return override ?? gridDrawingWidth(this.state().grid.cellSizePx);
  }

  private publishCamera(): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const camera = { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
    this.camera.set(camera);
    this.cameraChanged.emit(camera);
  }

  private worldPoint(): Point | null {
    const stage = this.stage;
    const pointer = stage?.getPointerPosition();
    if (stage === null || pointer === null || pointer === undefined) {
      return null;
    }
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  }

  private worldPointFromClient(clientX: number, clientY: number): Point | null {
    const stage = this.stage;
    if (stage === null) {
      return null;
    }
    const rect = this.host().nativeElement.getBoundingClientRect();
    return {
      x: (clientX - rect.left - stage.x()) / stage.scaleX(),
      y: (clientY - rect.top - stage.y()) / stage.scaleY(),
    };
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    const cached = this.loadingImages.get(url);
    if (cached !== undefined) {
      return cached;
    }
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => {
        this.loadingImages.delete(url);
        reject(new Error(`immagine non caricata: ${url}`));
      };
      image.src = url;
    });
    this.loadingImages.set(url, promise);
    return promise;
  }

  private colors(): Record<'text' | 'surface' | 'accent' | 'danger' | 'ok' | 'grid', string> {
    const style = getComputedStyle(this.host().nativeElement);
    return {
      text: style.getPropertyValue('--color-text').trim() || '#e8e8e8',
      surface: style.getPropertyValue('--color-bg-raised').trim() || '#242424',
      accent: style.getPropertyValue('--color-accent').trim() || '#c9a227',
      danger: style.getPropertyValue('--color-danger').trim() || '#b3261e',
      ok: style.getPropertyValue('--color-ok').trim() || '#2e7d32',
      grid: style.getPropertyValue('--color-border-strong').trim() || '#5a5a5a',
    };
  }
}
