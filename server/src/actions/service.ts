import {
  applyAction,
  invertAction,
  sceneStateSchema,
  type ActionLogEntry,
  type ActionRequest,
  type AppliedAction,
  type GameAction,
  type SceneSnapshot,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { and, eq } from 'drizzle-orm';
import type { AppDatabase, DbExecutor } from '../db/client.js';
import {
  deleteActionLogForCampaign,
  deleteFogActionLogForScene,
  findActionLogEntry,
  insertActionLog,
  listActionLog,
  listActionLogSince,
  listAppliedThrough,
  listLastUndoneBatch,
  markActionsApplied,
  markActionsUndone,
  pruneActionLog,
} from '../db/action-log.repository.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { getScene, getSceneState } from '../db/scenes.repository.js';
import { scenes } from '../db/schema.js';
import { AppError, notFound } from '../errors.js';
import { syncPcActorsFromState } from '../actors/token-sync.js';

const tokenLabel = (token: TokenState | undefined, tokenId: string): string =>
  token?.label ?? tokenId;

const describeAction = (state: SceneState, action: GameAction): string => {
  switch (action.type) {
    case 'token.add':
      return `Token aggiunto: ${action.token.label}`;
    case 'token.move': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      return `${tokenLabel(token, action.tokenId)}: spostato${action.force === true ? ' (forzato)' : ''}`;
    }
    case 'token.light': {
      const token = state.tokens.find((entry) => entry.id === action.tokenId);
      return `${tokenLabel(token, action.tokenId)}: luce ${action.light === null ? 'rimossa' : 'impostata'}`;
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
    case 'initiative.set':
      return action.initiative.active ? 'Iniziativa aggiornata' : 'Iniziativa terminata';
    case 'initiative.next':
      return 'Turno successivo';
    case 'fog.apply':
      return action.op.op === 'reveal' ? 'Fog: area rivelata' : 'Fog: area nascosta';
    case 'fog.remove':
      return 'Fog: operazione annullata';
    case 'fog.replace':
      return 'Fog: copertura aggiornata';
    case 'fog.override':
      return action.override === 'reveal'
        ? 'Fog: rivela tutto'
        : action.override === 'hide'
          ? 'Fog: nascondi tutto'
          : 'Fog: override rimosso';
    case 'drawing.add':
      return 'Disegno aggiunto';
    case 'drawing.remove':
      return 'Disegno rimosso';
    case 'terrain.door': {
      const wall = state.terrain.walls.find((entry) => entry.id === action.wallId);
      const label = wall?.kind === 'door' ? 'Porta' : 'Muro';
      return `${label}: ${action.state === 'open' ? 'aperta' : action.state === 'secret' ? 'segreta' : 'chiusa'}`;
    }
    case 'terrain.light': {
      const light = state.terrain.lights.find((entry) => entry.id === action.lightId);
      return `Luce ${light?.id ?? action.lightId}: ${action.enabled ? 'accesa' : 'spenta'}`;
    }
    case 'terrain.ambient':
      return `Luce ambientale: ${action.ambientLight}`;
    case 'terrain.vision':
      return `Visione automatica: ${action.enabled ? 'attiva' : 'manuale'}`;
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
  if (
    (input.request.action.type === 'fog.apply' && state.fog.ops.length >= 2000)
    || (input.request.action.type === 'fog.replace' && input.request.action.ops.length > 2000)
  ) {
    throw new AppError('payload_too_large', 413, 'La fog ha raggiunto il limite di 2000 operazioni');
  }
  const inverse = invertOrStale(state, input.request.action);
  const nextState = applyOrStale(state, input.request.action);
  syncPcActorsFromState(tx, nextState);
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

const snapshotFrom = (db: DbExecutor, sceneId: string, state: SceneState, stateVersion: number): SceneSnapshot => {
  const scene = getScene(db, sceneId);
  if (scene === null) {
    throw notFound('Scena non trovata');
  }
  return { scene, state, stateVersion };
};

const selectedApplied = (entry: ActionLogEntry): void => {
  if (entry.status !== 'applied') {
    throw new AppError('action_not_undoable', 409, 'L’azione è già stata annullata');
  }
};

/**
 * Annulla l'azione selezionata e tutte le più recenti della stessa scena,
 * applicando gli inversi in ordine inverso e marcando le righe come `undone`.
 */
export const undoThrough = (
  db: AppDatabase,
  campaignId: string,
  entryId: string,
): { snapshot: SceneSnapshot; undone: number } => db.transaction((tx) => {
  const entry = findActionLogEntry(tx, entryId);
  if (entry === null) {
    throw notFound('Azione non trovata');
  }
  if (entry.sceneId === null) {
    throw new AppError('action_not_undoable', 409, 'Azione non annullabile');
  }
  selectedApplied(entry);
  const stored = getSceneState(tx, entry.sceneId);
  const row = tx.select().from(scenes).where(eq(scenes.id, entry.sceneId)).get();
  if (stored === null || row === undefined) {
    throw notFound('Scena non trovata');
  }
  if (row.campaignId !== campaignId) {
    throw new AppError('action_not_undoable', 409, 'Azione non annullabile');
  }
  const through = listAppliedThrough(tx, campaignId, entry.sceneId, entry.createdAt, entry.id);
  if (through.length === 0) {
    throw new AppError('action_not_undoable', 409, 'Azione non annullabile');
  }
  let state = sceneStateSchema.parse(stored.state);
  for (const target of through) {
    state = applyOrStale(state, target.inverse);
  }
  syncPcActorsFromState(tx, state);
  const stateVersion = row.stateVersion + 1;
  const now = new Date().toISOString();
  const updated = tx.update(scenes)
    .set({ state: JSON.stringify(state), stateVersion, updatedAt: now })
    .where(and(eq(scenes.id, row.id), eq(scenes.stateVersion, row.stateVersion)))
    .run();
  if (updated.changes === 0) {
    throw new AppError('state_conflict', 409, 'La scena è stata modificata altrove');
  }
  markActionsUndone(tx, through.map((target) => target.id), now);
  return {
    snapshot: snapshotFrom(tx, entry.sceneId, state, stateVersion),
    undone: through.length,
  };
});

/** Ripete l'ultimo batch annullato, in ordine cronologico. */
export const redoLastBatch = (
  db: AppDatabase,
  campaignId: string,
): { snapshot: SceneSnapshot; redone: number } => db.transaction((tx) => {
  const batch = listLastUndoneBatch(tx, campaignId);
  if (batch.length === 0) {
    throw new AppError('action_not_undoable', 409, 'Nessuna azione da ripetere');
  }
  const sceneId = batch[0]?.sceneId ?? null;
  if (sceneId === null || batch.some((entry) => entry.sceneId !== sceneId)) {
    throw new AppError('action_not_undoable', 409, 'Il batch non appartiene a una sola scena');
  }
  const stored = getSceneState(tx, sceneId);
  const row = tx.select().from(scenes).where(eq(scenes.id, sceneId)).get();
  if (stored === null || row === undefined) {
    throw notFound('Scena non trovata');
  }
  let state = sceneStateSchema.parse(stored.state);
  for (const target of batch) {
    state = applyOrStale(state, target.payload);
  }
  syncPcActorsFromState(tx, state);
  const stateVersion = row.stateVersion + 1;
  const now = new Date().toISOString();
  const updated = tx.update(scenes)
    .set({ state: JSON.stringify(state), stateVersion, updatedAt: now })
    .where(and(eq(scenes.id, row.id), eq(scenes.stateVersion, row.stateVersion)))
    .run();
  if (updated.changes === 0) {
    throw new AppError('state_conflict', 409, 'La scena è stata modificata altrove');
  }
  markActionsApplied(tx, batch.map((target) => target.id));
  return {
    snapshot: snapshotFrom(tx, sceneId, state, stateVersion),
    redone: batch.length,
  };
});

/**
 * Svuota la history della campagna lasciando intatto lo stato corrente:
 * quello che è a schermo diventa il nuovo punto di partenza.
 */
export const clearCampaignHistory = (
  db: AppDatabase,
  campaignId: string,
): { cleared: number } => db.transaction((tx) => {
  if (getCampaign(tx, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  return { cleared: deleteActionLogForCampaign(tx, campaignId) };
});

/**
 * Riporta la fog a "tutta coperta" e rimuove dalla history solo le azioni fog
 * della scena. Le altre azioni restano annullabili.
 */
export const resetSceneFog = (
  db: AppDatabase,
  campaignId: string,
  sceneId: string,
): { snapshot: SceneSnapshot; cleared: number } => db.transaction((tx) => {
  const row = tx.select().from(scenes).where(eq(scenes.id, sceneId)).get();
  if (row === undefined || row.campaignId !== campaignId) {
    throw notFound('Scena non trovata');
  }
  const state = sceneStateSchema.parse(JSON.parse(row.state) as unknown);
  const nextState: SceneState = {
    ...state,
    fog: { base: 'hidden', ops: [], override: 'none' },
  };
  const stateVersion = row.stateVersion + 1;
  const updated = tx.update(scenes)
    .set({
      state: JSON.stringify(nextState),
      stateVersion,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(scenes.id, row.id), eq(scenes.stateVersion, row.stateVersion)))
    .run();
  if (updated.changes === 0) {
    throw new AppError('state_conflict', 409, 'La scena è stata modificata altrove');
  }
  return {
    snapshot: snapshotFrom(tx, sceneId, nextState, stateVersion),
    cleared: deleteFogActionLogForScene(tx, campaignId, sceneId),
  };
});
