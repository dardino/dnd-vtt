import { and, asc, desc, eq, gt, gte, inArray, isNotNull, notInArray, or, type SQL } from 'drizzle-orm';
import type { ActionLogEntry, ActionLogList } from '@dnd-vtt/shared';
import type { DbExecutor } from './client.js';
import { toActionLogEntry } from './mappers.js';
import { actionLog } from './schema.js';

export interface ActionLogInsert {
  id: string;
  campaignId: string;
  sceneId: string | null;
  actorId: string | null;
  clientId: string;
  origin: 'dm' | 'player';
  type: string;
  label: string;
  payload: unknown;
  inverse: unknown;
  stateVersion: number;
  createdAt: string;
}

export const insertActionLog = (db: DbExecutor, entry: ActionLogInsert): void => {
  db.insert(actionLog).values({
    ...entry,
    payload: JSON.stringify(entry.payload),
    inverse: JSON.stringify(entry.inverse),
    status: 'applied',
    undoneAt: null,
  }).run();
};

export const listActionLog = (db: DbExecutor, campaignId: string): ActionLogList => {
  const rows = db
    .select()
    .from(actionLog)
    .where(eq(actionLog.campaignId, campaignId))
    .orderBy(desc(actionLog.createdAt), desc(actionLog.id))
    .limit(50)
    .all();
  return { items: rows.map(toActionLogEntry) };
};

/**
 * Azioni applicate dopo una versione nota, in ordine di applicazione: è il
 * canale di riallineamento usato dalle console senza WebSocket (Fase 4).
 */
export const listActionLogSince = (
  db: DbExecutor,
  campaignId: string,
  sinceVersion: number,
  sceneId?: string,
): ActionLogList => {
  const rows = db
    .select()
    .from(actionLog)
    .where(and(
      eq(actionLog.campaignId, campaignId),
      gt(actionLog.stateVersion, sinceVersion),
      sceneId === undefined ? undefined : eq(actionLog.sceneId, sceneId),
    ))
    .orderBy(asc(actionLog.stateVersion), asc(actionLog.id))
    .limit(50)
    .all();
  return { items: rows.map(toActionLogEntry) };
};

export const findActionLogEntry = (db: DbExecutor, id: string): ActionLogEntry | null => {
  const row = db.select().from(actionLog).where(eq(actionLog.id, id)).get();
  return row === undefined ? null : toActionLogEntry(row);
};

/** Azioni applicate dalla selezionata in poi, dalla più recente alla più vecchia. */
export const listAppliedThrough = (
  db: DbExecutor,
  campaignId: string,
  sceneId: string,
  fromCreatedAt: string,
  fromId: string,
): ActionLogEntry[] => {
  const filters: (SQL | undefined)[] = [
    eq(actionLog.campaignId, campaignId),
    eq(actionLog.sceneId, sceneId),
    eq(actionLog.status, 'applied'),
    or(
      gt(actionLog.createdAt, fromCreatedAt),
      and(eq(actionLog.createdAt, fromCreatedAt), gte(actionLog.id, fromId)),
    ),
  ];
  return db.select().from(actionLog)
    .where(and(...filters))
    .orderBy(desc(actionLog.createdAt), desc(actionLog.id))
    .all()
    .map(toActionLogEntry);
};

export const listLastUndoneBatch = (db: DbExecutor, campaignId: string): ActionLogEntry[] => {
  const latest = db.select({ undoneAt: actionLog.undoneAt })
    .from(actionLog)
    .where(and(eq(actionLog.campaignId, campaignId), eq(actionLog.status, 'undone'), isNotNull(actionLog.undoneAt)))
    .orderBy(desc(actionLog.undoneAt))
    .limit(1)
    .get();
  if (latest?.undoneAt === null || latest?.undoneAt === undefined) {
    return [];
  }
  return db.select().from(actionLog)
    .where(and(
      eq(actionLog.campaignId, campaignId),
      eq(actionLog.status, 'undone'),
      eq(actionLog.undoneAt, latest.undoneAt),
    ))
    .orderBy(asc(actionLog.createdAt), asc(actionLog.id))
    .all()
    .map(toActionLogEntry);
};

export const markActionsUndone = (db: DbExecutor, ids: readonly string[], at: string): void => {
  if (ids.length === 0) {
    return;
  }
  db.update(actionLog)
    .set({ status: 'undone', undoneAt: at })
    .where(inArray(actionLog.id, [...ids]))
    .run();
};

export const markActionsApplied = (db: DbExecutor, ids: readonly string[]): void => {
  if (ids.length === 0) {
    return;
  }
  db.update(actionLog)
    .set({ status: 'applied', undoneAt: null })
    .where(inArray(actionLog.id, [...ids]))
    .run();
};

/** Le righe oltre le ultime 50 vengono eliminate, non solo nascoste (D46). */
export const pruneActionLog = (db: DbExecutor, campaignId: string): void => {
  const keep = db
    .select({ id: actionLog.id })
    .from(actionLog)
    .where(eq(actionLog.campaignId, campaignId))
    .orderBy(desc(actionLog.createdAt), desc(actionLog.id))
    .limit(50);
  db.delete(actionLog)
    .where(and(eq(actionLog.campaignId, campaignId), notInArray(actionLog.id, keep)))
    .run();
};
