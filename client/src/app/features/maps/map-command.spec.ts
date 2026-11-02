import {
  emptyMapDocument,
  type Light,
  type MapDocument,
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
  type MapCommand,
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

const baseDocument = (): MapDocument => {
  const empty = emptyMapDocument('Prova', null, 1280, 720);
  return {
    ...empty,
    terrain: { ...empty.terrain, walls: [wall], lights: [light] },
    spawns: [spawn],
    playerStarts: [start],
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
      return doc.terrain.walls;
    case 'light':
      return doc.terrain.lights;
    case 'spawn':
      return doc.spawns;
    case 'start':
      return doc.playerStarts;
  }
};

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
      command: (doc) => arrayRemove('wall', doc.terrain.walls[0]!, 0),
    },
    {
      kind: 'light',
      label: 'luce',
      element: light,
      doc: baseDocument(),
      command: (doc) => arrayRemove('light', doc.terrain.lights[0]!, 0),
    },
    {
      kind: 'spawn',
      label: 'spawn',
      element: spawn,
      doc: baseDocument(),
      command: (doc) => arrayRemove('spawn', doc.spawns[0]!, 0),
    },
    {
      kind: 'start',
      label: 'partenza',
      element: start,
      doc: baseDocument(),
      command: (doc) => arrayRemove('start', doc.playerStarts[0]!, 0),
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
    const command = arrayRemove('wall', doc.terrain.walls[0]!, 0);
    const applied = run(doc, command, 'apply');

    const undone = run(applied, command, 'invert');

    expect(undone.terrain.walls.map((entry) => entry.id)).toEqual(['wall-1']);
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
    expect(applied.terrain.walls[0]).toMatchObject({ kind: 'door', door: 'open' });

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

  it('round-trip sui campi del terreno', () => {
    const doc = baseDocument();
    const command = replaceFields(
      'terrain',
      { visionLimitFeet: doc.terrain.visionLimitFeet },
      { visionLimitFeet: 60 },
    );

    const applied = run(doc, command, 'apply');
    expect(applied.terrain.visionLimitFeet).toBe(60);

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
    expect(applied.imageAssetId).toBe('asset-1');
    expect(applied.backgroundTransform).toEqual(after.backgroundTransform);

    const undone = run(applied, command, 'invert');
    expect(undone).toEqual(doc);
    expect(undone.imageAssetId).toBeNull();

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
