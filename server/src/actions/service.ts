import {
  applyAction,
  invertAction,
  sceneStateSchema,
  type ActionRequest,
  type AppliedAction,
  type GameAction,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { findActionLogEntry, insertActionLog, listActionLog, listActionLogSince, pruneActionLog } from '../db/action-log.repository.js';
import { scenes } from '../db/schema.js';
import { AppError, notFound } from '../errors.js';

const tokenLabel = (token: TokenState | undefined, tokenId: string): string =>
  token?.label ?? tokenId;

const describeAction = (state: SceneState, action: GameAction): string => {
  switch (action.type) {
    case 'token.add':
      return `Token aggiunto: ${action.token.label}`;
    case 'token.move': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      return `${tokenLabel(token, action.tokenId)}: spostato`;
    }
    case 'token.update': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      return `${tokenLabel(token, action.tokenId)}: aggiornato`;
    }
    case 'token.remove': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      return `${tokenLabel(token, action.tokenId)}: rimosso`;
    }
    case 'token.hp': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      const change = action.delta < 0 ? `${action.delta}` : `+${action.delta}`;
      return `${tokenLabel(token, action.tokenId)}: PF ${change}`;
    }
    case 'token.condition': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      const verb = action.op === 'add' ? 'aggiunta' : action.op === 'remove' ? 'rimossa' : 'aggiornata';
      return `${tokenLabel(token, action.tokenId)}: condizione ${verb}`;
    }
    case 'grid.update':
      return action.grid.type === 'hex' ? 'Griglia esagonale' : 'Griglia quadrata';
    case 'fog.apply':
      return action.op.op === 'reveal' ? 'Fog: area rivelata' : 'Fog: area nascosta';
    default:
      return 'azione';
  }
};

const applyOrStale = (state: SceneState, action: GameAction): SceneState => {
  try {
    return applyAction(state, action);
  } catch (error) {
    throw new AppError(
      'action_stale',
      409,
      error instanceof Error ? error.message : 'Azione non applicabile',
    );
  }
};

const invertOrStale = (state: SceneState, action: GameAction): GameAction => {
  try {
    return invertAction(state, action);
  } catch (error) {
    throw new AppError(
      'action_stale',
      409,
      error instanceof Error ? error.message : 'Azione non invertibile',
    );
  }
};

export interface ApplyActionInput {
  campaignId: string;
  request: ActionRequest;
  origin: 'dm' | 'player';
  actorId?: string | null;
}

/**
 * Unico punto che muta `SceneState`: applica, calcola l'inverso, incrementa
 * `state_version`, scrive `action_log` ed elimina le righe oltre le 50 in
 * un'unica transazione (D34, D46).
 */
export const applySceneAction = (
  db: AppDatabase,
  input: ApplyActionInput,
): AppliedAction => db.transaction((tx) => {
  const row = tx.select().from(scenes).where(eq(scenes.id, input.request.sceneId)).get();
  if (row === undefined || row.campaignId !== input.campaignId) {
    throw notFound('Scena non trovata');
  }
  const existing = findActionLogEntry(tx, input.request.id);
  if (existing !== null) {
    return {
      id: existing.id,
      sceneId: existing.sceneId ?? input.request.sceneId,
      type: existing.type,
      label: existing.label,
      stateVersion: existing.stateVersion,
      action: existing.payload,
      inverse: existing.inverse,
      at: existing.createdAt,
    };
  }
  const state = sceneStateSchema.parse(JSON.parse(row.state) as unknown);
  const inverse = invertOrStale(state, input.request.action);
  const nextState = applyOrStale(state, input.request.action);
  const stateVersion = row.stateVersion + 1;
  const now = new Date().toISOString();
  const updated = tx.update(scenes)
    .set({ state: JSON.stringify(nextState), stateVersion, updatedAt: now })
    .where(and(eq(scenes.id, row.id), eq(scenes.stateVersion, row.stateVersion)))
    .run();
  if (updated.changes === 0) {
    throw new AppError('state_conflict', 409, 'La scena è stata modificata altrove');
  }
  insertActionLog(tx, {
    id: input.request.id,
    campaignId: input.campaignId,
    sceneId: row.id,
    actorId: input.actorId ?? null,
    clientId: input.request.clientId,
    origin: input.origin,
    type: input.request.action.type,
    label: describeAction(state, input.request.action),
    payload: input.request.action,
    inverse,
    stateVersion,
    createdAt: now,
  });
  pruneActionLog(tx, input.campaignId);
  return {
    id: input.request.id,
    sceneId: row.id,
    type: input.request.action.type,
    label: describeAction(state, input.request.action),
    stateVersion,
    action: input.request.action,
    inverse,
    at: now,
  };
});

export const listCampaignActions = (db: AppDatabase, campaignId: string) =>
  listActionLog(db, campaignId);

export const syncCampaignActions = (
  db: AppDatabase,
  campaignId: string,
  sinceVersion: number,
  sceneId?: string,
) => listActionLogSince(db, campaignId, sinceVersion, sceneId);
