import { describe, expect, it } from 'vitest';
import { applyAction, invertAction } from './actions.js';
import { createDefaultSceneState, type TokenState } from '../../schemas/scene.js';

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
      op: { id: 'op-1', op: 'reveal', shape: { type: 'rect', x: 0, y: 0, width: 2, height: 2 } },
    });
    expect(state.fog.ops).toHaveLength(1);
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

  it('inverte una operazione di fog', () => {
    const inverse = invertAction(createDefaultSceneState(), {
      type: 'fog.apply',
      op: { id: 'op-1', op: 'reveal', shape: { type: 'rect', x: 0, y: 0, width: 2, height: 2 } },
    });
    expect(inverse).toMatchObject({ type: 'fog.apply', op: { op: 'hide' } });
  });
});
