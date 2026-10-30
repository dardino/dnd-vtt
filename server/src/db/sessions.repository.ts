import type { Session } from '@dnd-vtt/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { sessions } from './schema.js';

const toSession = (row: typeof sessions.$inferSelect): Session => ({
  id: row.id,
  campaignId: row.campaignId,
  number: row.number,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  durationSeconds: row.durationSeconds,
  notes: row.notes,
});

export const listSessions = (db: DbExecutor, campaignId: string): Session[] =>
  db.select().from(sessions)
    .where(eq(sessions.campaignId, campaignId))
    .orderBy(desc(sessions.startedAt))
    .all()
    .map(toSession);

export const getActiveSession = (db: DbExecutor, campaignId: string): Session | null => {
  const row = db.select().from(sessions)
    .where(and(eq(sessions.campaignId, campaignId), isNull(sessions.endedAt)))
    .get();
  return row === undefined ? null : toSession(row);
};

export const insertSession = (db: DbExecutor, campaignId: string): Session => {
  const existing = listSessions(db, campaignId);
  const row = {
    id: uuidv7(),
    campaignId,
    number: (existing[0]?.number ?? 0) + 1,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
    notes: null,
  };
  db.insert(sessions).values(row).run();
  return toSession(row);
};

export const endSession = (db: DbExecutor, session: Session): Session => {
  const endedAt = new Date().toISOString();
  const durationSeconds = Math.max(0, Math.round(
    (Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000,
  ));
  db.update(sessions)
    .set({ endedAt, durationSeconds })
    .where(eq(sessions.id, session.id))
    .run();
  return { ...session, endedAt, durationSeconds };
};
