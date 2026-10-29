import type { InitiativeEntry } from '../../schemas/scene.js';

/**
 * Ordina per valore, poi per modificatore di Destrezza; a parità resta
 * l'ordine di inserimento, così due console vedono lo stesso turno.
 */
export const sortInitiativeEntries = (
  entries: readonly InitiativeEntry[],
): InitiativeEntry[] => entries
  .map((entry, index) => ({ entry, index }))
  .sort((a, b) =>
    b.entry.value - a.entry.value
    || b.entry.tiebreak - a.entry.tiebreak
    || a.index - b.index)
  .map(({ entry }) => entry);

export const nextInitiativeTurn = (state: {
  active: boolean;
  round: number;
  turnIndex: number;
  entries: InitiativeEntry[];
}): { active: boolean; round: number; turnIndex: number; entries: InitiativeEntry[] } => {
  if (!state.active || state.entries.length === 0) {
    return state;
  }
  if (state.turnIndex + 1 >= state.entries.length) {
    return { ...state, round: state.round + 1, turnIndex: 0 };
  }
  return { ...state, turnIndex: state.turnIndex + 1 };
};
