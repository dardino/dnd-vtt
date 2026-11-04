import {
  emptyMapDocument,
  type BackgroundLayer,
  type BlockedArea,
  type ConstraintsLayer,
  type ElementsLayer,
  type Light,
  type MapDocument,
  type MapElement,
  type MapSpawn,
  type PlayerStart,
  type WallSegment,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  arrayInsert,
  arrayRemove,
  replaceBackground,
  replaceFields,
  replaceLayer,
  type MapCommand,
  type MapCollectionItems,
  type MapCollectionKind,
} from './map-command';

const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 0, y: 1 },
};

const secondWall: WallSegment = {
  id: 'wall-2',
  kind: 'door',
  door: 'closed',
  a: { x: 1, y: 0 },
  b: { x: 1, y: 1 },
};

const light: Light = {
  id: 'light-1',
  x: 1,
  y: 1,
  brightFeet: 20,
  dimFeet: 40,
  color: '#ffcc80',
  enabled: true,
  shape: 'circle',
  angle: 60,
};

const secondLight: Light = { ...light, id: 'light-2', x: 2, y: 2 };

const spawn: MapSpawn = {
  id: 'spawn-1',
  kind: 'monster',
  x: 1,
  y: 1,
  source: { type: 'srd', monsterId: 'goblin' },
  size: 1,
  hidden: false,
  quantity: 1,
};

const secondSpawn: MapSpawn = { ...spawn, id: 'spawn-2', x: 2, y: 2 };

const start: PlayerStart = { id: 'start-1', x: 0, y: 0 };
const secondStart: PlayerStart = { id: 'start-2', x: 1, y: 1 };

const area: BlockedArea = {
  id: 'area-1',
  shape: 'rect',
  points: [{ x: 2, y: 2 }, { x: 3, y: 3 }],
};

const secondArea: BlockedArea = {
  id: 'area-2',
  shape: 'polygon',
  points: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 5 }],
};

const backgroundOf = (doc: MapDocument): BackgroundLayer => doc.layers[0];
const constraintsOf = (doc: MapDocument): ConstraintsLayer => doc.layers[2];
const elementsOf = (doc: MapDocument): ElementsLayer => doc.layers[3];

const graphicsOf = (doc: MapDocument) => doc.layers[1].items;

const wallsOf = (doc: MapDocument): WallSegment[] =>
  constraintsOf(doc).items.filter((item): item is WallSegment => 'kind' in item);

const areasOf = (doc: MapDocument): BlockedArea[] =>
  constraintsOf(doc).items.filter((item): item is BlockedArea => 'shape' in item);

const lightsOf = (doc: MapDocument): Light[] =>
  elementsOf(doc).items.filter((item): item is Light & { type: 'light' } => item.type === 'light');

const spawnsOf = (doc: MapDocument): MapSpawn[] =>
  elementsOf(doc).items.filter((item): item is MapSpawn & { type: 'spawn' } => item.type === 'spawn');

const startsOf = (doc: MapDocument): PlayerStart[] =>
  elementsOf(doc).items.filter((item): item is PlayerStart & { type: 'start' } => item.type === 'start');

const lootsOf = (doc: MapDocument): MapCollectionItems['loot'][] =>
  elementsOf(doc).items.filter((item): item is MapCollectionItems['loot'] => item.type === 'loot');

const asElements = (
  items: readonly MapElement[],
): MapElement[] => items.map((item) => structuredClone(item));

const baseDocument = (): MapDocument => {
  const empty = emptyMapDocument('Prova', null, 1280, 720);
  const [background, graphics, constraints, elements] = empty.layers;
  return {
    ...empty,
    layers: [
      background,
      graphics,
      { ...constraints, items: [wall, area] },
      {
        ...elements,
        items: asElements([
          { ...light, type: 'light' },
          { ...spawn, type: 'spawn' },
          { ...start, type: 'start' },
        ]),
      },
    ],
  };
};

const run = (doc: MapDocument, command: MapCommand, mode: 'apply' | 'invert'): MapDocument => {
  const next = structuredClone(doc);
  if (mode === 'apply') {
    command.apply(next);
  } else {
    command.invert(next);
  }
  return next;
};

const collectionItems = (
  doc: MapDocument,
  kind: MapCollectionKind,
): readonly { id: string }[] => {
  switch (kind) {
    case 'wall':
      return wallsOf(doc);
    case 'light':
      return lightsOf(doc);
    case 'spawn':
      return spawnsOf(doc);
    case 'start':
      return startsOf(doc);
    case 'graphic':
      return graphicsOf(doc);
    case 'area':
      return areasOf(doc);
    case 'loot':
      return lootsOf(doc);
  }
};

describe('collectionItems area', () => {
  it('restituisce solo le aree del layer constraints ignorando i muri', () => {
    const doc = baseDocument();

    expect(collectionItems(doc, 'area').map((item) => item.id)).toEqual([area.id]);
  });
});

describe('arrayInsert', () => {
  const cases: ReadonlyArray<{
    kind: MapCollectionKind;
    label: string;
    doc: MapDocument;
    command: () => MapCommand;
  }> = [
    { kind: 'wall', label: 'muro', doc: baseDocument(), command: () => arrayInsert('wall', [secondWall], 1) },
    { kind: 'light', label: 'luce', doc: baseDocument(), command: () => arrayInsert('light', [secondLight], 0) },
    { kind: 'spawn', label: 'spawn', doc: baseDocument(), command: () => arrayInsert('spawn', [secondSpawn]) },
    { kind: 'start', label: 'partenza', doc: baseDocument(), command: () => arrayInsert('start', [secondStart], 1) },
    { kind: 'area', label: 'area', doc: baseDocument(), command: () => arrayInsert('area', [secondArea], 0) },
  ];

  for (const testCase of cases) {
    it(`round-trip apply→invert e invert→apply per ${testCase.label}`, () => {
      const command = testCase.command();
      const initial = testCase.doc;

      const applied = run(initial, command, 'apply');
      expect(collectionItems(applied, testCase.kind)).toHaveLength(
        collectionItems(initial, testCase.kind).length + 1,
      );

      const undone = run(applied, command, 'invert');
      expect(undone).toEqual(initial);

      const redone = run(undone, command, 'apply');
      expect(redone).toEqual(applied);
    });
  }

  it('invert con id inesistente è un no-op', () => {
    const command = arrayInsert('wall', [secondWall], 0);
    const doc = baseDocument();

    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('non muta il documento ricevuto', () => {
    const doc = baseDocument();
    const before = structuredClone(doc);

    run(doc, arrayInsert('wall', [secondWall], 0), 'apply');

    expect(doc).toEqual(before);
  });
});

describe('arrayRemove', () => {
  const cases: ReadonlyArray<{
    kind: MapCollectionKind;
    label: string;
    element: { id: string };
    doc: MapDocument;
    command: (doc: MapDocument) => MapCommand;
  }> = [
    {
      kind: 'wall',
      label: 'muro',
      element: wall,
      doc: baseDocument(),
      command: (doc) => arrayRemove('wall', wallsOf(doc)[0]!, 0),
    },
    {
      kind: 'light',
      label: 'luce',
      element: light,
      doc: baseDocument(),
      command: (doc) => arrayRemove('light', lightsOf(doc)[0]!, 0),
    },
    {
      kind: 'spawn',
      label: 'spawn',
      element: spawn,
      doc: baseDocument(),
      command: (doc) => arrayRemove('spawn', spawnsOf(doc)[0]!, 0),
    },
    {
      kind: 'start',
      label: 'partenza',
      element: start,
      doc: baseDocument(),
      command: (doc) => arrayRemove('start', startsOf(doc)[0]!, 0),
    },
    {
      kind: 'area',
      label: 'area',
      element: area,
      doc: baseDocument(),
      command: (doc) => arrayRemove('area', areasOf(doc)[0]!, 0),
    },
  ];

  for (const testCase of cases) {
    it(`round-trip apply→invert e invert→apply per ${testCase.label}`, () => {
      const command = testCase.command(testCase.doc);
      const initial = testCase.doc;

      const applied = run(initial, command, 'apply');
      expect(collectionItems(applied, testCase.kind)).toHaveLength(
        collectionItems(initial, testCase.kind).length - 1,
      );

      const undone = run(applied, command, 'invert');
      expect(undone).toEqual(initial);

      const redone = run(undone, command, 'apply');
      expect(redone).toEqual(applied);
    });
  }

  it('apply con id inesistente è un no-op', () => {
    const doc = baseDocument();
    const command = arrayRemove('wall', secondWall, 0);

    expect(run(doc, command, 'apply')).toEqual(doc);
  });

  it('ripristina l’elemento all’indice originale', () => {
    const doc = baseDocument();
    const command = arrayRemove('wall', wallsOf(doc)[0]!, 0);
    const applied = run(doc, command, 'apply');

    const undone = run(applied, command, 'invert');

    expect(wallsOf(undone).map((entry) => entry.id)).toEqual(['wall-1']);
  });
});

describe('replaceFields', () => {
  it('round-trip su un elemento di collezione', () => {
    const doc = baseDocument();
    const command = replaceFields('wall', wall.id, { kind: 'wall' }, {
      kind: 'door',
      door: 'open',
    });

    const applied = run(doc, command, 'apply');
    expect(wallsOf(applied)[0]).toMatchObject({ kind: 'door', door: 'open' });

    const undone = run(applied, command, 'invert');
    expect(undone).toEqual(doc);

    expect(run(undone, command, 'apply')).toEqual(applied);
  });

  it('round-trip sui campi del documento', () => {
    const doc = baseDocument();
    const command = replaceFields('map', { notes: '', showDoorIcons: true }, {
      notes: 'Nota',
      showDoorIcons: false,
    });

    const applied = run(doc, command, 'apply');
    expect(applied).toMatchObject({ notes: 'Nota', showDoorIcons: false });

    const undone = run(applied, command, 'invert');
    expect(undone).toEqual(doc);

    expect(run(undone, command, 'apply')).toEqual(applied);
  });

  it('round-trip sui campi v2 del documento (visione)', () => {
    const doc = baseDocument();
    const command = replaceFields(
      'map',
      { visionLimitFeet: doc.visionLimitFeet },
      { visionLimitFeet: 60 },
    );

    const applied = run(doc, command, 'apply');
    expect(applied.visionLimitFeet).toBe(60);

    const undone = run(applied, command, 'invert');
    expect(undone).toEqual(doc);

    expect(run(undone, command, 'apply')).toEqual(applied);
  });

  it('round-trip sui campi della griglia', () => {
    const doc = baseDocument();
    const command = replaceFields('grid', { cellSizePx: 70 }, { cellSizePx: 50 });

    const applied = run(doc, command, 'apply');
    expect(applied.grid.cellSizePx).toBe(50);

    const undone = run(applied, command, 'invert');
    expect(undone).toEqual(doc);

    expect(run(undone, command, 'apply')).toEqual(applied);
  });

  it('id inesistente è un no-op sia in apply sia in invert', () => {
    const doc = baseDocument();
    const command = replaceFields('spawn', 'missing', { hidden: false }, { hidden: true });

    expect(run(doc, command, 'apply')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });
});

describe('replaceBackground', () => {
  const before = { imageAssetId: null, backgroundTransform: { x: 0, y: 0, scale: 1 } };
  const after = { imageAssetId: 'asset-1', backgroundTransform: { x: 12, y: -4, scale: 1.5 } };

  it('round-trip apply→invert e invert→apply', () => {
    const doc = baseDocument();
    const command = replaceBackground(before, after);

    const applied = run(doc, command, 'apply');
    expect(backgroundOf(applied).imageAssetId).toBe('asset-1');
    expect(backgroundOf(applied).imageTransform).toEqual(after.backgroundTransform);
    // Gli altri layer non vengono toccati dal cambio sfondo.
    expect(applied.layers[1]).toEqual(doc.layers[1]);
    expect(applied.layers[2]).toEqual(doc.layers[2]);
    expect(applied.layers[3]).toEqual(doc.layers[3]);

    const undone = run(applied, command, 'invert');
    expect(undone).toEqual(doc);
    expect(backgroundOf(undone).imageAssetId).toBeNull();

    expect(run(undone, command, 'apply')).toEqual(applied);
  });

  it('non cambia mai widthPx/heightPx', () => {
    const doc = baseDocument();
    const command = replaceBackground(
      { imageAssetId: null, backgroundTransform: { x: 0, y: 0, scale: 1 } },
      { imageAssetId: 'asset-1', backgroundTransform: { x: 1, y: 2, scale: 2 } },
    );

    const applied = run(doc, command, 'apply');

    expect(applied.widthPx).toBe(doc.widthPx);
    expect(applied.heightPx).toBe(doc.heightPx);
  });
});

describe('replaceLayer', () => {
  const kinds = ['background', 'graphics', 'constraints', 'elements'] as const;

  it('round-trip apply→invert e invert→apply su ogni layer', () => {
    kinds.forEach((kind, index) => {
      const doc = baseDocument();
      const command = replaceLayer(
        kind,
        { visible: true, locked: false },
        { visible: false, locked: true, opacity: 0.5 },
      );

      const applied = run(doc, command, 'apply');
      expect(applied.layers[index]).toMatchObject({
        kind,
        visible: false,
        locked: true,
        opacity: 0.5,
      });

      const undone = run(applied, command, 'invert');
      expect(undone).toEqual(doc);
      expect(run(undone, command, 'apply')).toEqual(applied);
    });
  });

  it('tocca solo il layer richiesto e conserva gli item', () => {
    const doc = baseDocument();
    const applied = run(doc, replaceLayer('constraints', { locked: false }, { locked: true }), 'apply');

    expect(applied.layers[2].locked).toBe(true);
    expect(applied.layers[2].items).toEqual(doc.layers[2].items);
    expect(applied.layers[0]).toEqual(doc.layers[0]);
    expect(applied.layers[1]).toEqual(doc.layers[1]);
    expect(applied.layers[3]).toEqual(doc.layers[3]);
  });

  it('conserva i campi del layer non presenti nel patch', () => {
    const doc = baseDocument();
    const applied = run(doc, replaceLayer('background', { opacity: 1 }, { opacity: 0.25 }), 'apply');

    expect(backgroundOf(applied)).toMatchObject({
      imageAssetId: null,
      opacity: 0.25,
      visible: true,
      locked: false,
    });
    expect(backgroundOf(applied).imageTransform).toEqual(backgroundOf(doc).imageTransform);
  });

  it('stima i byte del patch e espone un label non vuoto', () => {
    const command = replaceLayer('elements', {}, { opacity: 0.5, visible: false });

    expect(command.bytes).toBeGreaterThan(0);
    expect(command.label).not.toBe('');
  });

  it('applicato direttamente al documento tocca solo il layer target', () => {
    const doc = baseDocument();
    const before = structuredClone(doc);
    const command = replaceLayer('elements', {}, { opacity: 0.5, visible: false });

    // Senza clonare: il comando muta il documento che riceve, ma solo il layer
    // richiesto. Gli altri layer e gli item devono restare identici.
    command.apply(doc);

    expect(elementsOf(doc)).toMatchObject({ opacity: 0.5, visible: false });
    expect(elementsOf(doc).items).toEqual(before.layers[3].items);
    expect(backgroundOf(doc)).toEqual(before.layers[0]);
    expect(doc.layers[1]).toEqual(before.layers[1]);
    expect(constraintsOf(doc)).toEqual(before.layers[2]);
  });
});
