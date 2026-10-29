import { describe, expect, it } from 'vitest';
import type { InitiativeEntry } from '../../schemas/scene.js';
import { nextInitiativeTurn, sortInitiativeEntries } from './initiative.js';

const entry = (id: string, value: number, tiebreak = 0): InitiativeEntry => ({
  id,
  tokenId: `token-${id}`,
  label: id,
  value,
  tiebreak,
  hidden: false,
  defeated: false,
});

describe('iniziativa', () => {
  it('ordina per valore, poi Destrezza, poi inserimento', () => {
    const sorted = sortInitiativeEntries([
      entry('a', 12, 1),
      entry('b', 18, 0),
      entry('c', 12, 3),
      entry('d', 12, 1),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('avanza turno e round', () => {
    const entries = [entry('a', 10), entry('b', 9)];
    expect(nextInitiativeTurn({ active: true, round: 1, turnIndex: 0, entries }))
      .toMatchObject({ round: 1, turnIndex: 1 });
    expect(nextInitiativeTurn({ active: true, round: 1, turnIndex: 1, entries }))
      .toMatchObject({ round: 2, turnIndex: 0 });
    expect(nextInitiativeTurn({ active: false, round: 1, turnIndex: 0, entries }))
      .toMatchObject({ active: false, round: 1, turnIndex: 0 });
  });
});
