import { describe, expect, it } from 'vitest';
import { applyAction, invertAction } from './actions.js';
import {
  createDefaultSceneState,
  type GameAction,
  type SceneState,
  type Terrain,
  type TokenState,
} from '../../schemas/scene.js';
import { fixtureTerrain } from './__fixtures__/walls.js';

const token = (overrides: Partial<TokenState> = {}): TokenState => ({
  id: 'token-1',
  label: 'Goblin',
  x: 1,
  y: 2,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
  ...overrides,
});

describe('applyAction', () => {
  it('aggiunge e rimuove un token senza mutare lo stato iniziale', () => {
    const initial = createDefaultSceneState();
    const added = applyAction(initial, { type: 'token.add', token: token() });

    expect(initial.tokens).toHaveLength(0);
    expect(added.tokens).toHaveLength(1);

    const removed = applyAction(added, { type: 'token.remove', tokenId: 'token-1' });
    expect(removed.tokens).toHaveLength(0);
  });

  it('sposta e aggiorna un token', () => {
    const state = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const moved = applyAction(state, { type: 'token.move', tokenId: 'token-1', x: 5, y: 6 });
    expect(moved.tokens[0]).toMatchObject({ x: 5, y: 6 });

    const updated = applyAction(moved, {
      type: 'token.update',
      tokenId: 'token-1',
      patch: { label: 'Hobgoblin', hp: { current: 5, max: 7, temp: 0 } },
    });
    expect(updated.tokens[0]).toMatchObject({ label: 'Hobgoblin', hp: { current: 5 } });
  });

  it('l’inverso di token.update rimuove i campi opzionali aggiunti', () => {
    const state = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const action = { type: 'token.update' as const, tokenId: 'token-1', patch: { ac: 15 } };
    const updated = applyAction(state, action);
    expect(updated.tokens[0]?.ac).toBe(15);

    const undone = applyAction(updated, invertAction(state, action));
    expect(undone.tokens[0]?.ac).toBeUndefined();
  });

  it('rifiuta un token inesistente', () => {
    expect(() => applyAction(createDefaultSceneState(), {
      type: 'token.move',
      tokenId: 'missing',
      x: 0,
      y: 0,
    })).toThrow(/inesistente/);
  });

  it('aggiunge una operazione di fog', () => {
    const state = applyAction(createDefaultSceneState(), {
      type: 'fog.apply',
      op: { id: 'op-1', op: 'reveal', shape: { type: 'rect', x: 0, y: 0, width: 2, height: 2 }, softness: 0 },
    });
    expect(state.fog.ops).toHaveLength(1);
  });

  it('applica danni, condizioni e griglia', () => {
    const state = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const damaged = applyAction(state, { type: 'token.hp', tokenId: 'token-1', delta: -3 });
    expect(damaged.tokens[0]?.hp.current).toBe(4);

    const poisoned = applyAction(damaged, {
      type: 'token.condition',
      tokenId: 'token-1',
      op: 'add',
      condition: { name: 'poisoned' },
    });
    expect(poisoned.tokens[0]?.conditions).toEqual([{ name: 'poisoned' }]);

    const removed = applyAction(poisoned, {
      type: 'token.condition',
      tokenId: 'token-1',
      op: 'remove',
      condition: { name: 'poisoned' },
    });
    expect(removed.tokens[0]?.conditions).toEqual([]);

    const hex = applyAction(removed, {
      type: 'grid.update',
      grid: { ...removed.grid, type: 'hex', cellSizePx: 64 },
    });
    expect(hex.grid).toMatchObject({ type: 'hex', cellSizePx: 64 });
  });
});

describe('invertAction', () => {
  it('inverte add con remove', () => {
    const initial = createDefaultSceneState();
    const action = { type: 'token.add' as const, token: token() };
    const inverse = invertAction(initial, action);
    expect(inverse).toEqual({ type: 'token.remove', tokenId: 'token-1' });
  });

  it('riporta un move alla posizione precedente', () => {
    const state = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const inverse = invertAction(state, { type: 'token.move', tokenId: 'token-1', x: 9, y: 9 });
    expect(inverse).toEqual({ type: 'token.move', tokenId: 'token-1', x: 1, y: 2 });
  });

  it('riporta solo i campi toccati da un update', () => {
    const state = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const inverse = invertAction(state, {
      type: 'token.update',
      tokenId: 'token-1',
      patch: { label: 'Altro', visible: false },
    });
    expect(inverse).toEqual({
      type: 'token.update',
      tokenId: 'token-1',
      patch: { label: 'Goblin', visible: true },
    });
  });

  it('ripristina un token rimosso', () => {
    const state = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const inverse = invertAction(state, { type: 'token.remove', tokenId: 'token-1' });
    expect(inverse).toEqual({ type: 'token.add', token: token() });
  });

  it('inverte una operazione di fog rimuovendola e la ripristina', () => {
    const op = { id: 'op-1', op: 'reveal' as const, shape: { type: 'rect' as const, x: 0, y: 0, width: 2, height: 2 }, softness: 0 };
    const state = applyAction(createDefaultSceneState(), { type: 'fog.apply', op });
    const inverse = invertAction(state, { type: 'fog.apply', op });
    expect(inverse).toEqual({ type: 'fog.remove', opId: 'op-1' });
    const undone = applyAction(state, inverse);
    expect(undone.fog.ops).toHaveLength(0);
    expect(invertAction(state, inverse)).toEqual({ type: 'fog.apply', op });
  });

  it('inverte hp e condizioni ripristinando lo stato precedente', () => {
    const base = applyAction(createDefaultSceneState(), { type: 'token.add', token: token() });
    const withCondition = applyAction(base, {
      type: 'token.condition',
      tokenId: 'token-1',
      op: 'add',
      condition: { name: 'prone' },
    });
    const hpInverse = invertAction(withCondition, { type: 'token.hp', tokenId: 'token-1', delta: -2 });
    expect(hpInverse).toEqual({ type: 'token.update', tokenId: 'token-1', patch: { hp: base.tokens[0]?.hp } });

    const conditionInverse = invertAction(withCondition, {
      type: 'token.condition',
      tokenId: 'token-1',
      op: 'remove',
      condition: { name: 'prone' },
    });
    expect(conditionInverse).toMatchObject({ op: 'update', condition: { name: 'prone' } });
  });

  it('inverte grid.update con la griglia precedente', () => {
    const state = createDefaultSceneState();
    const next = { ...state.grid, type: 'hex' as const };
    expect(invertAction(state, { type: 'grid.update', grid: next })).toEqual({
      type: 'grid.update',
      grid: state.grid,
    });
  });
});

describe('applyAction token.move con terreno', () => {
  const stateWith = (
    overrides: Partial<TokenState>,
    terrain: Terrain = fixtureTerrain(),
  ): SceneState => applyAction(createDefaultSceneState('hidden', terrain), {
    type: 'token.add',
    token: token(overrides),
  });

  it('rifiuta un movimento verso una cella non piazzabile', () => {
    const state = stateWith({ x: 10, y: 3 });
    expect(() => applyAction(state, {
      type: 'token.move',
      tokenId: 'token-1',
      x: 11,
      y: 4,
    })).toThrow();
  });

  it('force ignora la validazione geometrica', () => {
    const state = stateWith({ x: 10, y: 3 });
    const moved = applyAction(state, {
      type: 'token.move',
      tokenId: 'token-1',
      x: 11,
      y: 4,
      force: true,
    });
    expect(moved.tokens[0]).toMatchObject({ x: 11, y: 4 });
  });

  it('consente la fuga da una cella non piazzabile', () => {
    // `token.add` rifiuta (11,4): lo stato iniziale va costruito direttamente
    // per simulare un token già presente in una cella diventata invalida.
    const state: SceneState = {
      ...createDefaultSceneState('hidden', fixtureTerrain()),
      tokens: [token({ x: 11, y: 4 })],
    };
    const moved = applyAction(state, {
      type: 'token.move',
      tokenId: 'token-1',
      x: 12,
      y: 4,
    });
    expect(moved.tokens[0]).toMatchObject({ x: 12, y: 4 });
  });

  it('valida il footprint del token con size 2', () => {
    const state = stateWith({ x: 9, y: 3, size: 2 });
    expect(() => applyAction(state, {
      type: 'token.move',
      tokenId: 'token-1',
      x: 10,
      y: 3,
    })).toThrow();

    const moved = applyAction(state, {
      type: 'token.move',
      tokenId: 'token-1',
      x: 9,
      y: 4,
    });
    expect(moved.tokens[0]).toMatchObject({ x: 9, y: 4 });
  });

  it('force ignora anche il footprint con size 2', () => {
    const state = stateWith({ x: 9, y: 3, size: 2 });
    const moved = applyAction(state, {
      type: 'token.move',
      tokenId: 'token-1',
      x: 10,
      y: 3,
      force: true,
    });
    expect(moved.tokens[0]).toMatchObject({ x: 10, y: 3 });
  });

  it('l’inverso di un move forzato attraversa il muro grazie a force', () => {
    // Il muro orizzontale (7,5)-(11,5) separa l’origine (8,4) dalla
    // destinazione (8,6): senza `force` il movimento viene rifiutato.
    const state = stateWith({ x: 8, y: 4 });
    const action = {
      type: 'token.move' as const,
      tokenId: 'token-1',
      x: 8,
      y: 6,
      force: true,
    };
    expect(() => applyAction(state, { ...action, force: undefined })).toThrow(/muro|porta/);

    const moved = applyAction(state, action);
    expect(moved.tokens[0]).toMatchObject({ x: 8, y: 6 });

    const inverse = invertAction(state, action);
    const undone = applyAction(moved, inverse);
    expect(undone.tokens[0]).toMatchObject({ x: 8, y: 4 });

    expect(inverse).toMatchObject({
      type: 'token.move',
      tokenId: 'token-1',
      x: 8,
      y: 4,
      force: true,
    });
  });
});

describe('applyAction token.add con terreno', () => {
  const emptyState = (): SceneState => createDefaultSceneState('hidden', fixtureTerrain());

  it('rifiuta un token nella cella attraversata dal muro diagonale', () => {
    const state = emptyState();

    expect(() => applyAction(state, {
      type: 'token.add',
      token: token({ x: 11, y: 4 }),
    })).toThrow(/piazz|muro|occupat/i);
    expect(state.tokens).toHaveLength(0);
  });

  it('aggiunge un token in una cella valida', () => {
    const state = applyAction(emptyState(), {
      type: 'token.add',
      token: token({ x: 10, y: 3 }),
    });

    expect(state.tokens).toHaveLength(1);
    expect(state.tokens[0]).toMatchObject({ x: 10, y: 3 });
  });

  it('valida l’intero footprint quando il token è size 2', () => {
    const state = emptyState();

    expect(() => applyAction(state, {
      type: 'token.add',
      token: token({ x: 10, y: 3, size: 2 }),
    })).toThrow(/piazz|muro|occupat/i);
    expect(state.tokens).toHaveLength(0);

    const placed = applyAction(state, {
      type: 'token.add',
      token: token({ x: 10, y: 2, size: 2 }),
    });
    expect(placed.tokens).toHaveLength(1);
  });

  it('accetta la cella di una porta aperta e rifiuta quella di una porta chiusa', () => {
    const state = emptyState();

    const open = applyAction(state, {
      type: 'token.add',
      token: token({ id: 'open', x: 12, y: 3 }),
    });
    expect(open.tokens).toHaveLength(1);

    expect(() => applyAction(state, {
      type: 'token.add',
      token: token({ id: 'closed', x: 15, y: 3 }),
    })).toThrow(/piazz|muro|occupat/i);
  });

  it('non accetta force: token.add non ha una scorciatoia di piazzamento', () => {
    const state = emptyState();
    const action = {
      type: 'token.add',
      token: token({ x: 11, y: 4 }),
      force: true,
    } as unknown as GameAction;

    expect(() => applyAction(state, action)).toThrow(/piazz|muro|occupat/i);
    expect(state.tokens).toHaveLength(0);
  });

  it('senza terreno il piazzamento resta libero', () => {
    const state = applyAction(createDefaultSceneState(), {
      type: 'token.add',
      token: token({ x: 11, y: 4 }),
    });
    expect(state.tokens).toHaveLength(1);
  });
});
