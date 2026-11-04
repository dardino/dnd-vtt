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
  newId,
  pointInPolygon,
  latticePointPx,
  gridDrawingWidth,
  lastReachableCell,
  pixelToCell,
  snapTokenCell,
  tokenCenterPx,
  measureDistance,
  type BackgroundTransform,
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
import {
  arrowDelta,
  canvasKeyboardCommand,
  isEditableTarget,
  type ArrowDelta,
} from '../../core/ui/canvas-keyboard';
import { MeasurementService } from '../../core/ui/measurement.service';
import { readThemeColors, type CssColorTokens } from '../../core/ui/theme-colors';
import { CanvasInputController } from './canvas-input-controller';
import { FogRenderer } from './fog-renderer';
import { GridRenderer } from './grid-renderer';
import { LruCache } from './lru-cache';
import { MapLayerRenderer } from './map-layer-renderer';
import { SceneCamera, type CameraState } from './scene-camera';
import { TokenRenderer } from './token-renderer';

const SCENE_COLOR_TOKENS = {
  text: { variable: '--color-text', fallback: '#e8e8e8' },
  surface: { variable: '--color-bg-raised', fallback: '#242424' },
  accent: { variable: '--color-accent', fallback: '#c9a227' },
  danger: { variable: '--color-danger', fallback: '#b3261e' },
  ok: { variable: '--color-ok', fallback: '#2e7d32' },
  grid: { variable: '--color-border-strong', fallback: '#5a5a5a' },
} as const satisfies CssColorTokens;

export type SceneTool
  = | 'select'
    | 'measure'
    | 'fog-reveal'
    | 'fog-hide'
    | 'fog-rect'
    | 'fog-lasso'
    | 'draw';

const SCENE_TOOL_LABELS: Record<SceneTool, string> = {
  select: 'selezione',
  measure: 'misura',
  'fog-reveal': 'rivela nebbia',
  'fog-hide': 'nascondi nebbia',
  'fog-rect': 'nebbia rettangolare',
  'fog-lasso': 'nebbia a lasso',
  draw: 'disegno',
};

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
  /** Dimensioni della scena in pixel mondo. */
  width: number;
  height: number;
  /** Dimensioni native dell'asset, se diverse dalla scena. */
  imageWidth?: number;
  imageHeight?: number;
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

interface Point {
  x: number;
  y: number;
}

const IDLE_MS = 160;

@Component({
  selector: 'app-scene-canvas',
  templateUrl: './scene-canvas.component.html',
  styleUrl: './scene-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneCanvasComponent implements OnDestroy {
  public readonly map = input<SceneMapImage | null>(null);
  public readonly backgroundTransform = input<BackgroundTransform>(defaultBackgroundTransform);
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
  public readonly cameraChanged = output<CameraState>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  private readonly units = inject(MeasurementService);

  public readonly camera = signal<CameraState>({ scale: 1, x: 0, y: 0 });
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

  public readonly ariaLabel = computed(() =>
    `Scena di gioco, strumento ${SCENE_TOOL_LABELS[this.tool()]}. `
    + 'Frecce per spostare il token selezionato, Shift+Frecce per spostare la vista, '
    + 'Alt+Frecce per forzare il movimento oltre i muri, + e - per lo zoom, '
    + 'Esc per deselezionare.');

  private stage: Konva.Stage | null = null;
  private readonly sceneCamera = new SceneCamera();
  private readonly gridRenderer = new GridRenderer();
  private readonly fogRenderer = new FogRenderer();
  private readonly mapLayerRenderer = new MapLayerRenderer();
  private readonly tokenRenderer = new TokenRenderer();
  private mapLayer: Konva.Layer | null = null;
  private gridLayer: Konva.Layer | null = null;
  private doorLayer: Konva.Layer | null = null;
  private fogLayer: Konva.Layer | null = null;
  private fogPreviewLayer: Konva.Layer | null = null;
  private tokenLayer: Konva.Layer | null = null;
  private drawingLayer: Konva.Layer | null = null;
  private measureLayer: Konva.Layer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeAssetId: string | null = null;
  private lastBackgroundTransform: BackgroundTransform | null = null;
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
  private input: CanvasInputController | null = null;
  private loadingImages = new LruCache<string, Promise<HTMLImageElement>>(100);
  private portraitImages = new LruCache<string, HTMLImageElement>(50);

  constructor() {
    effect(() => {
      this.map();
      this.backgroundTransform();
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
      const missing = portraits.filter((portrait) => !this.portraitImages.has(portrait.url));
      if (missing.length === 0) {
        return;
      }
      void Promise.all(missing.map(async (portrait) => {
        try {
          return [portrait.url, await this.loadImage(portrait.url)] as const;
        } catch {
          return null;
        }
      })).then((entries) => {
        let loaded = false;
        for (const entry of entries) {
          if (entry !== null) {
            this.portraitImages.set(entry[0], entry[1]);
            loaded = true;
          }
        }
        if (loaded) {
          this.renderTokens();
        }
      });
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
    this.input?.detach();
    this.input = null;
    this.stage?.destroy();
    this.stage = null;
  }

  public zoomBy(factor: number): void {
    if (this.stage === null) {
      return;
    }
    this.syncCameraContext();
    this.sceneCamera.zoomBy(factor);
    this.applyCamera();
    this.beginInteraction();
  }

  /** Scorciatoie da tastiera: pan, zoom, deselezione e movimento del token. */
  public onKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target) || this.isDialogTarget(event.target)) {
      return;
    }
    const delta = arrowDelta(event);
    if (delta !== null && this.moveSelectedToken(event, delta)) {
      return;
    }
    const command = canvasKeyboardCommand(event);
    if (command === null) {
      return;
    }
    event.preventDefault();
    if (command.type === 'deselect') {
      this.tokenSelected.emit(null);
      return;
    }
    if (this.readOnly() || this.stage === null) {
      return;
    }
    if (command.type === 'zoom') {
      this.zoomBy(command.factor);
      return;
    }
    this.syncCameraContext();
    this.sceneCamera.panBy(command.dx, command.dy);
    this.applyCamera();
    this.beginInteraction();
  }

  /** Porta il focus sul canvas senza rubarlo a campi editabili e dialoghi. */
  public onCanvasPointerDown(event: PointerEvent): void {
    this.focusCanvas(event.target);
  }

  public onCanvasClick(event: MouseEvent): void {
    this.focusCanvas(event.target);
  }

  private focusCanvas(target: EventTarget | null): void {
    if (isEditableTarget(target) || this.isDialogTarget(target)) {
      return;
    }
    const host = this.host().nativeElement;
    if (document.activeElement !== host) {
      host.focus();
    }
  }

  private isDialogTarget(target: EventTarget | null): boolean {
    return typeof HTMLElement !== 'undefined'
      && target instanceof HTMLElement
      && (target.closest('[role="dialog"]') !== null || target.closest('dialog') !== null);
  }

  /**
   * Sposta il token selezionato di una cella. Restituisce `false` quando non
   * gestisce la freccia (Shift, nessuna selezione, strumento o griglia
   * diversi), così il chiamante ricade sul pan della camera.
   */
  private moveSelectedToken(event: KeyboardEvent, delta: ArrowDelta): boolean {
    if (event.shiftKey) {
      return false;
    }
    const tokenId = this.selectedTokenId();
    if (
      tokenId === null
      || this.tool() !== 'select'
      || this.readOnly()
      || this.state().grid.type !== 'square'
    ) {
      return false;
    }
    const token = this.state().tokens.find((entry) => entry.id === tokenId);
    if (token === undefined) {
      return false;
    }
    event.preventDefault();
    const target = this.clampTokenTarget(token, {
      x: token.x + delta.dx,
      y: token.y + delta.dy,
    });
    if (target === null) {
      return true;
    }
    const force = event.altKey;
    const next = force
      ? target
      : lastReachableCell(
        { x: token.x, y: token.y },
        target,
        this.state().terrain,
        token.size,
      );
    if (next.x !== token.x || next.y !== token.y) {
      this.tokenMoved.emit({
        tokenId,
        x: next.x,
        y: next.y,
        ...(force ? { force: true } : {}),
      });
    }
    return true;
  }

  /**
   * Mantiene l'origine del token dentro la mappa rispettando il footprint:
   * `origin + size <= cols/rows`. `null` se il footprint non entra.
   */
  private clampTokenTarget(token: TokenState, target: CellPoint): CellPoint | null {
    const map = this.map();
    if (map === null) {
      return target;
    }
    const grid = this.state().grid;
    const span = Math.max(1, Math.ceil(token.size));
    const cols = Math.ceil((map.width - grid.offsetX) / grid.cellSizePx);
    const rows = Math.ceil((map.height - grid.offsetY) / grid.cellSizePx);
    const maxX = cols - span;
    const maxY = rows - span;
    if (maxX < 0 || maxY < 0) {
      return null;
    }
    return {
      x: Math.min(Math.max(target.x, 0), maxX),
      y: Math.min(Math.max(target.y, 0), maxY),
    };
  }

  public fit(): void {
    const stage = this.stage;
    const map = this.map();
    if (stage === null || map === null) {
      return;
    }
    this.syncCameraContext();
    this.sceneCamera.fit();
    this.applyCamera();
    this.renderGrid();
    this.scheduleTiles();
  }

  private applyViewportOrFit(): void {
    const viewport = this.viewport();
    const stage = this.stage;
    const map = this.map();
    if (viewport === null || stage === null || map === null) {
      this.fit();
      return;
    }
    this.syncCameraContext();
    this.sceneCamera.applyViewport(viewport);
    this.applyCamera();
    this.renderGrid();
    this.scheduleTiles();
  }

  public focusToken(tokenId: string): void {
    const token = this.state().tokens.find((entry) => entry.id === tokenId);
    const stage = this.stage;
    if (token === undefined || stage === null) {
      return;
    }
    this.syncCameraContext();
    this.sceneCamera.centerOn(tokenCenterPx(this.state().grid, token));
    this.applyCamera();
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
    this.sceneCamera.setViewport({ width: stage.width(), height: stage.height() });
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

    this.input = new CanvasInputController({
      element: container,
      camera: this.sceneCamera,
      readOnly: () => this.readOnly(),
      syncCamera: () => {
        this.syncCameraFromStage();
        this.syncCameraContext();
      },
      applyCamera: () => this.applyCamera(),
      onInteractionStart: () => this.beginInteraction(),
      onInteractionEnd: () => this.scheduleTiles(),
      setPanning: (panning) => {
        stage.draggable(!panning && this.tool() === 'select' && !this.readOnly());
      },
    });
    this.input.attach();

    stage.on('dragstart', () => this.input?.stageDragStart());
    stage.on('dragmove', () => this.input?.stageDragMove());
    stage.on('dragend', () => this.input?.stageDragEnd());
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
    this.sceneCamera.setViewport({ width, height });
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
    this.syncCameraContext();
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
    const transform = this.backgroundTransform();
    const transformChanged = this.lastBackgroundTransform === null
      || this.lastBackgroundTransform.x !== transform.x
      || this.lastBackgroundTransform.y !== transform.y
      || this.lastBackgroundTransform.scale !== transform.scale;
    if (this.activeAssetId !== (map?.hash ?? null) || transformChanged) {
      this.lastBackgroundTransform = transform;
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
    const layer = this.mapLayer;
    this.mapLayerRenderer.reset(layer);
    this.tiled.set(map?.tiled ?? false);
    this.tilesReady.set(false);
    if (map === null || layer === null) {
      return;
    }
    if (map.url === '') {
      layer.destroyChildren();
      layer.add(new Konva.Rect({
        x: 0,
        y: 0,
        width: map.width,
        height: map.height,
        fill: this.state().backgroundColor,
        listening: false,
      }));
      layer.draw();
      this.tiled.set(false);
      this.tilesReady.set(true);
      this.applyViewportOrFit();
      this.renderFog();
      this.renderDrawings();
      return;
    }
    void this.mapLayerRenderer.renderBase({
      layer,
      map,
      transform: this.backgroundTransform(),
      isCurrent: () => generation === this.mapGeneration,
      loadImage: (url) => this.loadImage(url),
    }).then((placed) => {
      if (!placed) {
        return;
      }
      this.applyViewportOrFit();
      this.renderFog();
      this.renderDrawings();
      this.scheduleTiles();
    });
  }

  private beginInteraction(): void {
    const map = this.map();
    this.interacting.set(true);
    if (map?.tiled === true && this.mapLayerRenderer.showPreview()) {
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
    const generation = this.mapGeneration;
    this.mapLayerRenderer.renderTiles({
      layer,
      map,
      transform: this.backgroundTransform(),
      camera: this.sceneCamera.state,
      viewport: { width: stage.width(), height: stage.height() },
      isCurrent: () => generation === this.mapGeneration,
      isInteracting: () => this.interacting(),
      loadImage: (url) => this.loadImage(url),
      onTilesReady: (ready) => this.tilesReady.set(ready),
    });
  }

  private renderGrid(): void {
    const stage = this.stage;
    const layer = this.gridLayer;
    if (stage === null || layer === null) {
      return;
    }
    const map = this.map();
    const visible = this.gridVisible();
    this.gridRenderer.render({
      layer,
      grid: this.state().grid,
      visible,
      color: visible ? this.colors().grid : '',
      camera: this.sceneCamera.state,
      viewport: { width: stage.width(), height: stage.height() },
      map: map === null ? null : { width: map.width, height: map.height },
    });
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
    const layer = this.fogLayer;
    if (layer === null) {
      return;
    }
    this.fogRenderer.render({
      layer,
      map: this.map(),
      grid: this.state().grid,
      fog: this.state().fog,
      vision: this.vision(),
      opacity: this.fogOpacity(),
    });
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
    this.fogRenderer.renderDraft({
      layer,
      draft: this.fogDraft,
      mode: this.fogMode(),
      lasso: this.lassoPoints,
      accent: colors.accent,
      brushRadius: this.brushRadius(),
      stageScale: scale,
    });
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
    const nodes = this.tokenRenderer.render({
      layer,
      tokens: this.state().tokens,
      grid: this.state().grid,
      colors: this.colors(),
      selectedTokenId: this.selectedTokenId(),
      stageScale: stage.scaleX(),
      draggable: this.tool() === 'select' && !this.readOnly(),
      images: this.portraitImages,
      actorPortraits: this.actorPortraits(),
      tokenPortraits: this.tokenPortraits(),
    });
    for (const { token, group } of nodes) {
      this.bindTokenInteraction(token, group);
    }
  }

  private bindTokenInteraction(token: TokenState, group: Konva.Group): void {
    const grid = this.state().grid;
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
          token.size,
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
  }

  private onPointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (event.evt instanceof MouseEvent && event.evt.button !== 0) {
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
    if (stage === null || this.input?.panning === true) {
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
    if (this.input?.panning === true) {
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

  private syncCameraContext(): void {
    const stage = this.stage;
    const map = this.map();
    if (stage !== null) {
      this.sceneCamera.setViewport({ width: stage.width(), height: stage.height() });
    }
    this.sceneCamera.setWorld(map === null ? null : { width: map.width, height: map.height });
  }

  private syncCameraFromStage(): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    this.sceneCamera.setTransform({
      scale: stage.scaleX(),
      x: stage.x(),
      y: stage.y(),
    });
  }

  private applyCamera(): void {
    const stage = this.stage;
    if (stage === null) {
      return;
    }
    const camera = this.sceneCamera.state;
    stage.scale({ x: camera.scale, y: camera.scale });
    stage.position({ x: camera.x, y: camera.y });
    this.publishCamera();
  }

  private publishCamera(): void {
    if (this.stage === null) {
      return;
    }
    const camera = this.sceneCamera.state;
    this.camera.set(camera);
    this.cameraChanged.emit(camera);
  }

  private worldPoint(): Point | null {
    const stage = this.stage;
    const pointer = stage?.getPointerPosition();
    if (stage === null || pointer === null || pointer === undefined) {
      return null;
    }
    return this.sceneCamera.screenToWorld(pointer);
  }

  private worldPointFromClient(clientX: number, clientY: number): Point | null {
    const stage = this.stage;
    if (stage === null) {
      return null;
    }
    const rect = this.host().nativeElement.getBoundingClientRect();
    return this.sceneCamera.screenToWorld({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
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
    return readThemeColors(this.host().nativeElement, SCENE_COLOR_TOKENS);
  }
}
