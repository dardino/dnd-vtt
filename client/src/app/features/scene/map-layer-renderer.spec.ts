import { describe, expect, it, vi } from 'vitest';
import {
  MapLayerRenderer,
  type MapImageLoader,
  type MapImageSource,
  type MapTilesRenderParams,
} from './map-layer-renderer';

const konva = vi.hoisted(() => {
  interface NodeConfig {
    image?: unknown;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    listening?: boolean;
  }

  class MockNode {
    public readonly children: MockNode[] = [];
    public parent: MockLayer | null = null;
    public visibleValue = true;
    public destroyed = false;

    public constructor(public readonly config: NodeConfig = {}) {}

    public add(node: MockNode): void {
      node.parent = this.parent;
      this.children.push(node);
    }

    public visible(value?: boolean): boolean {
      if (value !== undefined) {
        this.visibleValue = value;
      }
      return this.visibleValue;
    }

    public destroy(): void {
      this.destroyed = true;
      this.parent?.remove(this);
    }
  }

  class MockLayer {
    public readonly children: MockNode[] = [];
    public drawCount = 0;
    public batchDrawCount = 0;

    public add(node: MockNode): void {
      node.parent = this;
      this.children.push(node);
    }

    public remove(node: MockNode): void {
      const index = this.children.indexOf(node);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
    }

    public getChildren(): readonly MockNode[] {
      return this.children;
    }

    public destroyChildren(): void {
      this.children.length = 0;
    }

    public draw(): void {
      this.drawCount += 1;
    }

    public batchDraw(): void {
      this.batchDrawCount += 1;
    }
  }

  return { MockLayer, MockNode };
});

vi.mock('konva', () => ({
  default: {
    Image: konva.MockNode,
    Group: konva.MockNode,
  },
}));

const map = (overrides: Partial<MapImageSource> = {}): MapImageSource => ({
  url: '/uploads/maps/hash.webp',
  previewUrl: '/uploads/previews/hash.webp',
  hash: 'hash',
  width: 1024,
  height: 512,
  tiled: false,
  ...overrides,
});

const image = (): HTMLImageElement =>
  ({ naturalWidth: 1, naturalHeight: 1 }) as HTMLImageElement;

const loaderFor = (urls: string[], fail: readonly string[] = []): MapImageLoader =>
  (url) => {
    urls.push(url);
    return fail.includes(url)
      ? Promise.reject(new Error(`immagine non caricata: ${url}`))
      : Promise.resolve(image());
  };

const layer = (): InstanceType<typeof konva.MockLayer> => new konva.MockLayer();

const tiles = async (
  target: InstanceType<typeof konva.MockLayer>,
  source: MapImageSource,
  urls: string[],
  overrides: Partial<MapTilesRenderParams> = {},
  renderer = new MapLayerRenderer(),
): Promise<{ ready: boolean[] }> => {
  const ready: boolean[] = [];
  renderer.renderTiles({
    layer: target as unknown as MapTilesRenderParams['layer'],
    map: source,
    camera: { scale: 0.5, x: 0, y: 0 },
    viewport: { width: 1024, height: 768 },
    isCurrent: () => true,
    isInteracting: () => false,
    loadImage: loaderFor(urls),
    onTilesReady: (value) => ready.push(value),
    ...overrides,
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return { ready };
};

describe('MapLayerRenderer', () => {
  it('disegna l\'immagine intera quando la mappa non è tiled', async () => {
    const target = layer();
    const urls: string[] = [];
    const source = map();
    const renderer = new MapLayerRenderer();

    const placed = await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor(urls),
    });

    expect(placed).toBe(true);
    expect(urls).toEqual([source.url]);
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.config).toMatchObject({
      x: 0,
      y: 0,
      width: 1024,
      height: 512,
      listening: false,
    });
    expect(target.drawCount).toBe(1);
    expect(renderer.showPreview()).toBe(false);
  });

  it('disegna le tile del livello LOD scelto per la scala corrente', async () => {
    const target = layer();
    const urls: string[] = [];
    const source = map({ tiled: true, width: 8192, height: 4096 });
    const renderer = new MapLayerRenderer();
    await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor(urls),
    });

    const { ready } = await tiles(target, source, urls, {}, renderer);

    // Scala 0,5 → livello 1: 16 tile visibili, ciascuna con 2 px immagine per px mappa.
    expect(ready).toEqual([true]);
    const group = target.children.at(-1);
    expect(group?.children).toHaveLength(16);
    expect(group?.children[0]?.config).toMatchObject({ x: 0, y: 0, width: 1025, height: 1025 });
    expect(group?.children.at(-1)?.config).toMatchObject({ x: 3072, y: 3072 });
    expect(urls.at(-1)).toBe('/uploads/tiles/hash/1/3_3.webp');
    expect(target.children[0]?.visibleValue).toBe(false);
  });

  it('mostra la preview tiled e nasconde le altre tile durante il pan', async () => {
    const target = layer();
    const urls: string[] = [];
    const source = map({ tiled: true, width: 8192, height: 4096 });
    const renderer = new MapLayerRenderer();
    await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor(urls),
    });
    expect(urls).toEqual([source.previewUrl]);
    const preview = target.children[0];

    target.add(new konva.MockNode({}));
    expect(renderer.showPreview()).toBe(true);
    expect(preview?.visibleValue).toBe(true);
    expect(target.children[1]?.visibleValue).toBe(false);
  });

  it('ripiega sull\'immagine intera se la preview tiled manca', async () => {
    const target = layer();
    const urls: string[] = [];
    const source = map({ tiled: true, width: 8192, height: 4096 });
    const renderer = new MapLayerRenderer();

    const placed = await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor(urls, [source.previewUrl]),
    });

    expect(placed).toBe(true);
    expect(urls).toEqual([source.previewUrl, source.url]);
    expect(target.children).toHaveLength(1);
    expect(renderer.showPreview()).toBe(true);
  });

  it('non disegna nulla quando l\'immagine non si carica', async () => {
    const target = layer();
    const urls: string[] = [];
    const source = map();
    const renderer = new MapLayerRenderer();

    const placed = await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor(urls, [source.url]),
    });

    expect(placed).toBe(false);
    expect(target.children).toHaveLength(0);
    expect(target.drawCount).toBe(0);
  });

  it('ignora un caricamento superato da una mappa più recente', async () => {
    const target = layer();
    const source = map();
    const renderer = new MapLayerRenderer();

    const placed = await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => false,
      loadImage: loaderFor([]),
    });

    expect(placed).toBe(false);
    expect(target.children).toHaveLength(0);
  });

  it('segnala le tile mancanti mantenendo visibile la preview', async () => {
    const target = layer();
    const source = map({ tiled: true, width: 8192, height: 4096 });
    const renderer = new MapLayerRenderer();
    await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor([]),
    });
    const preview = target.children[0];
    const urls: string[] = [];
    const fail = ['/uploads/tiles/hash/1/0_0.webp'];

    const { ready } = await tiles(target, source, urls, {
      loadImage: loaderFor(urls, fail),
    }, renderer);

    expect(ready).toEqual([false]);
    expect(preview?.visibleValue).toBe(true);
  });

  it('non ridisegna le tile durante una interazione', async () => {
    const target = layer();
    const source = map({ tiled: true, width: 8192, height: 4096 });
    const urls: string[] = [];

    const { ready } = await tiles(target, source, urls, { isInteracting: () => true });

    expect(ready).toEqual([]);
    expect(target.children).toHaveLength(0);
    expect(urls).toEqual([]);
  });

  it('ripulisce layer e preview al cambio mappa', async () => {
    const target = layer();
    const source = map({ tiled: true, width: 8192, height: 4096 });
    const renderer = new MapLayerRenderer();
    await renderer.renderBase({
      layer: target as unknown as MapTilesRenderParams['layer'],
      map: source,
      isCurrent: () => true,
      loadImage: loaderFor([]),
    });

    renderer.reset(target as unknown as MapTilesRenderParams['layer']);

    expect(target.children).toHaveLength(0);
    expect(renderer.showPreview()).toBe(false);
  });
});
