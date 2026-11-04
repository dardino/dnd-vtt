import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  defaultGridConfig,
  type GridConfig,
  type MapGraphic,
  type MapLayerKind,
  type Terrain,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  MapEditorCanvasComponent,
  type EditorMapImage,
  type EditorSelection,
} from './map-editor-canvas.component';

/**
 * Helper condivisi dagli spec delle grafiche poligono/testo.
 *
 * Il file usa il suffisso `.spec` perché il workspace consente al Tester di
 * creare solo file di test: non contiene casi, solo fixture e harness.
 */

export interface Point {
  x: number;
  y: number;
}

export interface NodeLike {
  getAttr: (name: string) => unknown;
  getChildren: () => NodeLike[];
  on: (event: string, handler: () => void) => void;
  fire: (event: string) => void;
  hasHandler: (event: string) => boolean;
  x: (value?: number) => number;
  y: (value?: number) => number;
}

export interface LayerFlag {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export type LayerFlags = Partial<Record<MapLayerKind, LayerFlag>>;

export class FakeLayer {
  public readonly children: NodeLike[] = [];
  public listeningValue: boolean | null = null;
  public opacityValue: number | null = null;
  public visibleValue: boolean | null = null;

  public add(node: NodeLike): void { this.children.push(node); }

  public destroyChildren(): void { this.children.length = 0; }

  public draw(): void {}

  public listening(value?: boolean): void {
    if (value !== undefined) {
      this.listeningValue = value;
    }
  }

  public opacity(value?: number): void {
    if (value !== undefined) {
      this.opacityValue = value;
    }
  }

  public visible(value?: boolean): void {
    if (value !== undefined) {
      this.visibleValue = value;
    }
  }
}

export interface Internals {
  stage: unknown;
  mapLayer: FakeLayer | null;
  graphicsLayer: FakeLayer | null;
  gridLayer: FakeLayer | null;
  constraintsLayer: FakeLayer | null;
  wallLayer: FakeLayer | null;
  lightLayer: FakeLayer | null;
  actorLayer: FakeLayer | null;
  overlayLayer: FakeLayer | null;
  host: () => { nativeElement: HTMLElement };
  container: () => { nativeElement: HTMLElement };
  renderAll(): void;
  onPointerDown(event: unknown): void;
  onKeyDown(event: KeyboardEvent): void;
}

export interface Subscription<T> {
  subscribe: (handler: (value: T) => void) => unknown;
}

export interface ShapeOutputs {
  graphicPolygonDrawn: Subscription<{ points: Point[] }>;
  graphicTextRequested: Subscription<Point>;
  graphicTranslated: Subscription<{ id: string; dx: number; dy: number }>;
  graphicMoved: Subscription<{ id: string; x: number; y: number }>;
  elementSelected: Subscription<EditorSelection | null>;
}

export interface Harness {
  fixture: ComponentFixture<MapEditorCanvasComponent>;
  editor: Internals;
  layers: {
    map: FakeLayer;
    graphics: FakeLayer;
    grid: FakeLayer;
    constraints: FakeLayer;
    wall: FakeLayer;
    light: FakeLayer;
    actor: FakeLayer;
    overlay: FakeLayer;
  };
  pointer: Point;
}

const terrain: Terrain = {
  ambientLight: 'dark',
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [],
  lights: [],
};

const fakeStage = (pointer: Point): unknown => ({
  width: () => 700,
  height: () => 700,
  scaleX: () => 1,
  scaleY: () => 1,
  scale: () => {},
  position: () => {},
  x: () => 0,
  y: () => 0,
  getPointerPosition: () => pointer,
  destroy: () => {},
});

export const flagsFor = (
  kind: MapLayerKind,
  value: Partial<LayerFlag> = {},
): LayerFlags => ({
  [kind]: { visible: true, locked: false, opacity: 1, ...value },
});

export interface MountOptions {
  graphics?: Array<{ item: MapGraphic; image: EditorMapImage | null }>;
  tool?: string;
  selected?: EditorSelection | null;
  layerFlags?: LayerFlags;
  image?: EditorMapImage | null;
  grid?: GridConfig;
}

export const mountShapes = (options: MountOptions = {}): Harness => {
  const fixture = TestBed.createComponent(MapEditorCanvasComponent);
  const ref = fixture.componentRef;
  ref.setInput('grid', options.grid ?? defaultGridConfig);
  ref.setInput('terrain', terrain);
  ref.setInput('spawns', []);
  ref.setInput('playerStarts', []);
  ref.setInput('tool', options.tool ?? 'select');
  ref.setInput('selected', options.selected ?? null);
  ref.setInput('graphics', options.graphics ?? []);
  ref.setInput('layerFlags', options.layerFlags ?? {});
  ref.setInput('image', options.image ?? null);
  ref.setInput('showGrid', false);
  const editor = fixture.componentInstance as unknown as Internals;
  const layers = {
    map: new FakeLayer(),
    graphics: new FakeLayer(),
    grid: new FakeLayer(),
    constraints: new FakeLayer(),
    wall: new FakeLayer(),
    light: new FakeLayer(),
    actor: new FakeLayer(),
    overlay: new FakeLayer(),
  };
  const pointer: Point = { x: 0, y: 0 };
  editor.stage = fakeStage(pointer);
  editor.mapLayer = layers.map;
  editor.graphicsLayer = layers.graphics;
  editor.gridLayer = layers.grid;
  editor.constraintsLayer = layers.constraints;
  editor.wallLayer = layers.wall;
  editor.lightLayer = layers.light;
  editor.actorLayer = layers.actor;
  editor.overlayLayer = layers.overlay;
  editor.host = () => ({ nativeElement: document.createElement('div') });
  editor.container = () => ({ nativeElement: document.createElement('div') });
  return { fixture, editor, layers, pointer };
};

export const outputsOf = (component: MapEditorCanvasComponent): ShapeOutputs =>
  component;

export const collect = <T>(subscription: Subscription<T>): T[] => {
  const values: T[] = [];
  subscription.subscribe((value) => values.push(value));
  return values;
};

export const pointerDown = (
  harness: Harness,
  x: number,
  y: number,
  detail = 1,
): void => {
  harness.pointer.x = x;
  harness.pointer.y = y;
  harness.editor.onPointerDown({
    evt: new MouseEvent('mousedown', { button: 0, detail }),
  });
};

export const keyDown = (harness: Harness, key: string): void => {
  harness.editor.onKeyDown(new KeyboardEvent('keydown', { key }));
};

export const flatten = (nodes: readonly NodeLike[]): NodeLike[] =>
  nodes.flatMap((node) => [node, ...flatten(node.getChildren())]);

export const draggableNodes = (layer: FakeLayer): NodeLike[] =>
  flatten(layer.children).filter((node) => node.getAttr('draggable') === true);

export const dragNodeTo = (
  harness: Harness,
  x: number,
  y: number,
): void => {
  const target = flatten(harness.layers.graphics.children)
    .find((node) => node.hasHandler('dragend'));
  if (target === undefined) {
    throw new Error('nessun nodo grafica con handler dragend');
  }
  target.x(x);
  target.y(y);
  target.fire('dragend');
};

// File di soli helper: la suite vuota evita l'errore "No test suite found"
// mantenendo il modulo importabile dagli spec veri.
describe.skip('helper canvas poligoni/testi (nessun caso proprio)', () => {
  it('espone solo fixture', () => {
    expect(typeof mountShapes).toBe('function');
  });
});
