import {
  emptyMapDocumentV2,
  type BackgroundLayer,
  type BlockedArea,
  type ConstraintsLayer,
  type ElementsLayer,
  type GraphicsLayer,
  type MapDocument,
  type MapElement,
  type MapGraphic,
  type WallSegment,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  mapDrawCommands,
  mapRenderSize,
  type MapDrawCommand,
  type MapRenderAssets,
  type MapRenderImage,
} from './map-image-renderer';

const BACKGROUND_ASSET_ID = '11111111-1111-4111-8111-111111111111';
const GRAPHIC_ASSET_ID = '22222222-2222-4222-8222-222222222222';

const image = (width = 100, height = 50): MapRenderImage => ({
  width,
  height,
  source: {} as CanvasImageSource,
});

const graphic = (
  id: string,
  z: number,
  overrides: Partial<Omit<MapGraphic, 'id' | 'z'>> = {},
): MapGraphic => ({
  id,
  assetId: GRAPHIC_ASSET_ID,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z,
  ...overrides,
});

const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 2, y: 0 },
};

const rect: BlockedArea = {
  id: 'rect-1',
  shape: 'rect',
  points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
};

const polygon: BlockedArea = {
  id: 'polygon-1',
  shape: 'polygon',
  points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 3 }],
};

const light: MapElement = {
  id: 'light-1',
  type: 'light',
  x: 1,
  y: 2,
  brightFeet: 20,
  dimFeet: 40,
  color: '#ffcc80',
  enabled: true,
  shape: 'circle',
  angle: 60,
};

const spawn: MapElement = {
  id: 'spawn-1',
  type: 'spawn',
  kind: 'monster',
  x: 3,
  y: 1,
  source: { type: 'srd', monsterId: 'goblin' },
  size: 1,
  hidden: false,
  quantity: 1,
};

const start: MapElement = {
  id: 'start-1',
  type: 'start',
  x: 2,
  y: 2,
  label: 'PG 1',
};

const loot: MapElement = {
  id: 'loot-1',
  type: 'loot',
  itemId: 'potion',
  x: 4,
  y: 4,
  quantity: 1,
  visible: true,
};

interface LayerPatch {
  background?: Partial<Omit<BackgroundLayer, 'kind'>>;
  graphics?: Partial<Omit<GraphicsLayer, 'kind'>>;
  constraints?: Partial<Omit<ConstraintsLayer, 'kind'>>;
  elements?: Partial<Omit<ElementsLayer, 'kind'>>;
}

const docFor = (patch: LayerPatch = {}): MapDocument => {
  const base = emptyMapDocumentV2('Mappa', null, 800, 600);
  const [background, graphics, constraints, elements] = base.layers;
  return {
    ...base,
    layers: [
      { ...background, ...patch.background },
      { ...graphics, ...patch.graphics },
      { ...constraints, ...patch.constraints },
      { ...elements, ...patch.elements },
    ],
  };
};

const assetsFor = (
  background: MapRenderImage | null,
  graphics: ReadonlyArray<{ item: MapGraphic; image: MapRenderImage | null }> = [],
): MapRenderAssets => ({ background, graphics });

type CommandOf<K extends MapDrawCommand['kind']> = Extract<MapDrawCommand, { kind: K }>;

const commandsOf = <K extends MapDrawCommand['kind']>(
  commands: readonly MapDrawCommand[],
  kind: K,
): Array<CommandOf<K>> => commands.filter(
  (command): command is CommandOf<K> => command.kind === kind,
);

describe('mapRenderSize', () => {
  it('clampa il lato lungo alla dimensione richiesta con scala uniforme', () => {
    const doc = docFor();

    expect(mapRenderSize({ ...doc, widthPx: 4096, heightPx: 2048 }, 640))
      .toEqual({ width: 640, height: 320, scale: 0.15625 });
  });

  it('usa il lato lungo anche per documenti verticali', () => {
    const doc = docFor();

    expect(mapRenderSize({ ...doc, widthPx: 1000, heightPx: 4000 }, 640))
      .toEqual({ width: 160, height: 640, scale: 0.16 });
  });

  it('non ingrandisce mai oltre le dimensioni native', () => {
    const doc = docFor();

    expect(mapRenderSize({ ...doc, widthPx: 300, heightPx: 200 }, 640))
      .toEqual({ width: 300, height: 200, scale: 1 });
  });

  it('impone almeno 1px per lato quando la scala riduce sotto la soglia', () => {
    const doc = docFor();

    const size = mapRenderSize({ ...doc, widthPx: 1000, heightPx: 1 }, 640);

    expect(size.width).toBe(640);
    expect(size.height).toBe(1);
    expect(size.scale).toBeCloseTo(0.64, 10);
  });
});

describe('mapDrawCommands composite', () => {
  it('disegna colore di sfondo e immagine con la trasformazione del layer', () => {
    const doc = docFor({
      background: {
        imageAssetId: BACKGROUND_ASSET_ID,
        imageTransform: { x: 10, y: 20, scale: 2 },
        opacity: 0.5,
      },
    });

    const commands = mapDrawCommands(doc, assetsFor(image(100, 50)), { variant: 'composite' });

    expect(commands).toEqual([
      { kind: 'background', color: doc.backgroundColor },
      {
        kind: 'image',
        imageId: 'background',
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        offsetX: 0,
        offsetY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 0.5,
      },
    ]);
  });

  it('ordina le grafiche per z e applica centro, scala, rotazione, flip e opacità', () => {
    const first = graphic('g0', 0, {
      x: 30,
      y: 40,
      scale: 2,
      rotation: 30,
      flipH: true,
      opacity: 0.4,
    });
    const second = graphic('g1', 1);
    const third = graphic('g2', 2);
    const doc = docFor({
      graphics: { opacity: 0.5, items: [third, first, second] },
    });
    const assets = assetsFor(null, [
      { item: third, image: image(200, 80) },
      { item: first, image: image(200, 80) },
      { item: second, image: image(200, 80) },
    ]);

    const commands = mapDrawCommands(doc, assets, { variant: 'composite' });

    expect(commands.map((command) => command.kind)).toEqual(['background', 'image', 'image', 'image']);
    const images = commandsOf(commands, 'image');
    expect(images.map((command) => command.imageId)).toEqual(['g0', 'g1', 'g2']);
    expect(images[0]).toMatchObject({
      x: 30,
      y: 40,
      width: 200,
      height: 80,
      offsetX: 100,
      offsetY: 40,
      scaleX: -2,
      scaleY: 2,
      rotation: 30,
      opacity: 0.2,
    });
    expect(images[1]?.opacity).toBe(0.5);
    expect(images[2]?.opacity).toBe(0.5);
  });

  it('esclude vincoli ed elementi: restano solo sfondo e grafiche', () => {
    const doc = docFor({
      graphics: { items: [graphic('g1', 0)] },
      constraints: { items: [wall, rect, polygon] },
      elements: { items: [light, spawn, start, loot] },
    });
    const assets = assetsFor(null, [{ item: graphic('g1', 0), image: image() }]);

    const commands = mapDrawCommands(doc, assets, { variant: 'composite' });

    expect(commands.map((command) => command.kind)).toEqual(['background', 'image']);
    expect(commandsOf(commands, 'line')).toEqual([]);
    expect(commandsOf(commands, 'rect')).toEqual([]);
    expect(commandsOf(commands, 'polygon')).toEqual([]);
    expect(commandsOf(commands, 'marker')).toEqual([]);
  });

  it('salta le immagini mancanti senza crash', () => {
    const doc = docFor({
      background: { imageAssetId: BACKGROUND_ASSET_ID },
      graphics: { items: [graphic('g1', 0), graphic('g2', 1)] },
    });

    const commands = mapDrawCommands(doc, assetsFor(null, [
      { item: graphic('g1', 0), image: null },
      { item: graphic('g2', 1), image: image() },
    ]), { variant: 'composite' });

    expect(commands).toEqual([{ kind: 'background', color: doc.backgroundColor }]);
  });
});

describe('mapDrawCommands thumbnail', () => {
  const thumbnailDoc = (): MapDocument => docFor({
    background: {
      imageAssetId: BACKGROUND_ASSET_ID,
      imageTransform: { x: 0, y: 0, scale: 1 },
    },
    graphics: { items: [graphic('g1', 0)] },
    constraints: { items: [wall, rect, polygon] },
    elements: { items: [light, spawn, start, loot] },
  });

  it('include sfondo, grafiche, muri, aree e marker di elementi', () => {
    const doc = thumbnailDoc();
    const assets = assetsFor(image(400, 300), [{ item: graphic('g1', 0), image: image() }]);

    const commands = mapDrawCommands(doc, assets, { variant: 'thumbnail' });

    expect(commands.map((command) => command.kind)).toEqual([
      'background',
      'image',
      'image',
      'line',
      'rect',
      'polygon',
      'marker',
      'marker',
      'marker',
      'marker',
    ]);
    expect(commandsOf(commands, 'line')[0]).toMatchObject({
      points: [0, 0, 140, 0],
    });
    expect(commandsOf(commands, 'rect')[0]).toMatchObject({
      x: 70,
      y: 70,
      width: 70,
      height: 70,
    });
    expect(commandsOf(commands, 'polygon')[0]?.points).toEqual([70, 70, 210, 70, 140, 210]);
  });

  it('posiziona i marker al centro delle celle', () => {
    const doc = thumbnailDoc();
    const commands = mapDrawCommands(doc, assetsFor(image()), { variant: 'thumbnail' });
    const markers = commandsOf(commands, 'marker');

    expect(markers[0]).toMatchObject({ x: 105, y: 175, radius: 7, fill: '#ffcc80' });
    expect(markers[1]).toMatchObject({ x: 245, y: 105, radius: 35 });
    expect(markers[2]).toMatchObject({ x: 175, y: 175, radius: 21 });
    expect(markers[3]).toMatchObject({ x: 315, y: 315 });
    for (const marker of markers) {
      expect(marker.radius).toBeGreaterThan(0);
      expect(marker.fill).not.toBe('');
    }
  });

  it('esclude i layer invisibili lasciando solo il colore di sfondo', () => {
    const doc = docFor({
      background: {
        visible: false,
        imageAssetId: BACKGROUND_ASSET_ID,
        imageTransform: { x: 0, y: 0, scale: 1 },
      },
      graphics: { visible: false, items: [graphic('g1', 0)] },
      constraints: { visible: false, items: [wall, rect] },
      elements: { visible: false, items: [light, spawn] },
    });
    const assets = assetsFor(image(), [{ item: graphic('g1', 0), image: image() }]);

    const commands = mapDrawCommands(doc, assets, { variant: 'thumbnail' });

    expect(commands).toEqual([{ kind: 'background', color: doc.backgroundColor }]);
  });

  it('esclude spawn nascosti e loot non visibili', () => {
    const hiddenSpawn: MapElement = { ...spawn, hidden: true };
    const hiddenLoot: MapElement = { ...loot, visible: false };
    const doc = docFor({
      elements: { items: [light, hiddenSpawn, start, hiddenLoot] },
    });

    const markers = commandsOf(
      mapDrawCommands(doc, assetsFor(null), { variant: 'thumbnail' }),
      'marker',
    );

    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ x: 105, y: 175 });
    expect(markers[1]).toMatchObject({ x: 175, y: 175 });
  });

  it('non disegna la griglia né elementi UI anche con vista iniziale', () => {
    const doc: MapDocument = {
      ...docFor(),
      startView: { x: 120, y: 80, zoom: 2 },
    };

    const commands = mapDrawCommands(doc, assetsFor(null), { variant: 'thumbnail' });

    expect(commands).toEqual([{ kind: 'background', color: doc.backgroundColor }]);
    for (const command of commands) {
      expect(['background', 'image', 'rect', 'polygon', 'line', 'marker'])
        .toContain(command.kind);
    }
  });
});
