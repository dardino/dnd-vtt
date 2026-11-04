import {
  emptyMapDocument,
  type BlockedArea,
  type MapDocument,
  type MapLayers,
  type WallSegment,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  arrayInsert,
  arrayRemove,
  replaceFields,
  type MapCommand,
} from './map-command';

const wall = (id: string, y: number): WallSegment => ({
  id,
  kind: 'wall',
  a: { x: 0, y },
  b: { x: 2, y },
});

const wallA = wall('wall-a', 0);
const wallB = wall('wall-b', 1);

const rect = (
  id: string,
  a: BlockedArea['points'][number],
  b: BlockedArea['points'][number],
): BlockedArea => ({
  id,
  shape: 'rect',
  points: [a, b],
});

const polygon = (id: string): BlockedArea => ({
  id,
  shape: 'polygon',
  points: [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }],
});

const areaA = rect('area-a', { x: 0, y: 0 }, { x: 2, y: 2 });
const areaB = rect('area-b', { x: 3, y: 3 }, { x: 5, y: 5 });
const areaC = polygon('area-c');

const baseDocument = (): MapDocument => emptyMapDocument('Aree', null, 700, 700);

/** Documento con gli item indicati nel layer constraints. */
const withConstraints = (items: MapLayers[2]['items']): MapDocument => {
  const doc = baseDocument();
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [background, graphics, { ...constraints, items }, elements],
  };
};

const itemsOf = (doc: MapDocument): MapLayers[2]['items'] => doc.layers[2].items;

const idsOf = (doc: MapDocument): string[] => itemsOf(doc).map((item) => item.id);

const wallsOf = (doc: MapDocument): WallSegment[] =>
  itemsOf(doc).filter((item): item is WallSegment => 'kind' in item);

const areasOf = (doc: MapDocument): BlockedArea[] =>
  itemsOf(doc).filter((item): item is BlockedArea => 'shape' in item);

const run = (doc: MapDocument, command: MapCommand, mode: 'apply' | 'invert'): MapDocument => {
  const next = structuredClone(doc);
  if (mode === 'apply') {
    command.apply(next);
  } else {
    command.invert(next);
  }
  return next;
};

describe('arrayInsert area', () => {
  it('inserisce l’area in coda al layer constraints senza toccare i muri', () => {
    const doc = withConstraints([wallA, wallB]);
    const command = arrayInsert('area', [areaA]);

    const applied = run(doc, command, 'apply');
    expect(idsOf(applied)).toEqual(['wall-a', 'wall-b', 'area-a']);
    expect(wallsOf(applied)).toEqual([wallA, wallB]);
    expect(areasOf(applied)).toEqual([areaA]);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('rispetta l’indice tra le aree ignorando i muri intercalati', () => {
    const doc = withConstraints([wallA, areaA, wallB, areaB]);

    const applied = run(doc, arrayInsert('area', [areaC], 1), 'apply');

    expect(idsOf(applied)).toEqual(['wall-a', 'area-a', 'wall-b', 'area-c', 'area-b']);
    expect(wallsOf(applied)).toEqual([wallA, wallB]);
  });

  it('l’undo rimuove solo le aree inserite e ripristina i muri originali', () => {
    const doc = withConstraints([wallA, areaA, wallB]);
    const command = arrayInsert('area', [areaB, areaC], 0);

    const applied = run(doc, command, 'apply');
    expect(idsOf(applied)).toEqual(['wall-a', 'area-b', 'area-c', 'area-a', 'wall-b']);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('non muta il documento ricevuto', () => {
    const doc = withConstraints([wallA]);
    const before = structuredClone(doc);

    run(doc, arrayInsert('area', [areaA]), 'apply');

    expect(doc).toEqual(before);
  });
});

describe('arrayRemove area', () => {
  it('rimuove l’area per id preservando i muri e la posizione relativa', () => {
    const doc = withConstraints([wallA, areaA, wallB, areaB]);
    const command = arrayRemove('area', areaA, 1);

    const applied = run(doc, command, 'apply');
    expect(idsOf(applied)).toEqual(['wall-a', 'wall-b', 'area-b']);
    expect(wallsOf(applied)).toEqual([wallA, wallB]);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'apply')).toEqual(applied);
  });

  it('id inesistente è un no-op in apply e in invert', () => {
    const doc = withConstraints([wallA, areaA, wallB]);
    const command = arrayRemove('area', rect('missing', { x: 0, y: 0 }, { x: 1, y: 1 }), 0);

    expect(run(doc, command, 'apply')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);

    const applied = run(doc, command, 'apply');
    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('rimuovere un’area non elimina i muri con lo stesso prefisso di id', () => {
    const doc = withConstraints([wallA, areaA, wallB]);
    const applied = run(doc, arrayRemove('area', areaA, 1), 'apply');

    expect(idsOf(applied)).toEqual(['wall-a', 'wall-b']);
  });
});

describe('replaceFields area', () => {
  it('aggiorna solo l’etichetta dell’area target', () => {
    const doc = withConstraints([wallA, areaA, wallB]);
    const command = replaceFields('area', areaA.id, {}, { label: 'Sala' });

    const applied = run(doc, command, 'apply');
    expect(areasOf(applied)[0]).toEqual({ ...areaA, label: 'Sala' });
    expect(wallsOf(applied)).toEqual([wallA, wallB]);

    expect(run(applied, command, 'invert')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('aggiorna i vertici di un rettangolo con undo completo', () => {
    const doc = withConstraints([areaA]);
    const nextPoints = [{ x: 0, y: 0 }, { x: 5, y: 4 }] as BlockedArea['points'];
    const command = replaceFields('area', areaA.id, { points: areaA.points }, { points: nextPoints });

    const applied = run(doc, command, 'apply');
    expect(areasOf(applied)[0]?.points).toEqual(nextPoints);

    expect(run(applied, command, 'invert')).toEqual(doc);
  });

  it('id inesistente è un no-op sia in apply sia in invert', () => {
    const doc = withConstraints([wallA, areaA]);
    const command = replaceFields('area', 'missing', {}, { label: 'Fantasma' });

    expect(run(doc, command, 'apply')).toEqual(doc);
    expect(run(doc, command, 'invert')).toEqual(doc);
  });

  it('la rimozione di un’etichetta opzionale è invertibile', () => {
    const labelled: BlockedArea = { ...areaA, label: 'Sala' };
    const doc = withConstraints([labelled]);
    const command = replaceFields('area', areaA.id, { label: 'Sala' }, {});

    const applied = run(doc, command, 'apply');
    expect(areasOf(applied)[0]).toEqual(areaA);
    expect(areasOf(applied)[0]).not.toHaveProperty('label');

    expect(run(applied, command, 'invert')).toEqual(doc);
  });
});
