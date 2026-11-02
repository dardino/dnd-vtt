import { describe, expect, it } from 'vitest';
import {
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
