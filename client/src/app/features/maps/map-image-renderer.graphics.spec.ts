import {
  emptyMapDocumentV2,
  type GridConfig,
  type ImageGraphic,
  type MapDocument,
  type MapGraphic,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  mapDrawCommands,
  type MapDrawCommand,
  type MapRenderAssets,
  type MapRenderImage,
} from './map-image-renderer';
import { textFontStack } from './map-text-fonts';

const GRAPHIC_ASSET_ID = '22222222-2222-4222-8222-222222222222';

const CELL = 70;

const image = (width = 100, height = 50): MapRenderImage => ({
  width,
  height,
  source: {} as CanvasImageSource,
});

const imageGraphic = (
  id: string,
  z: number,
  overrides: Partial<Omit<ImageGraphic, 'id' | 'z'>> = {},
): ImageGraphic => ({
  kind: 'image',
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

const polygonGraphic = (
  id: string,
  z: number,
  overrides: Partial<Omit<PolygonGraphic, 'id' | 'z'>> = {},
): PolygonGraphic => ({
  kind: 'polygon',
  id,
  points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z,
  ...overrides,
});

const textGraphic = (
  id: string,
  z: number,
  overrides: Partial<Omit<TextGraphic, 'id' | 'z'>> = {},
): TextGraphic => ({
  kind: 'text',
  id,
  text: 'Testo',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 10,
  y: 20,
  opacity: 1,
  z,
  ...overrides,
});

interface DocPatch {
  opacity?: number;
  visible?: boolean;
  grid?: Partial<GridConfig>;
}

const docWithGraphics = (items: MapGraphic[], patch: DocPatch = {}): MapDocument => {
  const base = emptyMapDocumentV2('Mappa', null, 800, 600);
  const [background, graphics, constraints, elements] = base.layers;
  return {
    ...base,
    grid: { ...base.grid, ...patch.grid },
    layers: [
      background,
      {
        ...graphics,
        items,
        ...(patch.opacity === undefined ? {} : { opacity: patch.opacity }),
        ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      },
      constraints,
      elements,
    ],
  };
};

const assetsFor = (
  graphics: ReadonlyArray<MapGraphic>,
  background: MapRenderImage | null = null,
): MapRenderAssets => ({
  background,
  graphics: graphics.map((item) => ({ item, image: null })),
});

type CommandOf<K extends MapDrawCommand['kind']> = Extract<MapDrawCommand, { kind: K }>;

const commandsOf = <K extends MapDrawCommand['kind']>(
  commands: readonly MapDrawCommand[],
  kind: K,
): Array<CommandOf<K>> => commands.filter(
  (command): command is CommandOf<K> => command.kind === kind,
);

/**
 * Il comando `text` non esiste ancora nel tipo di produzione: il test lo legge
 * in modo strutturale per fallire sul comportamento, non sulla compilazione.
 */
interface TextCommandShape {
  kind: 'text';
  text: string;
  font: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
}

const textCommands = (commands: readonly MapDrawCommand[]): TextCommandShape[] =>
  (commands as unknown as Array<{ kind: string }>).filter(
    (command): command is TextCommandShape => command.kind === 'text',
  );

const composite = (doc: MapDocument, assets: MapRenderAssets): MapDrawCommand[] =>
  mapDrawCommands(doc, assets, { variant: 'composite' });

describe('mapDrawCommands con poligoni e testi', () => {
  it('ordina per z immagini, poligoni e testi nel composito', () => {
    const imageItem = imageGraphic('g1', 0);
    const polygonItem = polygonGraphic('p1', 1, {
      points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
      fill: '#4ea1ff',
      opacity: 0.4,
    });
    const textItem = textGraphic('t1', 2, {
      text: 'Sala',
      fontFamily: 'serif',
      fontSize: 32,
      color: '#ffcc00',
      x: 140,
      y: 210,
      opacity: 0.5,
    });
    const doc = docWithGraphics([textItem, imageItem, polygonItem], { opacity: 0.5 });
    const assets: MapRenderAssets = {
      background: null,
      graphics: [
        { item: textItem, image: null },
        { item: imageItem, image: image(200, 80) },
        { item: polygonItem, image: null },
      ],
    };

    const commands = composite(doc, assets);

    expect(commands.map((command) => command.kind)).toEqual([
      'background',
      'image',
      'polygon',
      'text',
    ]);
    expect(commandsOf(commands, 'image').map((command) => command.imageId)).toEqual(['g1']);
    expect(commandsOf(commands, 'line')).toEqual([]);
    expect(commandsOf(commands, 'rect')).toEqual([]);
    expect(commandsOf(commands, 'marker')).toEqual([]);
  });

  it('converte i vertici del poligono da celle a pixel e applica fill e opacità una volta', () => {
    const polygonItem = polygonGraphic('p1', 0, {
      points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
      fill: '#4ea1ff',
      opacity: 0.4,
    });
    const doc = docWithGraphics([polygonItem], { opacity: 0.5 });

    const polygon = commandsOf(
      composite(doc, assetsFor([polygonItem])),
      'polygon',
    )[0];

    expect(polygon).toMatchObject({
      points: [
        1 * CELL, 1 * CELL,
        3 * CELL, 1 * CELL,
        3 * CELL, 2 * CELL,
      ],
      fill: '#4ea1ff',
      opacity: 0.2,
    });
    expect(typeof polygon?.stroke).toBe('string');
    expect(polygon?.stroke.length).toBeGreaterThan(0);
  });

  it('somma offset della griglia alla conversione dei vertici', () => {
    const polygonItem = polygonGraphic('p1', 0, {
      points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    });
    const doc = docWithGraphics([polygonItem], { grid: { offsetX: 10, offsetY: 20 } });

    const polygon = commandsOf(
      composite(doc, assetsFor([polygonItem])),
      'polygon',
    )[0];

    expect(polygon?.points).toEqual([
      10 + 1 * CELL, 20 + 1 * CELL,
      10 + 2 * CELL, 20 + 1 * CELL,
      10 + 2 * CELL, 20 + 2 * CELL,
    ]);
  });

  it('traduce il testo in un comando con font, angolo in alto a sinistra e opacità', () => {
    const textItem = textGraphic('t1', 0, {
      text: 'Sala',
      fontFamily: 'serif',
      fontSize: 32,
      color: '#ffcc00',
      x: 140,
      y: 210,
      opacity: 0.5,
    });
    const doc = docWithGraphics([textItem], { opacity: 0.5 });

    const texts = textCommands(composite(doc, assetsFor([textItem])));

    expect(texts).toHaveLength(1);
    expect(texts[0]).toEqual({
      kind: 'text',
      text: 'Sala',
      font: `32px ${textFontStack('serif')}`,
      x: 140,
      y: 210,
      color: '#ffcc00',
      opacity: 0.25,
    });
  });

  it('applica l’opacità del layer senza elevarla al quadrato', () => {
    const polygonItem = polygonGraphic('p1', 0, { opacity: 1 });
    const textItem = textGraphic('t1', 1, { opacity: 1 });
    const doc = docWithGraphics([polygonItem, textItem], { opacity: 0.5 });

    const commands = composite(doc, assetsFor([polygonItem, textItem]));

    expect(commandsOf(commands, 'polygon')[0]).toMatchObject({ opacity: 0.5 });
    expect(textCommands(commands)[0]?.opacity).toBe(0.5);
  });

  it('ordina per id a parità di z anche con tipi diversi', () => {
    const textItem = textGraphic('b', 0);
    const polygonItem = polygonGraphic('a', 0);
    const doc = docWithGraphics([textItem, polygonItem]);

    const commands = composite(doc, assetsFor([textItem, polygonItem]));

    expect(commands.map((command) => command.kind)).toEqual([
      'background',
      'polygon',
      'text',
    ]);
  });

  it('salta solo l’immagine mancante lasciando poligoni e testi', () => {
    const imageItem = imageGraphic('g1', 0);
    const polygonItem = polygonGraphic('p1', 1);
    const textItem = textGraphic('t1', 2);
    const doc = docWithGraphics([imageItem, polygonItem, textItem]);

    const commands = composite(doc, assetsFor([imageItem, polygonItem, textItem]));

    expect(commands.map((command) => command.kind)).toEqual([
      'background',
      'polygon',
      'text',
    ]);
  });

  it('non emette comandi di un layer graphics invisibile', () => {
    const polygonItem = polygonGraphic('p1', 0);
    const textItem = textGraphic('t1', 1);
    const doc = docWithGraphics([polygonItem, textItem], { visible: false });

    const commands = composite(doc, assetsFor([polygonItem, textItem]));

    expect(commands).toEqual([{ kind: 'background', color: doc.backgroundColor }]);
  });
});

describe('mapDrawCommands thumbnail con poligoni e testi', () => {
  it('aggiunge poligoni e testi prima di vincoli ed elementi', () => {
    const polygonItem = polygonGraphic('p1', 0);
    const textItem = textGraphic('t1', 1);
    const doc = docWithGraphics([textItem, polygonItem]);
    const [background, graphics, constraints, elements] = doc.layers;
    const withWall: MapDocument = {
      ...doc,
      layers: [
        background,
        graphics,
        {
          ...constraints,
          items: [{
            id: 'wall-1',
            kind: 'wall',
            a: { x: 0, y: 0 },
            b: { x: 2, y: 0 },
          }],
        },
        {
          ...elements,
          items: [{
            id: 'start-1',
            type: 'start',
            x: 2,
            y: 2,
            label: 'PG 1',
          }],
        },
      ],
    };

    const commands = mapDrawCommands(withWall, assetsFor([polygonItem, textItem]), {
      variant: 'thumbnail',
    });

    expect(commands.map((command) => command.kind)).toEqual([
      'background',
      'polygon',
      'text',
      'line',
      'marker',
    ]);
    expect(commandsOf(commands, 'polygon')[0]?.points).toEqual([70, 70, 210, 70, 210, 140]);
    expect(textCommands(commands)[0]?.text).toBe('Testo');
  });

  it('esclude poligoni e testi del layer graphics invisibile ma mantiene i vincoli', () => {
    const polygonItem = polygonGraphic('p1', 0);
    const textItem = textGraphic('t1', 1);
    const doc = docWithGraphics([polygonItem, textItem], { visible: false });
    const [background, graphics, constraints, elements] = doc.layers;
    const withWall: MapDocument = {
      ...doc,
      layers: [
        background,
        graphics,
        {
          ...constraints,
          items: [{
            id: 'wall-1',
            kind: 'wall',
            a: { x: 0, y: 0 },
            b: { x: 2, y: 0 },
          }],
        },
        elements,
      ],
    };

    const commands = mapDrawCommands(withWall, assetsFor([polygonItem, textItem]), {
      variant: 'thumbnail',
    });

    expect(commands.map((command) => command.kind)).toEqual(['background', 'line']);
  });
});
