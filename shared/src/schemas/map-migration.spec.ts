import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import * as barrel from '../index.js';
import {
  ACTOR_ID,
  ASSET_ID,
  legacyCompleteMapDocument,
  legacyMinimalMapDocument,
} from '../test/map-documents.js';
import { emptyMapDocumentV2, mapDocumentV2Schema, type MapDocumentV2 } from './map-document.js';
import { legacyMapDocumentSchema, migrateMapDocument } from './map-legacy.js';
import {
  blockedAreaSchema,
  mapConstraintSchema,
  mapElementSchema,
  mapGraphicSchema,
  mapLayerKindSchema,
  mapLayersSchema,
} from './map-layers.js';
import { mapDocumentSchema } from './map.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const validV2 = (): MapDocumentV2 =>
  emptyMapDocumentV2('Mappa v2', ASSET_ID, 1400, 1000, { x: 5, y: 6, scale: 2 });

const replaceLayer = (
  doc: MapDocumentV2,
  index: number,
  mutation: (layer: Record<string, unknown>) => Record<string, unknown>,
): unknown => {
  const layers = doc.layers.map((layer) => ({ ...(layer as unknown as Record<string, unknown>) }));
  const current = layers[index];
  if (current === undefined) {
    throw new Error(`layer ${index} assente`);
  }
  layers[index] = mutation(current);
  return { ...doc, layers };
};

describe('migrazione v1 → v2', () => {
  it('migra un documento v1 completo senza perdite', () => {
    const source = legacyCompleteMapDocument();
    const migrated = migrateMapDocument(source);

    // L'output deve essere un documento v2 valido, non solo una forma simile.
    expect(mapDocumentV2Schema.safeParse(migrated).success).toBe(true);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe('Cripta dei goblin');
    expect(migrated.backgroundColor).toBe('rgba(20, 30, 40, 1)');
    expect(migrated.widthPx).toBe(1400);
    expect(migrated.heightPx).toBe(1000);
    expect(migrated.grid).toEqual(source.grid);
    expect(migrated.startView).toEqual({ x: 100, y: 80, zoom: 1.5 });
    expect(migrated.fogBase).toBe('revealed');
    expect(migrated.showDoorIcons).toBe(false);
    expect(migrated.notes).toBe('Nota del master');
    expect(migrated.ambientLight).toBe('dim');
    expect(migrated.visionLimitFeet).toBe(60);
    expect(migrated.visionEnabled).toBe(true);
    for (const field of ['imageAssetId', 'backgroundTransform', 'terrain', 'spawns', 'playerStarts']) {
      expect(migrated).not.toHaveProperty(field);
    }

    expect(migrated.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    expect(migrated.layers.map((layer) => layer.id))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    for (const layer of migrated.layers) {
      expect(layer).toMatchObject({ visible: true, locked: false, opacity: 1 });
    }

    const [background, graphics, constraints, elements] = migrated.layers;
    expect(background.imageAssetId).toBe(ASSET_ID);
    expect(background.imageTransform).toEqual({ x: 12, y: -8, scale: 1.25 });
    expect(graphics.items).toEqual([]);
    expect(constraints.items.map((item) => item.id)).toEqual(['wall-1', 'door-1']);
    expect(constraints.items[0]).toMatchObject({
      id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 },
    });
    expect(constraints.items[1]).toMatchObject({
      id: 'door-1', kind: 'door', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, door: 'open',
    });

    expect(elements.items).toHaveLength(4);
    expect(elements.items.find((item) => item.id === 'light-1')).toMatchObject({
      type: 'light', x: 3, y: 4, brightFeet: 20, dimFeet: 40,
      color: '#ffcc80', enabled: true, shape: 'circle', direction: 90, angle: 60,
    });
    expect(elements.items.find((item) => item.id === 'spawn-srd')).toMatchObject({
      type: 'spawn', kind: 'monster', x: 2, y: 3,
      source: { type: 'srd', monsterId: 'goblin' },
      label: 'Goblin', size: 1, hidden: false, quantity: 2,
    });
    expect(elements.items.find((item) => item.id === 'spawn-actor')).toMatchObject({
      type: 'spawn', kind: 'npc', source: { type: 'actor', actorId: ACTOR_ID }, hidden: true,
    });
    expect(elements.items.find((item) => item.id === 'start-1')).toMatchObject({
      type: 'start', x: 1, y: 1, label: 'Ingresso',
    });
    expect(elements.items.some((item) => item.type === 'loot')).toBe(false);
  });

  it('applica i default v2 partendo dal documento v1 minimo', () => {
    const migrated = migrateMapDocument(legacyMinimalMapDocument());

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.backgroundColor).toBe('rgba(255, 255, 255, 1)');
    expect(migrated.fogBase).toBe('hidden');
    expect(migrated.showDoorIcons).toBe(true);
    expect(migrated.notes).toBe('');
    expect(migrated.ambientLight).toBe('dark');
    expect(migrated.visionLimitFeet).toBe(120);
    expect(migrated.visionEnabled).toBe(true);
    expect(migrated.startView).toBeUndefined();

    const [background, graphics, constraints, elements] = migrated.layers;
    expect(background).toMatchObject({
      id: 'background', kind: 'background', imageAssetId: null,
      visible: true, locked: false, opacity: 1,
    });
    expect(background.imageTransform).toEqual({ x: 0, y: 0, scale: 1 });
    expect(graphics.items).toEqual([]);
    expect(constraints.items).toEqual([]);
    expect(elements.items).toEqual([]);
  });
});

describe('validazione del documento v2', () => {
  it('fa round-trip parse → serialize → parse', () => {
    const parsed = mapDocumentV2Schema.parse(validV2());
    const serialized = JSON.parse(JSON.stringify(parsed)) as unknown;
    expect(mapDocumentV2Schema.parse(serialized)).toEqual(parsed);
  });

  it('rifiuta campi sconosciuti a livello documento e dentro un layer', () => {
    expect(mapDocumentV2Schema.safeParse({ ...validV2(), extra: true }).success).toBe(false);
    const invalid = replaceLayer(validV2(), 1, (layer) => ({ ...layer, extra: true }));
    expect(mapDocumentV2Schema.safeParse(invalid).success).toBe(false);
  });

  it('rifiuta layer fuori ordine, duplicati o mancanti', () => {
    const doc = validV2();
    const [background, graphics, constraints, elements] = doc.layers;
    expect(mapDocumentV2Schema.safeParse({
      ...doc, layers: [graphics, background, constraints, elements],
    }).success).toBe(false);
    expect(mapDocumentV2Schema.safeParse({
      ...doc, layers: [background, graphics, graphics, elements],
    }).success).toBe(false);
    expect(mapDocumentV2Schema.safeParse({
      ...doc, layers: [background, graphics, constraints],
    }).success).toBe(false);
  });

  it('rifiuta schemaVersion diversa da 2', () => {
    expect(mapDocumentV2Schema.safeParse({ ...validV2(), schemaVersion: 1 }).success).toBe(false);
    expect(mapDocumentV2Schema.safeParse({ ...validV2(), schemaVersion: 3 }).success).toBe(false);
  });

  it('rifiuta i campi del documento v1', () => {
    for (const field of ['imageAssetId', 'backgroundTransform', 'terrain', 'spawns', 'playerStarts']) {
      expect(mapDocumentV2Schema.safeParse({ ...validV2(), [field]: null }).success).toBe(false);
    }
  });

  it('accetta opacity 0..1 e rifiuta i valori fuori scala', () => {
    for (const opacity of [0, 1]) {
      const doc = replaceLayer(validV2(), 1, (layer) => ({ ...layer, opacity }));
      expect(mapDocumentV2Schema.safeParse(doc).success).toBe(true);
    }
    for (const opacity of [1.01, -0.01]) {
      const doc = replaceLayer(validV2(), 1, (layer) => ({ ...layer, opacity }));
      expect(mapDocumentV2Schema.safeParse(doc).success).toBe(false);
    }
  });
});

describe('migrateMapDocument', () => {
  it('è idempotente su un documento v2 e non muta l\'input', () => {
    const v2 = validV2();
    const snapshot = clone(v2);
    const migrated = migrateMapDocument(v2);

    expect(migrated).toEqual(v2);
    expect(migrateMapDocument(migrated)).toEqual(migrated);
    expect(v2).toEqual(snapshot);
  });

  it('non muta l\'input v1', () => {
    const input = legacyCompleteMapDocument();
    const snapshot = clone(input);
    migrateMapDocument(input);
    expect(input).toEqual(snapshot);
  });

  it('lancia ZodError su input invalido o garbage', () => {
    for (const input of [{}, null, 'garbage', 42, [], { schemaVersion: 2 }]) {
      expect(() => migrateMapDocument(input)).toThrow(ZodError);
    }
    const invalidV2 = replaceLayer(validV2(), 1, (layer) => ({ ...layer, opacity: 2 }));
    expect(() => migrateMapDocument(invalidV2)).toThrow(ZodError);
  });
});

describe('emptyMapDocumentV2', () => {
  it('crea i quattro layer canonici con id pari al kind', () => {
    const doc = emptyMapDocumentV2('Nuova', ASSET_ID, 1400, 1000, { x: 5, y: 6, scale: 2 });

    expect(doc.schemaVersion).toBe(2);
    expect(doc.name).toBe('Nuova');
    expect(doc.widthPx).toBe(1400);
    expect(doc.heightPx).toBe(1000);
    expect(doc.backgroundColor).toBe('rgba(255, 255, 255, 1)');
    expect(doc.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    expect(doc.layers.map((layer) => layer.id))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);

    const [background, graphics, constraints, elements] = doc.layers;
    expect(background.imageAssetId).toBe(ASSET_ID);
    expect(background.imageTransform).toEqual({ x: 5, y: 6, scale: 2 });
    expect(graphics.items).toEqual([]);
    expect(constraints.items).toEqual([]);
    expect(elements.items).toEqual([]);
    for (const layer of doc.layers) {
      expect(layer).toMatchObject({ visible: true, locked: false, opacity: 1 });
    }
  });

  it('usa la trasformazione neutra e i default del documento quando non forniti', () => {
    const doc = emptyMapDocumentV2('Nuova', null, 1280, 720);
    const [background] = doc.layers;

    expect(background.imageAssetId).toBeNull();
    expect(background.imageTransform).toEqual({ x: 0, y: 0, scale: 1 });
    expect(doc.startView).toBeUndefined();
    expect(doc.fogBase).toBe('hidden');
    expect(doc.showDoorIcons).toBe(true);
    expect(doc.notes).toBe('');
    expect(mapDocumentV2Schema.safeParse(doc).success).toBe(true);
  });

  it.each([
    [20000, 100, 120],
    [5600, 100, 120],
    [100, 100, 7],
    [70, 70, 5],
    [1, 1, 1],
  ])('limita visionLimitFeet per %ix%i a %i', (widthPx, heightPx, expected) => {
    const doc = emptyMapDocumentV2('Mappa', null, widthPx, heightPx);
    expect(doc.visionLimitFeet).toBe(expected);
  });
});

describe('layer, aree bloccate ed elementi', () => {
  const rect = {
    id: 'area-1',
    shape: 'rect' as const,
    points: [{ x: 0, y: 0 }, { x: 2, y: 2 }],
  };
  const polygon = {
    id: 'area-2',
    shape: 'polygon' as const,
    points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }],
  };

  it('espone i kind nell\'ordine canonico', () => {
    expect(mapLayerKindSchema.options).toEqual(['background', 'graphics', 'constraints', 'elements']);
  });

  it('applica i default di base e delle collezioni', () => {
    const [background, graphics, constraints, elements] = mapLayersSchema.parse([
      { id: 'background', kind: 'background', imageAssetId: null },
      { id: 'graphics', kind: 'graphics' },
      { id: 'constraints', kind: 'constraints' },
      { id: 'elements', kind: 'elements' },
    ]);

    expect(background.imageTransform).toEqual({ x: 0, y: 0, scale: 1 });
    expect(graphics.items).toEqual([]);
    expect(constraints.items).toEqual([]);
    expect(elements.items).toEqual([]);
    for (const layer of [background, graphics, constraints, elements]) {
      expect(layer).toMatchObject({ visible: true, locked: false, opacity: 1 });
    }
  });

  it('rifiuta una tupla con kind fuori posto', () => {
    expect(mapLayersSchema.safeParse([
      { id: 'graphics', kind: 'graphics' },
      { id: 'background', kind: 'background', imageAssetId: null },
      { id: 'constraints', kind: 'constraints' },
      { id: 'elements', kind: 'elements' },
    ]).success).toBe(false);
  });

  it('applica i default di una grafica storica e valida asset, scala e z-order', () => {
    expect(mapGraphicSchema.parse({ id: 'g-1', assetId: ASSET_ID, x: 10, y: 20 })).toEqual({
      id: 'g-1', kind: 'image', assetId: ASSET_ID, x: 10, y: 20,
      scale: 1, rotation: 0, flipH: false, flipV: false, opacity: 1, z: 0,
    });
    expect(mapGraphicSchema.safeParse({
      id: 'g-1', assetId: ASSET_ID, x: 0, y: 0, scale: 0,
    }).success).toBe(false);
    expect(mapGraphicSchema.safeParse({
      id: 'g-1', assetId: 'non-un-uuid', x: 0, y: 0,
    }).success).toBe(false);
    expect(mapGraphicSchema.safeParse({
      id: 'g-1', assetId: ASSET_ID, x: 0, y: 0, z: -1,
    }).success).toBe(false);
  });

  it('accetta rect con esattamente due punti e polygon con almeno tre', () => {
    expect(blockedAreaSchema.parse(rect)).toEqual(rect);
    expect(blockedAreaSchema.parse(polygon)).toEqual(polygon);
    expect(blockedAreaSchema.parse({ ...rect, label: 'Sala' }).label).toBe('Sala');
  });

  it('rifiuta un numero errato di punti per rect e polygon', () => {
    expect(blockedAreaSchema.safeParse({ ...rect, points: [{ x: 0, y: 0 }] }).success).toBe(false);
    expect(blockedAreaSchema.safeParse({
      ...rect, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
    }).success).toBe(false);
    expect(blockedAreaSchema.safeParse({
      ...polygon, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    }).success).toBe(false);
  });

  it('rifiuta vertici non interi e label vuote', () => {
    expect(blockedAreaSchema.safeParse({
      ...rect, points: [{ x: 0.5, y: 0 }, { x: 2, y: 2 }],
    }).success).toBe(false);
    expect(blockedAreaSchema.safeParse({
      ...polygon, points: [{ x: 0, y: 0 }, { x: 4.5, y: 0 }, { x: 4, y: 3 }],
    }).success).toBe(false);
    expect(blockedAreaSchema.safeParse({ ...rect, label: '' }).success).toBe(false);
  });

  it('valida luci, spawn, partenze e loot con i default', () => {
    expect(mapElementSchema.parse({
      id: 'light-1', type: 'light', x: 1, y: 2, brightFeet: 20, dimFeet: 40,
    })).toMatchObject({
      type: 'light', color: '#ffcc80', enabled: true, shape: 'circle', angle: 60,
    });
    expect(mapElementSchema.parse({
      id: 'spawn-1', type: 'spawn', kind: 'monster', x: 1, y: 2,
      source: { type: 'srd', monsterId: 'goblin' },
    })).toMatchObject({ type: 'spawn', size: 1, hidden: false, quantity: 1 });
    expect(mapElementSchema.parse({ id: 'start-1', type: 'start', x: 1, y: 2 }))
      .toEqual({ id: 'start-1', type: 'start', x: 1, y: 2 });
    expect(mapElementSchema.parse({
      id: 'loot-1', type: 'loot', itemId: 'potion-of-healing', x: 3, y: 4,
    })).toEqual({
      id: 'loot-1', type: 'loot', itemId: 'potion-of-healing', x: 3, y: 4, quantity: 1, visible: true,
    });
  });

  it('rifiuta type sconosciuto e loot con quantità fuori scala', () => {
    const loot = { id: 'loot-1', type: 'loot', itemId: 'potion-of-healing', x: 3, y: 4 };
    expect(mapElementSchema.safeParse({ ...loot, type: 'trap' }).success).toBe(false);
    expect(mapElementSchema.safeParse({ ...loot, quantity: 0 }).success).toBe(false);
    expect(mapElementSchema.safeParse({ ...loot, quantity: 1000 }).success).toBe(false);
    expect(mapElementSchema.safeParse({ ...loot, quantity: 1.5 }).success).toBe(false);
    expect(mapElementSchema.safeParse({ ...loot, quantity: 999 }).success).toBe(true);
  });

  it('distingue muri e aree bloccate', () => {
    const wall = { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } };
    expect(mapConstraintSchema.parse(wall)).toEqual(wall);
    expect(mapConstraintSchema.parse(rect)).toEqual(rect);
    expect(mapConstraintSchema.safeParse({
      id: 'door-1', kind: 'door', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, door: 'open',
    }).success).toBe(true);
    expect(mapConstraintSchema.safeParse({
      id: 'x', kind: 'wall', shape: 'rect', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    }).success).toBe(false);
    expect(mapConstraintSchema.safeParse({ id: 'x', kind: 'wall', a: { x: 0, y: 0 } }).success)
      .toBe(false);
  });
});

describe('schema legacy e barrel', () => {
  it('legacyMapDocumentSchema resta la v1 senza schemaVersion', () => {
    const parsed = legacyMapDocumentSchema.parse(legacyCompleteMapDocument());
    expect(parsed).not.toHaveProperty('schemaVersion');
    expect(parsed.terrain.walls).toHaveLength(2);
    expect(parsed.spawns).toHaveLength(2);
    expect(parsed.playerStarts).toHaveLength(1);
    expect(legacyMapDocumentSchema.safeParse({
      ...legacyMinimalMapDocument(), schemaVersion: 2,
    }).success).toBe(false);
  });

  it('mapDocumentSchema di map.ts è il documento v2 canonico', () => {
    const parsed = mapDocumentSchema.parse(emptyMapDocumentV2('Mappa', ASSET_ID, 1400, 1000));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    expect(parsed.layers[0].imageAssetId).toBe(ASSET_ID);

    // La v1 non è più accettata dallo schema pubblico.
    expect(mapDocumentSchema.safeParse(legacyCompleteMapDocument()).success).toBe(false);
    expect(() => mapDocumentSchema.parse(legacyCompleteMapDocument())).toThrow(ZodError);
  });

  it('il barrel esporta i nuovi moduli', () => {
    expect(barrel.mapDocumentV2Schema).toBeDefined();
    expect(barrel.mapLayersSchema).toBeDefined();
    expect(barrel.legacyMapDocumentSchema).toBeDefined();
    expect(barrel.mapLayerKindSchema).toBeDefined();
    expect(typeof barrel.migrateMapDocument).toBe('function');
    expect(typeof barrel.emptyMapDocumentV2).toBe('function');
  });
});
