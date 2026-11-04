import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  defaultGridConfig,
  type MapGraphic,
  type MapLayerKind,
  type Terrain,
  type WallSegment,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import {
  MapEditorCanvasComponent,
  type EditorMapImage,
} from './map-editor-canvas.component';

const konva = vi.hoisted(() => {
  class MockNode {
    public readonly children: MockNode[] = [];
    private readonly attrs = new Map<string, unknown>();

    public constructor(public readonly config: Record<string, unknown>) {}

    public getAttr(name: string): unknown {
      return this.attrs.has(name) ? this.attrs.get(name) : this.config[name];
    }

    public getChildren(): MockNode[] { return this.children; }

    public add(node: MockNode): void { this.children.push(node); }

    public on(): void {}

    public destroyChildren(): void { this.children.length = 0; }

    public draw(): void {}

    public destroy(): void {}

    public width(value?: number): number { return this.measure('width', value); }

    public height(value?: number): number { return this.measure('height', value); }

    public x(value?: number): number { return this.measure('x', value); }

    public y(value?: number): number { return this.measure('y', value); }

    public scaleX(value?: number): number { return this.measure('scaleX', value); }

    public scaleY(value?: number): number { return this.measure('scaleY', value); }

    public rotation(value?: number): number { return this.measure('rotation', value); }

    public opacity(value?: number): number { return this.measure('opacity', value); }

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
      const current = this.attrs.get(name);
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

interface ShapeLike {
  getAttr: (name: string) => unknown;
  getChildren: () => ShapeLike[];
}

class FakeLayer {
  public readonly children: ShapeLike[] = [];
  public listeningValue: boolean | null = null;
  public opacityValue: number | null = null;
  public visibleValue: boolean | null = null;

  public add(node: ShapeLike): void { this.children.push(node); }

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

class StubImage {
  public onload: (() => void) | null = null;
  public naturalWidth = 100;
  public naturalHeight = 50;
  private source = '';

  public set src(value: string) {
    this.source = value;
    this.onload?.();
  }

  public get src(): string { return this.source; }
}

interface FakeStage {
  width: () => number;
  height: () => number;
  scaleX: () => number;
  scaleY: () => number;
  scale: () => void;
  position: () => void;
  x: () => number;
  y: () => number;
  getPointerPosition: () => { x: number; y: number };
  destroy: () => void;
}

const fakeStage = (): FakeStage => ({
  width: () => 100,
  height: () => 100,
  scaleX: () => 1,
  scaleY: () => 1,
  scale: () => {},
  position: () => {},
  x: () => 0,
  y: () => 0,
  getPointerPosition: () => ({ x: 0, y: 0 }),
  destroy: () => {},
});

const wall = (id: string, kind: WallSegment['kind'], y: number): WallSegment => ({
  id,
  kind,
  a: { x: 0, y },
  b: { x: 2, y },
});

const terrain: Terrain = {
  ambientLight: 'dark',
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [
    wall('wall-1', 'wall', 0),
    wall('door-1', 'door', 1),
    wall('window-1', 'window', 2),
  ],
  lights: [{
    id: 'light-1',
    x: 1,
    y: 1,
    brightFeet: 20,
    dimFeet: 40,
    color: '#ffcc80',
    enabled: true,
    shape: 'circle',
    angle: 60,
  }],
};

interface LayerFlag {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

const graphic = (id: string, overrides: Partial<Omit<MapGraphic, 'id'>> = {}): MapGraphic => ({
  id,
  assetId: '0f8fad5b-d9cb-469f-a165-70867728950e',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
  ...overrides,
});

const editorImage = (url = '/graphic.png'): EditorMapImage => ({
  url,
  width: 100,
  height: 50,
});

const flagsFor = (
  kind: MapLayerKind,
  value: Partial<LayerFlag> = {},
): Partial<Record<MapLayerKind, LayerFlag>> => ({
  [kind]: { visible: true, locked: false, opacity: 1, ...value },
});

const hidden = (layer: FakeLayer): boolean =>
  layer.visibleValue === false || layer.children.length === 0;

interface CanvasHarness {
  stage: FakeStage | null;
  mapLayer: FakeLayer | null;
  graphicsLayer: FakeLayer | null;
  constraintsLayer: FakeLayer | null;
  wallLayer: FakeLayer | null;
  lightLayer: FakeLayer | null;
  actorLayer: FakeLayer | null;
  overlayLayer: FakeLayer | null;
  container: () => { nativeElement: HTMLElement };
  renderAll(): void;
}

interface Layers {
  map: FakeLayer;
  graphics: FakeLayer;
  constraints: FakeLayer;
  wall: FakeLayer;
  light: FakeLayer;
  actor: FakeLayer;
  overlay: FakeLayer;
}

describe('MapEditorCanvasComponent background e graphics', () => {
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

  const create = (): {
    fixture: ComponentFixture<MapEditorCanvasComponent>;
    editor: CanvasHarness;
    layers: Layers;
  } => {
    const fixture = TestBed.createComponent(MapEditorCanvasComponent);
    const ref = fixture.componentRef;
    ref.setInput('grid', defaultGridConfig);
    ref.setInput('terrain', terrain);
    ref.setInput('spawns', []);
    ref.setInput('playerStarts', []);
    ref.setInput('tool', 'select');
    ref.setInput('selected', null);
    const editor = fixture.componentInstance as unknown as CanvasHarness;
    const layers: Layers = {
      map: new FakeLayer(),
      graphics: new FakeLayer(),
      constraints: new FakeLayer(),
      wall: new FakeLayer(),
      light: new FakeLayer(),
      actor: new FakeLayer(),
      overlay: new FakeLayer(),
    };
    editor.stage = fakeStage();
    editor.mapLayer = layers.map;
    editor.graphicsLayer = layers.graphics;
    editor.constraintsLayer = layers.constraints;
    editor.wallLayer = layers.wall;
    editor.lightLayer = layers.light;
    editor.actorLayer = layers.actor;
    editor.overlayLayer = layers.overlay;
    editor.container = () => ({ nativeElement: document.createElement('div') });
    return { fixture, editor, layers };
  };

  describe('background', () => {
    it('non crea nodi quando il layer background è invisibile', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('image', { url: '', width: 100, height: 80 });
      fixture.componentRef.setInput('layerFlags', flagsFor('background', { visible: false }));

      editor.renderAll();

      expect(layers.map.children).toHaveLength(0);
      fixture.destroy();
    });

    it('applica l’opacità del layer background', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('image', { url: '', width: 100, height: 80 });
      fixture.componentRef.setInput('layerFlags', flagsFor('background', { opacity: 0.4 }));

      editor.renderAll();

      expect(layers.map.opacityValue).toBeCloseTo(0.4, 5);
      expect(layers.map.children).toHaveLength(1);
      fixture.destroy();
    });

    it('il lock del background non cambia il rendering', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('image', { url: '', width: 100, height: 80 });
      fixture.componentRef.setInput('layerFlags', flagsFor('background', { locked: true }));

      editor.renderAll();

      expect(layers.map.children).toHaveLength(1);
      expect(layers.map.children[0]?.getAttr('fill')).toBeDefined();
      fixture.destroy();
    });
  });

  describe('graphics', () => {
    it('disegna un Konva.Image per item ordinandoli per z', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('graphics', [
        { item: graphic('top', { z: 5, x: 90 }), image: editorImage() },
        { item: graphic('bottom', { z: 1, x: 10 }), image: editorImage() },
      ]);

      editor.renderAll();

      expect(layers.graphics.children).toHaveLength(2);
      expect(layers.graphics.children[0]).toBeInstanceOf(Konva.Image);
      expect(layers.graphics.children[0]?.getAttr('x')).toBe(10);
      expect(layers.graphics.children[1]?.getAttr('x')).toBe(90);
      fixture.destroy();
    });

    it('a parità di z l’ordine dei figli segue l’id', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('graphics', [
        { item: graphic('zeta', { z: 2, x: 30 }), image: editorImage() },
        { item: graphic('alpha', { z: 2, x: 20 }), image: editorImage() },
        { item: graphic('beta', { z: 1, x: 10 }), image: editorImage() },
      ]);

      editor.renderAll();

      // L'ordine dei figli è l'unica applicazione dello z: `zIndex` nella
      // geometria è descrittivo e non viene inoltrato a Konva.
      expect(layers.graphics.children.map((node) => node.getAttr('x')))
        .toEqual([10, 20, 30]);
      fixture.destroy();
    });

    it('applica la geometria calcolata dal renderer', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('graphics', [{
        item: graphic('g', {
          x: 30,
          y: 40,
          scale: 2,
          rotation: 45,
          opacity: 0.5,
          flipH: true,
          z: 3,
        }),
        image: editorImage(),
      }]);

      editor.renderAll();

      const node = layers.graphics.children[0];
      expect(node?.getAttr('x')).toBe(30);
      expect(node?.getAttr('y')).toBe(40);
      expect(node?.getAttr('width')).toBe(100);
      expect(node?.getAttr('height')).toBe(50);
      expect(node?.getAttr('offsetX')).toBe(50);
      expect(node?.getAttr('offsetY')).toBe(25);
      expect(node?.getAttr('scaleX')).toBe(-2);
      expect(node?.getAttr('scaleY')).toBe(2);
      expect(node?.getAttr('rotation')).toBe(45);
      expect(node?.getAttr('opacity')).toBe(0.5);
      fixture.destroy();
    });

    it('non disegna le grafiche quando il layer è invisibile', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('graphics', [
        { item: graphic('g'), image: editorImage() },
      ]);
      fixture.componentRef.setInput('layerFlags', flagsFor('graphics', { visible: false }));

      editor.renderAll();

      expect(hidden(layers.graphics)).toBe(true);
      fixture.destroy();
    });

    it('applica l’opacità del layer graphics', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('graphics', [
        { item: graphic('g'), image: editorImage() },
      ]);
      fixture.componentRef.setInput('layerFlags', flagsFor('graphics', { opacity: 0.35 }));

      editor.renderAll();

      expect(layers.graphics.opacityValue).toBeCloseTo(0.35, 5);
      fixture.destroy();
    });

    it('un item senza immagine non blocca gli altri né lancia errori', () => {
      const { fixture, editor, layers } = create();
      fixture.componentRef.setInput('graphics', [
        { item: graphic('missing', { z: 0, x: 500 }), image: null },
        { item: graphic('ok', { z: 1, x: 10 }), image: editorImage() },
      ]);

      expect(() => editor.renderAll()).not.toThrow();
      expect(layers.graphics.children.some((node) => node.getAttr('x') === 10)).toBe(true);
      fixture.destroy();
    });
  });
});
