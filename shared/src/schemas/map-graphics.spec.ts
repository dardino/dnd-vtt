import { describe, expect, it } from 'vitest';
import { ASSET_ID } from '../test/map-documents.js';
import * as color from './color.js';
import { emptyMapDocumentV2, mapDocumentV2Schema, type MapDocumentV2 } from './map-document.js';
import { mapGraphicSchema, type MapGraphic } from './map-layers.js';
import type { ImageGraphic, PolygonGraphic, TextGraphic } from '../index.js';
import * as mapLayerHelpers from '../lib/map/layers.js';

const image = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'image-1',
  kind: 'image',
  assetId: ASSET_ID,
  x: 10,
  y: 20,
  scale: 2,
  rotation: 45,
  flipH: true,
  flipV: false,
  opacity: 0.5,
  z: 3,
  ...overrides,
});

const polygon = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'polygon-1',
  kind: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
  ],
  ...overrides,
});

const text = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'text-1',
  kind: 'text',
  text: 'Sala del trono',
  x: 15,
  y: 25,
  ...overrides,
});

/** Documento v2 con il layer graphics sostituito dagli item indicati. */
const withGraphics = (doc: MapDocumentV2, items: readonly unknown[]): unknown => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [background, { ...graphics, items }, constraints, elements],
  };
};

describe('mapHexColorSchema', () => {
  it('accetta i colori esadecimali a sei cifre', () => {
    for (const value of ['#000000', '#ffffff', '#4ea1ff', '#a1b2c3']) {
      expect(color.mapHexColorSchema.safeParse(value).success, value).toBe(true);
    }
  });

  it('rifiuta forme e caratteri non esadecimali', () => {
    for (const value of ['4ea1ff', '#fff', '#1234567', '#12345', '#gggggg', 'red', '', 42]) {
      expect(color.mapHexColorSchema.safeParse(value).success, String(value)).toBe(false);
    }
  });
});

describe('retrocompatibilità delle grafiche immagine', () => {
  it('aggiunge kind image a una grafica storica senza kind e conserva i campi', () => {
    const parsed = mapGraphicSchema.parse({
      id: 'legacy-1',
      assetId: ASSET_ID,
      x: 3,
      y: 4,
    });

    expect(parsed).toEqual({
      id: 'legacy-1',
      kind: 'image',
      assetId: ASSET_ID,
      x: 3,
      y: 4,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      z: 0,
    });
  });

  it('è idempotente: riparsare l’output non cambia kind né i campi', () => {
    const once = mapGraphicSchema.parse({ id: 'legacy-1', assetId: ASSET_ID, x: 3, y: 4 });
    const twice = mapGraphicSchema.parse(once);

    expect(twice).toEqual(once);
    expect(twice.kind).toBe('image');
  });

  it('accetta una grafica image esplicita e ne conserva i campi', () => {
    expect(mapGraphicSchema.parse(image())).toEqual(image());
  });

  it('rifiuta campi extra sulla grafica image', () => {
    expect(mapGraphicSchema.safeParse(image({ extra: true })).success).toBe(false);
  });

  it('non corregge un kind invalido o sconosciuto', () => {
    for (const kind of ['video', 'IMAGE', '', null, 3]) {
      expect(mapGraphicSchema.safeParse(image({ kind })).success, String(kind)).toBe(false);
    }
  });
});

describe('polygon', () => {
  it('applica i default di fill, opacity e z', () => {
    expect(mapGraphicSchema.parse(polygon())).toEqual({
      id: 'polygon-1',
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 30 },
      ],
      fill: '#4ea1ff',
      opacity: 0.35,
      z: 0,
    });
  });

  it('accetta fill, opacity e z espliciti', () => {
    expect(mapGraphicSchema.parse({
      ...polygon(),
      fill: '#ff0000',
      opacity: 0,
      z: 7,
    })).toMatchObject({ fill: '#ff0000', opacity: 0, z: 7 });
  });

  it('accetta il minimo di 3 vertici e il massimo di 200', () => {
    const three = polygon();
    expect(mapGraphicSchema.safeParse(three).success).toBe(true);

    const twoHundred = polygon({
      points: Array.from({ length: 200 }, (_, index) => ({ x: index, y: index })),
    });
    expect(mapGraphicSchema.safeParse(twoHundred).success).toBe(true);
  });

  it('rifiuta 2 vertici e più di 200 vertici', () => {
    expect(mapGraphicSchema.safeParse(polygon({
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    })).success).toBe(false);

    expect(mapGraphicSchema.safeParse(polygon({
      points: Array.from({ length: 201 }, (_, index) => ({ x: index, y: index })),
    })).success).toBe(false);
  });

  it('rifiuta vertici non interi o incompleti', () => {
    expect(mapGraphicSchema.safeParse(polygon({
      points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 2, y: 2 }],
    })).success).toBe(false);

    expect(mapGraphicSchema.safeParse(polygon({
      points: [{ x: 0, y: 0 }, { x: 1 }, { x: 2, y: 2 }],
    })).success).toBe(false);
  });

  it('rifiuta fill non esadecimale', () => {
    for (const fill of ['red', '#fff', '#12345', '#gggggg', '4ea1ff']) {
      expect(mapGraphicSchema.safeParse(polygon({ fill })).success, fill).toBe(false);
    }
  });

  it('accetta opacity ai limiti e rifiuta i valori fuori scala', () => {
    for (const opacity of [0, 1]) {
      expect(mapGraphicSchema.safeParse(polygon({ opacity })).success).toBe(true);
    }
    for (const opacity of [-0.01, 1.01]) {
      expect(mapGraphicSchema.safeParse(polygon({ opacity })).success).toBe(false);
    }
  });

  it('rifiuta z negativo e campi extra', () => {
    expect(mapGraphicSchema.safeParse(polygon({ z: -1 })).success).toBe(false);
    expect(mapGraphicSchema.safeParse(polygon({ assetId: ASSET_ID })).success).toBe(false);
  });
});

describe('text', () => {
  it('applica i default di font, dimensione, colore, opacity e z', () => {
    expect(mapGraphicSchema.parse(text())).toEqual({
      id: 'text-1',
      kind: 'text',
      text: 'Sala del trono',
      fontFamily: 'sans',
      fontSize: 24,
      color: '#ffffff',
      x: 15,
      y: 25,
      opacity: 1,
      z: 0,
    });
  });

  it('accetta tutti i font dell’enum e i limiti di fontSize', () => {
    for (const fontFamily of ['sans', 'serif', 'mono', 'display']) {
      expect(mapGraphicSchema.safeParse(text({ fontFamily, fontSize: 8 })).success, fontFamily)
        .toBe(true);
    }
    expect(mapGraphicSchema.safeParse(text({ fontSize: 200 })).success).toBe(true);
  });

  it('rifiuta font fuori enum e fontSize 7 o 201', () => {
    for (const fontFamily of ['comic', 'Sans', '', 'system']) {
      expect(mapGraphicSchema.safeParse(text({ fontFamily })).success, fontFamily).toBe(false);
    }
    for (const fontSize of [7, 201, 7.5]) {
      expect(mapGraphicSchema.safeParse(text({ fontSize })).success, String(fontSize)).toBe(false);
    }
  });

  it('rifiuta testo vuoto, oltre 120 caratteri, con newline o control', () => {
    expect(mapGraphicSchema.safeParse(text({ text: '' })).success).toBe(false);
    expect(mapGraphicSchema.safeParse(text({ text: 'a'.repeat(121) })).success).toBe(false);
    const longest = mapGraphicSchema.parse(text({ text: 'a'.repeat(120) }));
    if (!mapLayerHelpers.isTextGraphic(longest)) {
      throw new Error('Atteso un graphic di testo');
    }
    expect(longest.text).toHaveLength(120);
    for (const value of ['a\nb', 'a\rb', 'a\tb', 'a\u0000b']) {
      expect(mapGraphicSchema.safeParse(text({ text: value })).success, JSON.stringify(value))
        .toBe(false);
    }
  });

  it('rifiuta colore non esadecimale, coordinate non intere e campi extra', () => {
    for (const value of ['white', '#fff', '#12345', '#gggggg']) {
      expect(mapGraphicSchema.safeParse(text({ color: value })).success, value).toBe(false);
    }
    expect(mapGraphicSchema.safeParse(text({ x: 1.5 })).success).toBe(false);
    expect(mapGraphicSchema.safeParse(text({ y: 2.5 })).success).toBe(false);
    expect(mapGraphicSchema.safeParse(text({ assetId: ASSET_ID })).success).toBe(false);
  });

  it('accetta opacity ai limiti e rifiuta i valori fuori scala', () => {
    for (const opacity of [0, 1]) {
      expect(mapGraphicSchema.safeParse(text({ opacity })).success).toBe(true);
    }
    for (const opacity of [-0.01, 1.01]) {
      expect(mapGraphicSchema.safeParse(text({ opacity })).success).toBe(false);
    }
  });
});

describe('documento v2 con grafiche miste', () => {
  const base = (): MapDocumentV2 =>
    emptyMapDocumentV2('Mappa con grafiche', null, 1280, 720);

  it('legge un documento v2 pre-modifica e applica kind image solo alle grafiche storiche', () => {
    const legacyV2 = withGraphics(base(), [
      { id: 'legacy-1', assetId: ASSET_ID, x: 1, y: 2 },
    ]);

    const parsed = mapDocumentV2Schema.parse(legacyV2);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.layers[1].items[0]).toMatchObject({
      id: 'legacy-1',
      kind: 'image',
      assetId: ASSET_ID,
      x: 1,
      y: 2,
      scale: 1,
    });
  });

  it('accetta image, polygon e text nello stesso layer e mantiene schemaVersion 2', () => {
    const parsed = mapDocumentV2Schema.parse(withGraphics(base(), [
      { id: 'legacy-1', assetId: ASSET_ID, x: 1, y: 2 },
      polygon(),
      text(),
    ]));

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.layers[1].items).toHaveLength(3);
    expect(parsed.layers[1].items[0]).toMatchObject({ kind: 'image' });
    expect(parsed.layers[1].items[1]).toMatchObject({ kind: 'polygon' });
    expect(parsed.layers[1].items[2]).toMatchObject({ kind: 'text' });
    expect(parsed.layers[1].items[1]).toMatchObject({
      kind: 'polygon', fill: '#4ea1ff', opacity: 0.35, z: 0,
    });
    expect(parsed.layers[1].items[2]).toMatchObject({
      kind: 'text', fontFamily: 'sans', fontSize: 24, color: '#ffffff', opacity: 1, z: 0,
    });
  });

  it('fa round-trip parse → serialize → parse con le grafiche miste', () => {
    const parsed = mapDocumentV2Schema.parse(withGraphics(base(), [
      { id: 'legacy-1', assetId: ASSET_ID, x: 1, y: 2 },
      polygon(),
      text(),
    ]));

    const serialized = JSON.parse(JSON.stringify(parsed)) as unknown;

    expect(mapDocumentV2Schema.parse(serialized)).toEqual(parsed);
  });

  it('rifiuta una grafica con kind sconosciuto o non valida dentro il documento', () => {
    expect(mapDocumentV2Schema.safeParse(withGraphics(base(), [
      image({ kind: 'video' }),
    ])).success).toBe(false);
    expect(mapDocumentV2Schema.safeParse(withGraphics(base(), [
      polygon({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
    ])).success).toBe(false);
    expect(mapDocumentV2Schema.safeParse(withGraphics(base(), [
      text({ fontSize: 7 }),
    ])).success).toBe(false);
  });
});

describe('type guard e alias delle grafiche', () => {
  const items = (): MapGraphic[] => [
    mapGraphicSchema.parse({ id: 'legacy-1', assetId: ASSET_ID, x: 0, y: 0 }),
    mapGraphicSchema.parse(polygon()),
    mapGraphicSchema.parse(text()),
  ];

  it('isImageGraphic riconosce solo le immagini e restringe assetId', () => {
    const images = items().filter(mapLayerHelpers.isImageGraphic);
    const typed: ImageGraphic[] = images;

    expect(typed).toHaveLength(1);
    expect(typed[0]?.assetId).toBe(ASSET_ID);
  });

  it('isPolygonGraphic riconosce solo i poligoni e restringe points/fill', () => {
    const polygons = items().filter(mapLayerHelpers.isPolygonGraphic);
    const typed: PolygonGraphic[] = polygons;

    expect(typed).toHaveLength(1);
    expect(typed[0]?.points).toHaveLength(3);
    expect(typed[0]?.fill).toBe('#4ea1ff');
  });

  it('isTextGraphic riconosce solo i testi e restringe text/fontSize', () => {
    const texts = items().filter(mapLayerHelpers.isTextGraphic);
    const typed: TextGraphic[] = texts;

    expect(typed).toHaveLength(1);
    expect(typed[0]?.text).toBe('Sala del trono');
    expect(typed[0]?.fontSize).toBe(24);
  });
});
