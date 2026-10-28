import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  afterNextRender,
  computed,
  effect,
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
  pixelToCell,
  snapTokenCell,
  tileLevelForScale,
  tileUrl,
  tokenCenterPx,
  measureDistance,
  type CellPoint,
  type GridConfig,
  type MeasureResult,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';

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

const MIN_SCALE = 0.03;
const MAX_SCALE = 4;
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
  public readonly tool = input<'select' | 'measure'>('select');
  public readonly gridVisible = input(true);
  public readonly readOnly = input(false);

  public readonly tokenMoved = output<TokenMoveEvent>();
  public readonly tokenSelected = output<string | null>();
  public readonly actorDropped = output<ActorDropEvent>();
  public readonly measured = output<MeasureResult | null>();
  public readonly cameraChanged = output<Camera>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  public readonly camera = signal<Camera>({ scale: 1, x: 0, y: 0 });
  public readonly tiled = signal(false);
  public readonly tilesReady = signal(false);
  public readonly interacting = signal(false);
  public readonly measurement = signal<MeasureResult | null>(null);
  public readonly canvasSize = signal({ width: 0, height: 0 });

  public readonly statusLabel = computed(() => {
    const measure = this.measurement();
    return measure === null ? '' : `${measure.feet} ft · ${measure.cells} celle`;
  });

  private stage: Konva.Stage | null = null;
  private mapLayer: Konva.Layer | null = null;
  private gridLayer: Konva.Layer | null = null;
  private tokenLayer: Konva.Layer | null = null;
  private measureLayer: Konva.Layer | null = null;
  private previewNode: Konva.Image | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeAssetId: string | null = null;
  private mapGeneration = 0;
  private draggingMeasure = false;
  private loadingImages = new Map<string, Promise<HTMLImageElement>>();

  constructor() {
    effect(() => {
      this.map();
      this.state();
      this.selectedTokenId();
      this.tool();
      this.gridVisible();
      this.readOnly();
      if (this.stage !== null) {
        this.renderAll();
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
    const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
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
    const scale = clamp(
      Math.min(
        (stage.width() - VIEW_PADDING) / map.width,
        (stage.height() - VIEW_PADDING) / map.height,
      ),
      0.01,
      MAX_SCALE,
    );
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stage.width() - map.width * scale) / 2,
      y: (stage.height() - map.height * scale) / 2,
    });
    this.publishCamera();
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
    this.tokenLayer = new Konva.Layer();
    this.measureLayer = new Konva.Layer({ listening: false });
    stage.add(this.mapLayer);
    stage.add(this.gridLayer);
    stage.add(this.tokenLayer);
    stage.add(this.measureLayer);

    stage.on('wheel', (event) => this.onWheel(event));
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
    if (this.activeAssetId !== (map?.hash ?? null)) {
      this.loadMap(map);
    }
    this.renderGrid();
    this.renderTokens();
    this.renderMeasure();
    this.scheduleTiles();
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
      this.fit();
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
    const newScale = clamp(oldScale * factor, MIN_SCALE, MAX_SCALE);
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
    const scale = stage.scaleX();
    const worldLeft = Math.max(0, -stage.x() / scale);
    const worldTop = Math.max(0, -stage.y() / scale);
    const worldRight = worldLeft + stage.width() / scale;
    const worldBottom = worldTop + stage.height() / scale;
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
    const map = this.map();
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
    group.add(surface);

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
    group.add(new Konva.Text({
      x: -footprint,
      y: footprint / 2 + 2,
      width: footprint * 2,
      align: 'center',
      text: token.label,
      fontSize,
      fontFamily: 'system-ui, sans-serif',
      fill: colors.text,
      listening: false,
    }));

    group.on('click tap', (event) => {
      event.cancelBubble = true;
      this.tokenSelected.emit(token.id);
    });
    group.on('dragstart', (event) => {
      event.cancelBubble = true;
    });
    group.on('dragend', () => {
      const snapped = snapTokenCell(grid, { x: group.x(), y: group.y() }, token.size);
      const next = tokenCenterPx(grid, { ...snapped, size: token.size });
      group.position(next);
      this.tokenLayer?.batchDraw();
      if (snapped.x !== token.x || snapped.y !== token.y) {
        this.tokenMoved.emit({ tokenId: token.id, x: snapped.x, y: snapped.y });
      }
    });
    return group;
  }

  private onPointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (this.tool() !== 'measure' || this.stage === null) {
      return;
    }
    event.evt.preventDefault();
    const point = this.worldPoint();
    if (point === null) {
      return;
    }
    this.draggingMeasure = true;
    const cell = pixelToCell(this.state().grid, point);
    this.updateMeasurement(cell, cell);
  }

  private onPointerMove(): void {
    if (!this.draggingMeasure) {
      return;
    }
    const point = this.worldPoint();
    if (point === null) {
      return;
    }
    const current = this.measurement();
    if (current === null) {
      return;
    }
    this.updateMeasurement(current.from, pixelToCell(this.state().grid, point));
  }

  private onPointerUp(): void {
    if (!this.draggingMeasure) {
      return;
    }
    this.draggingMeasure = false;
    const measure = this.measurement();
    if (measure !== null) {
      this.measured.emit(measure);
    }
  }

  private updateMeasurement(from: CellPoint, to: CellPoint): void {
    const measure = measureDistance(from, to, this.state().grid);
    this.measurement.set(measure);
    this.renderMeasure();
    if (this.draggingMeasure) {
      this.measured.emit(measure);
    }
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
        text: `${measure.feet} ft`,
        fontSize: Math.max(11, 13 / Math.max(scale, 0.15)),
        fontFamily: 'system-ui, sans-serif',
        fill: colors.text,
        listening: false,
      }));
    }
    layer.draw();
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
