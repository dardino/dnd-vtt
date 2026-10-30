import type { Display } from '@dnd-vtt/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { displays } from './schema.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const makeCode = (): string =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? 'A').join('');

const toDisplay = (row: typeof displays.$inferSelect): Display => ({
  id: row.id,
  campaignId: row.campaignId,
  code: row.code,
  label: row.label,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  revokedAt: row.revokedAt,
});

export const insertDisplay = (db: DbExecutor, campaignId: string, label: string): Display => {
  let code = makeCode();
  while (db.select({ id: displays.id }).from(displays).where(eq(displays.code, code)).get() !== undefined) {
    code = makeCode();
  }
  const row = {
    id: uuidv7(),
    campaignId,
    code,
    label,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revokedAt: null,
  };
  db.insert(displays).values(row).run();
  return toDisplay(row);
};

export const getDisplay = (db: DbExecutor, id: string): Display | null => {
  const row = db.select().from(displays).where(eq(displays.id, id)).get();
  return row === undefined ? null : toDisplay(row);
};

export const getDisplayByCode = (db: DbExecutor, code: string): Display | null => {
  const row = db.select().from(displays)
    .where(and(eq(displays.code, code), isNull(displays.revokedAt)))
    .get();
  return row === undefined ? null : toDisplay(row);
};

export const listDisplays = (db: DbExecutor, campaignId: string): Display[] =>
  db.select().from(displays).where(eq(displays.campaignId, campaignId)).all().map(toDisplay);

export const touchDisplay = (db: DbExecutor, id: string): void => {
  db.update(displays)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(displays.id, id))
    .run();
};

export const revokeDisplay = (db: DbExecutor, id: string): boolean =>
  db.update(displays)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(displays.id, id))
    .run().changes > 0;
