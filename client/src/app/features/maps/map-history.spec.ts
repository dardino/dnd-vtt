import { emptyMapDocument, type MapDocument } from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import type { MapCommand } from './map-command';
import {
  MAP_COMMAND_HISTORY_LIMITS,
  MapHistory,
  estimateJsonBytes,
  pushBoundedHistory,
  snapshotOf,
  type HistorySnapshot,
} from './map-history';

const entry = (value: string, bytes: number): HistorySnapshot<string> => ({ value, bytes });

const values = (history: readonly HistorySnapshot<string>[]): string[] =>
  history.map((snapshot) => snapshot.value);

const totalBytes = (history: readonly HistorySnapshot<string>[]): number =>
  history.reduce((total, snapshot) => total + snapshot.bytes, 0);

describe('pushBoundedHistory', () => {
  it('mantiene l’ordine cronologico e limita il numero di snapshot', () => {
    let history: HistorySnapshot<string>[] = [];
    for (const value of ['a', 'b', 'c', 'd']) {
      history = pushBoundedHistory(history, entry(value, 1), { maxEntries: 3, maxBytes: 100 });
    }

    expect(values(history)).toEqual(['b', 'c', 'd']);
  });

  it('scarta i più vecchi finché rientra nel budget in byte', () => {
    let history: HistorySnapshot<string>[] = [];
    for (const value of ['a', 'b', 'c']) {
      history = pushBoundedHistory(history, entry(value, 4), { maxEntries: 50, maxBytes: 9 });
    }

    expect(values(history)).toEqual(['b', 'c']);
    expect(totalBytes(history)).toBe(8);
  });

  it('rispetta entrambi i limiti nello stesso push', () => {
    let history: HistorySnapshot<string>[] = [];
    for (const value of ['a', 'b', 'c', 'd']) {
      history = pushBoundedHistory(history, entry(value, 2), { maxEntries: 3, maxBytes: 6 });
    }

    expect(values(history)).toEqual(['b', 'c', 'd']);
    expect(totalBytes(history)).toBe(6);
  });

  it('non muta la history ricevuta', () => {
    const original = [entry('a', 1)];

    const next = pushBoundedHistory(original, entry('b', 1), { maxEntries: 1, maxBytes: 10 });

    expect(values(original)).toEqual(['a']);
    expect(values(next)).toEqual(['b']);
  });

  it('svuota la history quando il singolo snapshot supera il budget', () => {
    const history = pushBoundedHistory([], entry('enorme', 10), { maxEntries: 50, maxBytes: 5 });

    expect(history).toEqual([]);
  });
});

describe('snapshotOf', () => {
  it('stima i byte dal JSON serializzato', () => {
    expect(estimateJsonBytes('ok')).toBe(4);
    expect(snapshotOf({ a: 1 })).toEqual({ value: { a: 1 }, bytes: 7 });
  });

  it('accetta una funzione di misura iniettata', () => {
    expect(snapshotOf('abc', (value) => value.length)).toEqual({ value: 'abc', bytes: 3 });
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
