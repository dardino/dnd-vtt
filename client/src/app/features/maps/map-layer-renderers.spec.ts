import { defaultGridConfig, type MapGraphic, type PolygonGraphic, type TextGraphic } from '@dnd-vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { drawGraphicsLayer } from './map-layer-renderers';

const konva = vi.hoisted(() => {
  class MockNode {
    public readonly children: MockNode[] = [];
    public readonly handlers = new Map<string, Array<() => void>>();

    public constructor(
      public readonly kind: string,
      public readonly config: Record<string, unknown>,
    ) {}

    public getAttr(name: string): unknown {
      return this.config[name];
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

    public listening(): void {}

    public x(): number { return 0; }

    public y(): number { return 0; }
  }

  const shape = (kind: string) => class extends MockNode {
    public constructor(config: Record<string, unknown>) {
      super(kind, config);
    }
  };

  return {
    Group: shape('Group'),
    Image: shape('Image'),
    Line: shape('Line'),
    Text: shape('Text'),
  };
});

vi.mock('konva', () => ({ default: konva }));

const ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const imageGraphic = (overrides: Partial<MapGraphic> = {}): MapGraphic => ({
  kind: 'image',
  id: 'image-1',
  assetId: ASSET_ID,
  x: 100,
  y: 200,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
  ...overrides,
} as MapGraphic);

const polygonGraphic = (overrides: Partial<PolygonGraphic> = {}): PolygonGraphic => ({
  kind: 'polygon',
  id: 'polygon-1',
  points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 0,
  ...overrides,
});

const textGraphic = (overrides: Partial<TextGraphic> = {}): TextGraphic => ({
  kind: 'text',
  id: 'text-1',
  text: 'Sala del trono',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 100,
  y: 100,
  opacity: 1,
  z: 0,
  ...overrides,
});

interface MockNodeLike {
  kind: string;
  config: Record<string, unknown>;
  children: MockNodeLike[];
  getAttr: (name: string) => unknown;
  getChildren: () => MockNodeLike[];
  fire: (event: string) => void;
  hasHandler: (event: string) => boolean;
}

class FakeLayer {
  public readonly children: MockNodeLike[] = [];
  public drawCount = 0;

  public add(node: MockNodeLike): void { this.children.push(node); }

  public destroyChildren(): void { this.children.length = 0; }

  public draw(): void { this.drawCount += 1; }
}

const element = {} as unknown as HTMLImageElement;

interface DrawOptions {
  graphics: Array<{ item: MapGraphic; image: { url: string; width: number; height: number } | null }>;
  interactive?: boolean;
  onDragEnd?: (id: string, x: number, y: number) => void;
  grid?: typeof defaultGridConfig;
}

const draw = (options: DrawOptions): FakeLayer => {
  const layer = new FakeLayer();
  const params = {
    layer,
    graphics: options.graphics,
    grid: options.grid ?? defaultGridConfig,
    loadImage: () => element,
    onImageLoaded: () => {},
    interactive: options.interactive ?? false,
    onDragEnd: options.onDragEnd,
  };
  (drawGraphicsLayer as unknown as (value: typeof params) => void)(params);
  return layer;
};

const nodesOf = (layer: FakeLayer): MockNodeLike[] => layer.children;

const nodeByKind = (layer: FakeLayer, kind: string): MockNodeLike => {
  const node = layer.children.find((entry) => entry.kind === kind);
  if (node === undefined) {
    throw new Error(`nodo Konva ${kind} assente`);
  }
  return node;
};

describe('drawGraphicsLayer tipi di grafica', () => {
  it('disegna le immagini come Konva.Image con la geometria risolta', () => {
    const layer = draw({
      graphics: [{
        item: imageGraphic({ x: 30, y: 40, z: 2 }),
        image: { url: '/uploads/img.png', width: 200, height: 80 },
      }],
    });

    const node = nodeByKind(layer, 'Image');
    expect(node.getAttr('image')).toBe(element);
    expect(node.getAttr('x')).toBe(30);
    expect(node.getAttr('y')).toBe(40);
    expect(node.getAttr('width')).toBe(200);
    expect(node.getAttr('height')).toBe(80);
    expect(node.getAttr('offsetX')).toBe(100);
    expect(node.getAttr('offsetY')).toBe(40);
  });

  it('disegna i poligoni come Konva.Line chiusa con fill, stroke e opacity', () => {
    const layer = draw({
      graphics: [{ item: polygonGraphic({ fill: '#ff0000', opacity: 0.4, z: 1 }), image: null }],
    });

    const node = nodeByKind(layer, 'Line');
    expect(node.getAttr('closed')).toBe(true);
    expect(node.getAttr('points')).toEqual([0, 0, 140, 0, 140, 70]);
    expect(node.getAttr('fill')).toBe('#ff0000');
    expect(node.getAttr('opacity')).toBe(0.4);
    expect(typeof node.getAttr('stroke')).toBe('string');
    expect(node.getAttr('stroke')).not.toBe('');
  });

  it('disegna i testi come Konva.Text con contenuto, font stack, size e colore', () => {
    const layer = draw({
      graphics: [{
        item: textGraphic({ text: 'Trono', fontSize: 32, color: '#ffcc00', opacity: 0.6 }),
        image: null,
      }],
    });

    const node = nodeByKind(layer, 'Text');
    expect(node.getAttr('text')).toBe('Trono');
    expect(node.getAttr('fontSize')).toBe(32);
    expect(node.getAttr('fill')).toBe('#ffcc00');
    expect(node.getAttr('opacity')).toBe(0.6);
    const fontFamily = node.getAttr('fontFamily');
    expect(typeof fontFamily).toBe('string');
    // Il renderer risolve la chiave schema nello stack CSS completo.
    expect(fontFamily).not.toBe('sans');
    expect(fontFamily).toContain(',');
  });

  it('mantiene un unico z-order tra immagini, poligoni e testi', () => {
    const layer = draw({
      graphics: [
        { item: textGraphic({ id: 'text', z: 2 }), image: null },
        { item: imageGraphic({ id: 'image', z: 0 }), image: { url: '/img.png', width: 10, height: 10 } },
        { item: polygonGraphic({ id: 'polygon', z: 1 }), image: null },
      ],
    });

    expect(nodesOf(layer).map((node) => node.kind)).toEqual(['Image', 'Line', 'Text']);
  });

  it('salta le immagini senza asset ma continua a disegnare poligoni e testi', () => {
    const layer = draw({
      graphics: [
        { item: imageGraphic({ id: 'image', z: 0 }), image: null },
        { item: polygonGraphic({ id: 'polygon', z: 1 }), image: null },
        { item: textGraphic({ id: 'text', z: 2 }), image: null },
      ],
    });

    expect(nodesOf(layer).map((node) => node.kind)).toEqual(['Line', 'Text']);
  });

  it('rende interattivi e trascinabili tutti i tipi quando richiesto', () => {
    const layer = draw({
      graphics: [
        { item: imageGraphic({ id: 'image', z: 0 }), image: { url: '/img.png', width: 10, height: 10 } },
        { item: polygonGraphic({ id: 'polygon', z: 1 }), image: null },
        { item: textGraphic({ id: 'text', z: 2 }), image: null },
      ],
      interactive: true,
      onDragEnd: () => {},
    });

    for (const node of nodesOf(layer)) {
      expect(node.getAttr('listening'), node.kind).toBe(true);
      expect(node.getAttr('draggable'), node.kind).toBe(true);
    }
  });

  it('con layer non interattivo non ascolta né trascina alcun tipo', () => {
    const layer = draw({
      graphics: [
        { item: polygonGraphic({ id: 'polygon', z: 1 }), image: null },
        { item: textGraphic({ id: 'text', z: 2 }), image: null },
      ],
    });

    for (const node of nodesOf(layer)) {
      expect(node.getAttr('listening'), node.kind).toBe(false);
      expect(node.getAttr('draggable'), node.kind).toBe(false);
    }
  });
});
