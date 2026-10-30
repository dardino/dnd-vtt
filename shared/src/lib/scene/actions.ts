import type { Condition } from '../../schemas/common.js';
import type { GameAction, SceneState, TokenPatch, TokenState } from '../../schemas/scene.js';
import { nextInitiativeTurn } from './initiative.js';
import { applyHpDelta } from './hp.js';

const withPatch = (token: TokenState, patch: TokenPatch): TokenState => ({
  ...token,
  ...(patch.actorId === undefined ? {} : { actorId: patch.actorId }),
  ...(patch.label === undefined ? {} : { label: patch.label }),
  ...(patch.x === undefined ? {} : { x: patch.x }),
  ...(patch.y === undefined ? {} : { y: patch.y }),
  ...(patch.size === undefined ? {} : { size: patch.size }),
  ...(patch.rotation === undefined ? {} : { rotation: patch.rotation }),
  ...(patch.elevation === undefined ? {} : { elevation: patch.elevation }),
  ...(patch.hp === undefined ? {} : { hp: patch.hp }),
  ...(patch.ac === undefined ? {} : { ac: patch.ac }),
  ...(patch.conditions === undefined ? {} : { conditions: patch.conditions }),
  ...(patch.deathSaves === undefined ? {} : { deathSaves: patch.deathSaves }),
  ...(patch.visible === undefined ? {} : { visible: patch.visible }),
  ...(patch.owner === undefined ? {} : { owner: patch.owner }),
});

const findToken = (state: SceneState, tokenId: string): TokenState => {
  const token = state.tokens.find((entry) => entry.id === tokenId);
  if (token === undefined) {
    throw new Error(`token inesistente: ${tokenId}`);
  }
  return token;
};

const findCondition = (token: TokenState, name: Condition['name']): Condition | undefined =>
  token.conditions.find((condition) => condition.name === name);

const replaceToken = (
  state: SceneState,
  tokenId: string,
  update: (token: TokenState) => TokenState,
): SceneState => ({
  ...state,
  tokens: state.tokens.map((token) => (token.id === tokenId ? update(token) : token)),
});

export const applyAction = (state: SceneState, action: GameAction): SceneState => {
  switch (action.type) {
    case 'token.add':
      if (state.tokens.some((token) => token.id === action.token.id)) {
        throw new Error(`token già presente: ${action.token.id}`);
      }
      return { ...state, tokens: [...state.tokens, action.token] };
    case 'token.move': {
      findToken(state, action.tokenId);
      return replaceToken(state, action.tokenId, (token) => ({ ...token, x: action.x, y: action.y }));
    }
    case 'token.update':
      findToken(state, action.tokenId);
      return replaceToken(state, action.tokenId, (token) => withPatch(token, action.patch));
    case 'token.remove':
      findToken(state, action.tokenId);
      return { ...state, tokens: state.tokens.filter((token) => token.id !== action.tokenId) };
    case 'token.hp': {
      const token = findToken(state, action.tokenId);
      return replaceToken(state, action.tokenId, (entry) => ({
        ...entry,
        hp: applyHpDelta(token.hp, action.delta),
      }));
    }
    case 'token.condition': {
      findToken(state, action.tokenId);
      return replaceToken(state, action.tokenId, (token) => {
        const without = token.conditions.filter(
          (condition) => condition.name !== action.condition.name,
        );
        if (action.op === 'remove') {
          return { ...token, conditions: without };
        }
        const exists = findCondition(token, action.condition.name) !== undefined;
        if (action.op === 'update' && !exists) {
          throw new Error(`condizione inesistente: ${action.condition.name}`);
        }
        return { ...token, conditions: [...without, action.condition] };
      });
    }
    case 'fog.apply':
      return {
        ...state,
        fog: { ...state.fog, ops: [...state.fog.ops, action.op] },
      };
    case 'fog.remove':
      return {
        ...state,
        fog: { ...state.fog, ops: state.fog.ops.filter((op) => op.id !== action.opId) },
      };
    case 'fog.replace':
      return {
        ...state,
        fog: { base: action.base, ops: action.ops },
      };
    case 'drawing.add':
      return { ...state, drawings: [...state.drawings, action.drawing] };
    case 'drawing.remove':
      return {
        ...state,
        drawings: state.drawings.filter((drawing) => drawing.id !== action.drawingId),
      };
    case 'grid.update':
      return { ...state, grid: action.grid };
    case 'initiative.set':
      return { ...state, initiative: action.initiative };
    case 'initiative.next':
      return { ...state, initiative: nextInitiativeTurn(state.initiative) };
    default: {
      const exhaustive: never = action;
      throw new Error(`azione sconosciuta: ${String(exhaustive)}`);
    }
  }
};

export const invertAction = (stateBefore: SceneState, action: GameAction): GameAction => {
  switch (action.type) {
    case 'token.add':
      return { type: 'token.remove', tokenId: action.token.id };
    case 'token.move': {
      const token = findToken(stateBefore, action.tokenId);
      return { type: 'token.move', tokenId: action.tokenId, x: token.x, y: token.y };
    }
    case 'token.update': {
      const token = findToken(stateBefore, action.tokenId);
      const patch = Object.fromEntries(
        Object.keys(action.patch).map((key) => [key, token[key as keyof TokenState]]),
      );
      return { type: 'token.update', tokenId: action.tokenId, patch };
    }
    case 'token.remove': {
      const token = findToken(stateBefore, action.tokenId);
      return { type: 'token.add', token };
    }
    case 'token.hp': {
      const token = findToken(stateBefore, action.tokenId);
      return { type: 'token.update', tokenId: action.tokenId, patch: { hp: token.hp } };
    }
    case 'token.condition': {
      const token = findToken(stateBefore, action.tokenId);
      const previous = findCondition(token, action.condition.name);
      if (previous === undefined) {
        return { type: 'token.condition', tokenId: action.tokenId, op: 'remove', condition: action.condition };
      }
      return { type: 'token.condition', tokenId: action.tokenId, op: 'update', condition: previous };
    }
    case 'fog.apply':
      return { type: 'fog.remove', opId: action.op.id };
    case 'fog.remove': {
      const op = stateBefore.fog.ops.find((entry) => entry.id === action.opId);
      if (op === undefined) {
        throw new Error(`operazione fog inesistente: ${action.opId}`);
      }
      return { type: 'fog.apply', op };
    }
    case 'fog.replace':
      return {
        type: 'fog.replace',
        base: stateBefore.fog.base,
        ops: stateBefore.fog.ops,
      };
    case 'drawing.add':
      return { type: 'drawing.remove', drawingId: action.drawing.id };
    case 'drawing.remove': {
      const drawing = stateBefore.drawings.find((entry) => entry.id === action.drawingId);
      if (drawing === undefined) {
        throw new Error(`disegno inesistente: ${action.drawingId}`);
      }
      return { type: 'drawing.add', drawing };
    }
    case 'grid.update':
      return { type: 'grid.update', grid: stateBefore.grid };
    case 'initiative.set':
      return { type: 'initiative.set', initiative: stateBefore.initiative };
    case 'initiative.next':
      return { type: 'initiative.set', initiative: stateBefore.initiative };
    default: {
      const exhaustive: never = action;
      throw new Error(`azione sconosciuta: ${String(exhaustive)}`);
    }
  }
};
