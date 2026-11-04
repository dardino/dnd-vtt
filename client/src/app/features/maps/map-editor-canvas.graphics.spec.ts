import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  defaultGridConfig,
  type MapGraphic,
  type MapLayerKind,
  type Terrain,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MapEditorCanvasComponent,
  type EditorMapImage,
  type EditorSelection,
} from './map-editor-canvas.component';

const konva = vi.hoisted(() => {
  class MockNode {
    public readonly children: MockNode[] = [];
    private readonly attrs = new Map<string, unknown>();
    private readonly handlers = new Map<string, Array<() => void>>();

    public constructor(public readonly config: Record<string, unknown>) {}

    public getAttr(name: string): unknown {
      return this.attrs.has(name) ? this.attrs.get(name) : this.config[name];
    }

    public getChildren(): MockNode[] { return this.children; }

    public add(node: MockNode): void { this.children.push(node); }

    public on(event: string, handler: () => void): void {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }

    public fire(event: string): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler();
      }
    }

    public hasHandler(event: string): boolean { return this.handlers.has(event); }

    public destroyChildren(): void { this.children.length = 0; }

    public draw(): void {}

    public destroy(): void {}

    public listening(_value?: boolean): void {}

    public width(value?: number): number { return this.measure('width', value); }

    public height(value?: number): number { return this.measure('height', value); }

    public x(value?: number): number { return this.measure('x', value); }

    public y(value?: number): number { return this.measure('y', value); }

    public scaleX(value?: number): number { return this.measure('scaleX', value); }

    public scaleY(value?: number): number { return this.measure('scaleY', value); }

    public offset(value?: { x: number; y: number }): void {
      if (value !== undefined) {
        this.attrs.set('offsetX', value.x);
        this.attrs.set('offsetY', value.y);
      }
    }

    public scale(value?: { x: number; y: number }): void {
      if (value !== undefined) {
        this.attrs.set('scaleX', value.x);
        this.attrs.set('scaleY', value.y);
      }
    }

    private measure(name: string, value?: number): number {
      if (value !== undefined) {
        this.attrs.set(name, value);
      }
      const current = this.attrs.get(name) ?? this.config[name];
      return typeof current === 'number' ? current : 1;
    }
  }

  return {
    Circle: class extends MockNode {},
    Group: class extends MockNode {},
    Image: class extends MockNode {},
    Layer: class extends MockNode {},
    Line: class extends MockNode {},
    Rect: class extends MockNode {},
    Stage: class extends MockNode {},
    Text: class extends MockNode {},
    Wedge: class extends MockNode {},
  };
});

vi.mock('konva', () => ({ default: konva }));

const GRAPHIC_ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const graphic = (id: string, overrides: Partial<Omit<MapGraphic, 'id'>> = {}): MapGraphic => ({
  id,
  assetId: GRAPHIC_ASSET_ID,
  x: 100,
  y: 100,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
  ...overrides,
});

const image = (width = 40, height = 40): EditorMapImage => ({
  url: `/graphics/${width}x${height}.png`,
  width,
  height,
});

const terrain: Terrain = {
  ambientLight: 'dark',
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [],
  lights: [],
};

interface LayerFlag {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

const flagsFor = (
  kind: MapLayerKind,
  value: Partial<LayerFlag> = {},
): Partial<Record<MapLayerKind, LayerFlag>> => ({
  [kind]: { visible: true, locked: false, opacity: 1, ...value },
});

interface MockShape {
  getAttr: (name: string) => unknown;
  getChildren: () => MockShape[];
  on: (event: string, handler: () => void) => void;
  fire: (event: string) => void;
  hasHandler: (event: string) => boolean;
  x: (value?: number) => number;
  y: (value?: number) => number;
}

class FakeLayer {
  public readonly children: MockShape[] = [];
  public listeningValue: boolean | null = null;

  public add(node: MockShape): void { this.children.push(node); }

  public destroyChildren(): void { this.children.length = 0; }

  public draw(): void {}

  public listening(value?: boolean): void {
    if (value !== undefined) {
      this.listeningValue = value;
    }
  }

  public opacity(_value?: number): void {}

  public visible(_value?: boolean): void {}
}

class StubImage {
  public onload: (() => void) | null = null;
  public naturalWidth = 40;
  public naturalHeight = 40;
  private source = '';

  public set src(value: string) {
    this.source = value;
    this.onload?.();
  }

  public get src(): string { return this.source; }
}

interface CanvasHarness {
  stage: unknown;
  graphicsLayer: FakeLayer | null;
  host: () => { nativeElement: HTMLElement };
  container: () => { nativeElement: HTMLElement };
  renderAll(): void;
  onPointerDown(event: unknown): void;
}

interface Pointer { x: number; y: number }

const fakeStage = (pointer: Pointer): unknown => ({
  width: () => 100,
  height: () => 100,
  scaleX: () => 1,
  scaleY: () => 1,
  scale: () => {},
  position: () => {},
  x: () => 0,
  y: () => 0,
  getPointerPosition: () => pointer,
  destroy: () => {},
});

const flatten = (nodes: readonly MockShape[]): MockShape[] =>
  nodes.flatMap((node) => [node, ...flatten(node.getChildren())]);

interface Harness {
  fixture: ComponentFixture<MapEditorCanvasComponent>;
  editor: CanvasHarness;
  layer: FakeLayer;
  pointer: Pointer;
}

const mount = (
  graphics: Array<{ item: MapGraphic; image: EditorMapImage | null }>,
  tool: 'select' | 'wall' = 'select',
  layerFlags: Partial<Record<MapLayerKind, LayerFlag>> = {},
): Harness => {
  const fixture = TestBed.createComponent(MapEditorCanvasComponent);
  const ref = fixture.componentRef;
  ref.setInput('grid', defaultGridConfig);
  ref.setInput('terrain', terrain);
  ref.setInput('spawns', []);
  ref.setInput('playerStarts', []);
  ref.setInput('tool', tool);
  ref.setInput('selected', null);
  ref.setInput('graphics', graphics);
  ref.setInput('layerFlags', layerFlags);
  const editor = fixture.componentInstance as unknown as CanvasHarness;
  const layer = new FakeLayer();
  const pointer: Pointer = { x: 0, y: 0 };
  editor.stage = fakeStage(pointer);
  editor.graphicsLayer = layer;
  editor.host = () => ({ nativeElement: document.createElement('div') });
  editor.container = () => ({ nativeElement: document.createElement('div') });
  return { fixture, editor, layer, pointer };
};

const click = (
  harness: Harness,
  x: number,
  y: number,
): Array<EditorSelection | null> => {
  const selected: Array<EditorSelection | null> = [];
  harness.fixture.componentInstance.elementSelected.subscribe((value) => selected.push(value));
  harness.pointer.x = x;
  harness.pointer.y = y;
  harness.editor.onPointerDown({ evt: new MouseEvent('mousedown', { button: 0 }) });
  return selected;
};

const draggableShapes = (layer: FakeLayer): MockShape[] =>
  flatten(layer.children).filter((node) => node.getAttr('draggable') === true);

/** Trascina il primo nodo con handler `dragend`, se esiste. */
const dragSafely = (harness: Harness, x: number, y: number): void => {
  const target = flatten(harness.layer.children).find((node) => node.hasHandler('dragend'));
  if (target === undefined) {
    return;
  }
  target.x(x);
  target.y(y);
  target.fire('dragend');
};

const dragTo = (harness: Harness, x: number, y: number): void => {
  const target = flatten(harness.layer.children).find((node) => node.hasHandler('dragend'));
  if (target === undefined) {
    throw new Error('nessun nodo grafica con handler dragend');
  }
  target.x(x);
  target.y(y);
  target.fire('dragend');
};

describe('MapEditorCanvasComponent interazione grafiche', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', StubImage);
    vi.stubGlobal('ResizeObserver', class {
      public observe(): void {} public unobserve(): void {} public disconnect(): void {}
    });
    TestBed.configureTestingModule({ imports: [MapEditorCanvasComponent] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('seleziona la grafica cliccata al centro con lo strumento select', () => {
    const harness = mount([{ item: graphic('g1'), image: image() }]);
    harness.editor.renderAll();

    expect(click(harness, 100, 100)).toEqual([{ type: 'graphic', id: 'g1' }]);

    harness.fixture.destroy();
  });

  it('cliccare lontano dalla grafica deseleziona', () => {
    const harness = mount([{ item: graphic('g1'), image: image() }]);
    harness.editor.renderAll();

    expect(click(harness, 10, 10)).toEqual([null]);

    harness.fixture.destroy();
  });

  it('con grafiche sovrapposte seleziona quella con z più alto', () => {
    const harness = mount([
      { item: graphic('low', { z: 0 }), image: image() },
      { item: graphic('high', { z: 4 }), image: image() },
    ]);
    harness.editor.renderAll();

    expect(click(harness, 100, 100)).toEqual([{ type: 'graphic', id: 'high' }]);

    harness.fixture.destroy();
  });

  it('non seleziona grafiche di un layer bloccato', () => {
    const harness = mount(
      [{ item: graphic('g1'), image: image() }],
      'select',
      flagsFor('graphics', { locked: true }),
    );
    harness.editor.renderAll();

    expect(click(harness, 100, 100)).toEqual([null]);
    expect(draggableShapes(harness.layer)).toHaveLength(0);

    harness.fixture.destroy();
  });

  it('non disegna né seleziona grafiche di un layer invisibile', () => {
    const harness = mount(
      [{ item: graphic('g1'), image: image() }],
      'select',
      flagsFor('graphics', { visible: false }),
    );
    harness.editor.renderAll();

    expect(harness.layer.children).toHaveLength(0);
    expect(click(harness, 100, 100)).toEqual([null]);

    harness.fixture.destroy();
  });

  it('con strumento diverso da select non seleziona grafiche', () => {
    const harness = mount([{ item: graphic('g1'), image: image() }], 'wall');
    harness.editor.renderAll();
    const selected: Array<EditorSelection | null> = [];
    harness.fixture.componentInstance.elementSelected.subscribe((value) => selected.push(value));

    harness.pointer.x = 100;
    harness.pointer.y = 100;
    harness.editor.onPointerDown({ evt: new MouseEvent('mousedown', { button: 0 }) });

    expect(selected).toEqual([]);
    expect(draggableShapes(harness.layer)).toHaveLength(0);

    harness.fixture.destroy();
  });

  it('trascinare una grafica emette le coordinate mondo del centro senza snap', () => {
    const harness = mount([{ item: graphic('g1'), image: image() }]);
    const moved: Array<{ id: string; x: number; y: number }> = [];
    harness.fixture.componentInstance.graphicMoved.subscribe((value) => moved.push(value));
    harness.editor.renderAll();

    expect(draggableShapes(harness.layer)).toHaveLength(1);
    dragTo(harness, 123.4, 57.9);

    expect(moved).toEqual([{ id: 'g1', x: 123.4, y: 57.9 }]);

    harness.fixture.destroy();
  });

  it('una grafica su layer bloccato non è trascinabile', () => {
    const harness = mount(
      [{ item: graphic('g1'), image: image() }],
      'select',
      flagsFor('graphics', { locked: true }),
    );
    const moved: unknown[] = [];
    harness.fixture.componentInstance.graphicMoved.subscribe((value) => moved.push(value));
    harness.editor.renderAll();

    expect(draggableShapes(harness.layer)).toHaveLength(0);
    dragSafely(harness, 200, 200);
    expect(moved).toEqual([]);

    harness.fixture.destroy();
  });
});
