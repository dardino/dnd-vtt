import { and, desc, eq, notInArray } from 'drizzle-orm';
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

export const findActionLogEntry = (db: DbExecutor, id: string): ActionLogEntry | null => {
  const row = db.select().from(actionLog).where(eq(actionLog.id, id)).get();
  return row === undefined ? null : toActionLogEntry(row);
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
