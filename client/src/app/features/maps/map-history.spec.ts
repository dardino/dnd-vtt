import {
  emptyMapDocument,
  type MapDocument,
  type MapElement,
  type WallSegment,
} from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import { replaceFields, type MapCommand } from './map-command';
import {
  MAP_COMMAND_HISTORY_LIMITS,
  MapHistory,
  estimateJsonBytes,
} from './map-history';

describe('estimateJsonBytes', () => {
  it('stima i byte UTF-8 del JSON serializzato', () => {
    expect(estimateJsonBytes('ok')).toBe(4);
    expect(estimateJsonBytes({ a: 1 })).toBe(7);
    expect(estimateJsonBytes(undefined)).toBe(0);
  });
});

const mapDocument = (): MapDocument => emptyMapDocument('Prova', null, 1280, 720);

const command = (
  bytes: number,
  apply: (doc: MapDocument) => void = (doc) => {
    doc.notes = 'edit';
  },
  invert: (doc: MapDocument) => void = (doc) => {
    doc.notes = '';
  },
): MapCommand => ({ label: 'Test', bytes, apply, invert });

describe('MapHistory', () => {
  it('esegue su un clone e supporta undo/redo', () => {
    const history = new MapHistory();
    const doc = mapDocument();

    const applied = history.execute(doc, command(10));
    expect(applied.notes).toBe('edit');
    expect(doc.notes).toBe('');
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.bytes).toBe(10);

    const undone = history.undo(applied);
    expect(undone?.notes).toBe('');
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.bytes).toBe(10);

    const redone = history.redo(undone ?? mapDocument());
    expect(redone?.notes).toBe('edit');
    expect(history.undoCount).toBe(1);
    expect(history.redoCount).toBe(0);
  });

  it('restituisce null quando non c’è nulla da annullare o riapplicare', () => {
    const history = new MapHistory();

    expect(history.undo(mapDocument())).toBeNull();
    expect(history.redo(mapDocument())).toBeNull();
  });

  it('svuota il redo dopo un nuovo edit', () => {
    const history = new MapHistory();
    const applied = history.execute(mapDocument(), command(10, (doc) => {
      doc.notes = 'a';
    }));
    const undone = history.undo(applied) ?? mapDocument();
    expect(history.canRedo).toBe(true);

    const next = history.execute(undone, command(10, (doc) => {
      doc.notes = 'b';
    }));

    expect(next.notes).toBe('b');
    expect(history.canRedo).toBe(false);
    expect(history.redoCount).toBe(0);
    expect(history.bytes).toBe(10);
  });

  it('scarta i comandi più vecchi quando supera il numero massimo', () => {
    const history = new MapHistory({ maxEntries: 2, maxBytes: 1000 });
    let doc = mapDocument();
    for (let index = 0; index < 3; index += 1) {
      doc = history.execute(doc, command(1));
    }

    expect(history.undoCount).toBe(2);
    expect(history.bytes).toBe(2);
  });

  it('scarta i comandi più vecchi quando supera il budget in byte', () => {
    const history = new MapHistory({ maxEntries: 200, maxBytes: 100 });
    let doc = mapDocument();
    for (let index = 0; index < 3; index += 1) {
      doc = history.execute(doc, command(40));
    }

    expect(history.undoCount).toBe(2);
    expect(history.bytes).toBe(80);
  });

  it('svuota la history se un singolo comando supera il budget', () => {
    const history = new MapHistory({ maxEntries: 200, maxBytes: 5 });
    const doc = mapDocument();

    const next = history.execute(doc, command(10));

    expect(next.notes).toBe('edit');
    expect(history.undoCount).toBe(0);
    expect(history.bytes).toBe(0);
  });

  it('applica il budget di default di 200 comandi e 32 MB', () => {
    expect(MAP_COMMAND_HISTORY_LIMITS).toEqual({ maxEntries: 200, maxBytes: 32 * 1024 * 1024 });

    const history = new MapHistory();
    let doc = mapDocument();
    for (let index = 0; index < 205; index += 1) {
      doc = history.execute(doc, command(1));
    }

    expect(history.undoCount).toBe(200);
    expect(history.bytes).toBe(200);
  });

  it('1000 edit su un documento grande non accumulano il documento in history', () => {
    const empty = mapDocument();
    const walls = Array.from({ length: 4000 }, (_, index): WallSegment => ({
      id: `wall-${index}`,
      kind: 'wall',
      a: { x: index % 100, y: Math.floor(index / 100) },
      b: { x: (index % 100) + 1, y: Math.floor(index / 100) },
    }));
    const spawns = Array.from({ length: 500 }, (_, index): MapElement => ({
      id: `spawn-${index}`,
      type: 'spawn',
      kind: 'monster',
      x: index % 100,
      y: Math.floor(index / 100),
      source: { type: 'srd', monsterId: 'goblin' },
      size: 1,
      hidden: false,
      quantity: 1,
    }));
    const [background, graphics, constraints, elements] = empty.layers;
    const base: MapDocument = {
      ...empty,
      layers: [
        background,
        graphics,
        { ...constraints, items: walls },
        { ...elements, items: spawns },
      ],
    };
    const documentBytes = estimateJsonBytes(base);
    const history = new MapHistory();
    let doc = base;
    for (let index = 0; index < 1000; index += 1) {
      doc = history.execute(doc, replaceFields('map', { notes: '' }, { notes: `edit-${index}` }));
    }

    expect(doc.notes).toBe('edit-999');
    expect(history.undoCount).toBe(200);
    expect(history.bytes).toBeLessThan(documentBytes);
    expect(history.bytes).toBeLessThan(256 * 1024);
  }, 30_000);

  it('clear svuota stack e budget', () => {
    const history = new MapHistory();
    const applied = history.execute(mapDocument(), command(10));
    history.undo(applied);
    expect(history.bytes).toBe(10);

    history.clear();

    expect(history.undoCount).toBe(0);
    expect(history.redoCount).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.bytes).toBe(0);
  });
});
