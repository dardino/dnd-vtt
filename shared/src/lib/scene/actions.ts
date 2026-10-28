import type { GameAction, SceneState, TokenPatch, TokenState } from '../../schemas/scene.js';

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

export const applyAction = (state: SceneState, action: GameAction): SceneState => {
  switch (action.type) {
    case 'token.add':
      if (state.tokens.some((token) => token.id === action.token.id)) {
        throw new Error(`token già presente: ${action.token.id}`);
      }
      return { ...state, tokens: [...state.tokens, action.token] };
    case 'token.move': {
      findToken(state, action.tokenId);
      return {
        ...state,
        tokens: state.tokens.map((token) =>
          token.id === action.tokenId ? { ...token, x: action.x, y: action.y } : token),
      };
    }
    case 'token.update':
      findToken(state, action.tokenId);
      return {
        ...state,
        tokens: state.tokens.map((token) =>
          token.id === action.tokenId ? withPatch(token, action.patch) : token),
      };
    case 'token.remove':
      findToken(state, action.tokenId);
      return { ...state, tokens: state.tokens.filter((token) => token.id !== action.tokenId) };
    case 'fog.apply':
      return {
        ...state,
        fog: { ...state.fog, ops: [...state.fog.ops, action.op] },
      };
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
    case 'fog.apply':
      return {
        type: 'fog.apply',
        op: {
          ...action.op,
          op: action.op.op === 'reveal' ? 'hide' : 'reveal',
        },
      };
    default: {
      const exhaustive: never = action;
      throw new Error(`azione sconosciuta: ${String(exhaustive)}`);
    }
  }
};
