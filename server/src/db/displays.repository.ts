import { randomInt } from 'node:crypto';
import type { Display, ProgramComposition } from '@dnd-vtt/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { displays } from './schema.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 8 caratteri (32^8 combinazioni) invece di 6: il codice è provabile via WebSocket
 * `/ws?role=display&code=…`, dove il rate limit per IP non basta contro reti distribuite.
 * I codici già emessi a 6 caratteri restano validi (lookup invariato).
 */
const makeCode = (): string =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(0, ALPHABET.length)] ?? 'A').join('');

const toDisplay = (row: typeof displays.$inferSelect): Display => ({
  id: row.id,
  campaignId: row.campaignId,
  code: row.code,
  label: row.label,
  compositionVersion: row.compositionVersion,
  viewportWidth: row.viewportWidth,
  viewportHeight: row.viewportHeight,
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
    composition: null,
    compositionVersion: 1,
    viewportWidth: null,
    viewportHeight: null,
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

export const updateDisplayViewportSize = (
  db: DbExecutor,
  id: string,
  width: number,
  height: number,
): void => {
  db.update(displays)
    .set({ viewportWidth: width, viewportHeight: height })
    .where(eq(displays.id, id))
    .run();
};

export const revokeDisplay = (db: DbExecutor, id: string): boolean =>
  db.update(displays)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(displays.id, id))
    .run().changes > 0;

export interface DisplayCompositionRow {
  composition: ProgramComposition;
  version: number;
}

export const getDisplayComposition = (
  db: DbExecutor,
  id: string,
): DisplayCompositionRow | null => {
  const row = db
    .select({ composition: displays.composition, version: displays.compositionVersion })
    .from(displays)
    .where(eq(displays.id, id))
    .get();
  if (row === undefined || row.composition === null) {
    return null;
  }
  return { composition: JSON.parse(row.composition) as ProgramComposition, version: row.version };
};

export const updateDisplayComposition = (
  db: DbExecutor,
  id: string,
  composition: ProgramComposition,
  expectedVersion: number,
): number | null => {
  const result = db.update(displays)
    .set({ composition: JSON.stringify(composition), compositionVersion: expectedVersion + 1 })
    .where(and(eq(displays.id, id), eq(displays.compositionVersion, expectedVersion)))
    .run();
  return result.changes === 0 ? null : expectedVersion + 1;
};
