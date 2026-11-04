import {
  emptyMapDocument,
  type Light,
  type MapDocument,
  type MapLayers,
  type MapSpawn,
  type PlayerStart,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  arrayInsert,
  arrayRemove,
  replaceFields,
  type MapCollectionItems,
  type MapCommand,
} from './map-command';

/** Il tipo di collezione del loot è parte del contratto dei comandi generici. */
type LootElement = MapCollectionItems['loot'];

const loot = (
  id: string,
  overrides: Partial<Omit<LootElement, 'id' | 'type'>> = {},
): LootElement => ({
  id,
  type: 'loot',
  itemId: 'potion-of-healing',
  x: 1,
  y: 2,
  quantity: 1,
  visible: true,
  ...overrides,
});

const lootA = loot('loot-a');
const lootB = loot('loot-b', { x: 3, y: 4 });
const lootC = loot('loot-c', { itemId: 'rope', quantity: 2 });

const light: Light & { type: 'light' } = {
  id: 'light-1',
  type: 'light',
  x: 0,
  y: 0,
  brightFeet: 20,
  dimFeet: 40,
  color: '#ffcc80',
  enabled: true,
  shape: 'circle',
  angle: 60,
};

const spawn: MapSpawn & { type: 'spawn' } = {
  id: 'spawn-1',
  type: 'spawn',
  kind: 'monster',
  x: 5,
  y: 5,
  source: { type: 'srd', monsterId: 'goblin' },
  label: 'Goblin',
  size: 1,
  hidden: false,
  quantity: 1,
};

const start: PlayerStart & { type: 'start' } = {
  id: 'start-1',
  type: 'start',
  x: 6,
  y: 6,
  label: 'PG 1',
};

const baseDocument = (): MapDocument => emptyMapDocument('Loot', null, 700, 700);

/** Documento con gli item indicati nel layer elements. */
const withElements = (items: MapLayers[3]['items']): MapDocument => {
  const doc = baseDocument();
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [background, graphics, constraints, { ...elements, items }],
  };
};

const elementsOf = (doc: MapDocument): MapLayers[3]['items'] => doc.layers[3].items;

const idsOf = (doc: MapDocument): string[] => elementsOf(doc).map((item) => item.id);

const lootOf = (doc: MapDocument): LootElement[] =>
  elementsOf(doc).filter((item): item is LootElement => item.type === 'loot');

const run = (doc: MapDocument, command: MapCommand, mode: 'apply' | 'invert'): MapDocument => {
  const next = structuredClone(doc);
  if (mode === 'apply') {
    command.apply(next);
  } else {
    command.invert(next);
  }
  return next;
};

const otherLayersEqual = (left: MapDocument, right: MapDocument): void => {
  expect(left.layers[0]).toEqual(right.layers[0]);
  expect(left.layers[1]).toEqual(right.layers[1]);
  expect(left.layers[2]).toEqual(right.layers[2]);
};

describe('arrayInsert loot', () => {
  it('inserisce il loot all’indice richiesto ignorando luci, spawn e partenze', () => {
    const doc = withElements([light, lootA, spawn, lootB, start]);

    const applied = run(doc, arrayInsert('loot', [lootC], 1), 'apply');

    expect(idsOf(applied)).toEqual([
      'light-1',
      'loot-a',
      'spawn-1',
      'loot-c',
      'loot-b',
      'start-1',
    ]);
    expect(elementsOf(applied).filter((item) => item.type === 'light')).toEqual([light]);
    expect(elementsOf(applied).filter((item) => item.type === 'spawn')).toEqual([spawn]);
    expect(elementsOf(applied).filter((item) => item.type === 'start')).toEqual([start]);
  });

  it('l’undo rimuove solo i loot inseriti e ripristina il documento', () => {
    const doc = withElements([light, lootA, spawn, lootB, start]);
    const lootD = loot('loot-d', { x: 7, y: 8 });
    const command = arrayInsert('loot', [lootC, lootD], 0);

    const applied = run(doc, command, 'apply');
    expect(idsOf(applied)).toEqual([
      'light-1',
      'loot-c',
      'loot-d',
      'loot-a',
      'spawn-1',
      'loot-b',
      'start-1',
    ]);
    expect(lootOf(applied).map((item) => item.id)).toEqual([
      'loot-c',
      'loot-d',
      'loot-a',
      'loot-b',
    ]);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('non muta il documento ricevuto né gli altri layer', () => {
    const doc = withElements([light, lootA]);
    const before = structuredClone(doc);

    const applied = run(doc, arrayInsert('loot', [lootB]), 'apply');

    expect(doc).toEqual(before);
    otherLayersEqual(applied, doc);
  });

  it('espone un label non vuoto e stima i byte', () => {
    const command = arrayInsert('loot', [lootA]);

    expect(command.label).not.toContain('undefined');
    expect(command.label.trim().length).toBeGreaterThan(0);
    expect(command.bytes).toBeGreaterThan(0);
  });
});

describe('arrayRemove loot', () => {
  it('rimuove solo il loot per id preservando gli altri elementi e l’ordine', () => {
    const doc = withElements([light, lootA, spawn, lootB, start]);
    const command = arrayRemove('loot', lootA, 1);

    const applied = run(doc, command, 'apply');
    expect(idsOf(applied)).toEqual(['light-1', 'spawn-1', 'loot-b', 'start-1']);
    expect(lootOf(applied)).toEqual([lootB]);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('id inesistente è un no-op in apply e in invert', () => {
    const doc = withElements([light, lootA]);
    const command = arrayRemove('loot', loot('missing'), 0);

    expect(run(doc, command, 'apply')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);

    const applied = run(doc, command, 'apply');
    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(lootOf(applied)).toEqual([lootA]);
  });

  it('espone un label non vuoto', () => {
    const command = arrayRemove('loot', lootA, 0);

    expect(command.label).not.toContain('undefined');
    expect(command.label.trim().length).toBeGreaterThan(0);
  });
});

describe('replaceFields loot', () => {
  it('aggiorna quantità e visibilità del solo loot target con undo completo', () => {
    const doc = withElements([light, lootA, spawn, lootB, start]);
    const command = replaceFields(
      'loot',
      lootA.id,
      { quantity: 1, visible: true },
      { quantity: 12, visible: false },
    );

    const applied = run(doc, command, 'apply');
    expect(lootOf(applied)[0]).toEqual({ ...lootA, quantity: 12, visible: false });
    expect(lootOf(applied)[1]).toEqual(lootB);
    expect(elementsOf(applied).filter((item) => item.type === 'light')).toEqual([light]);
    expect(elementsOf(applied).filter((item) => item.type === 'spawn')).toEqual([spawn]);
    expect(elementsOf(applied).filter((item) => item.type === 'start')).toEqual([start]);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('aggiorna l’itemId senza toccare gli altri loot', () => {
    const doc = withElements([lootA, lootB]);
    const command = replaceFields('loot', lootA.id, { itemId: lootA.itemId }, { itemId: 'rope' });

    const applied = run(doc, command, 'apply');
    expect(lootOf(applied)[0]?.itemId).toBe('rope');
    expect(lootOf(applied)[1]).toEqual(lootB);

    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('id inesistente è un no-op sia in apply sia in invert', () => {
    const doc = withElements([light, lootA]);
    const command = replaceFields('loot', 'missing', {}, { quantity: 99, visible: false });

    expect(run(doc, command, 'apply')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('non tocca gli altri layer', () => {
    const doc = withElements([lootA]);
    const applied = run(
      doc,
      replaceFields('loot', lootA.id, { quantity: 1 }, { quantity: 3 }),
      'apply',
    );

    otherLayersEqual(applied, doc);
  });
});
