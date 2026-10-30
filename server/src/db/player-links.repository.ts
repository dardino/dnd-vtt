import { createHash, randomBytes } from 'node:crypto';
import type { PlayerLink } from '@dnd-vtt/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { playerLinks } from './schema.js';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const toLink = (row: typeof playerLinks.$inferSelect): PlayerLink => ({
  id: row.id,
  campaignId: row.campaignId,
  actorId: row.actorId,
  label: row.label,
  editingEnabled: row.editingEnabled,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  revokedAt: row.revokedAt,
});

export interface InsertLinkInput {
  campaignId: string;
  actorId: string;
  token: string;
  editable: string[];
  label?: string;
}

export const insertPlayerLink = (db: DbExecutor, input: InsertLinkInput): PlayerLink => {
  const row = {
    id: uuidv7(),
    campaignId: input.campaignId,
    actorId: input.actorId,
    tokenHash: hashToken(input.token),
    editable: JSON.stringify(input.editable),
    editingEnabled: true,
    label: input.label ?? null,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revokedAt: null,
  };
  db.insert(playerLinks).values(row).run();
  return toLink(row);
};

export const getLinkByToken = (db: DbExecutor, token: string): PlayerLink | null => {
  const row = db.select().from(playerLinks)
    .where(and(eq(playerLinks.tokenHash, hashToken(token)), isNull(playerLinks.revokedAt)))
    .get();
  return row === undefined ? null : toLink(row);
};

export const getActiveLinkForActor = (db: DbExecutor, actorId: string): PlayerLink | null => {
  const row = db.select().from(playerLinks)
    .where(and(eq(playerLinks.actorId, actorId), isNull(playerLinks.revokedAt)))
    .orderBy(playerLinks.createdAt)
    .get();
  return row === undefined ? null : toLink(row);
};

export const getEditableFields = (db: DbExecutor, linkId: string): string[] => {
  const row = db.select({ editable: playerLinks.editable })
    .from(playerLinks)
    .where(eq(playerLinks.id, linkId))
    .get();
  return row === undefined ? [] : JSON.parse(row.editable) as string[];
};

export const touchPlayerLink = (db: DbExecutor, id: string): void => {
  db.update(playerLinks)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(playerLinks.id, id))
    .run();
};

export const setLinkEditing = (
  db: DbExecutor,
  actorId: string,
  enabled: boolean,
): PlayerLink | null => {
  db.update(playerLinks)
    .set({ editingEnabled: enabled })
    .where(and(eq(playerLinks.actorId, actorId), isNull(playerLinks.revokedAt)))
    .run();
  return getActiveLinkForActor(db, actorId);
};

export const revokeLinksForActor = (db: DbExecutor, actorId: string): void => {
  db.update(playerLinks)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(playerLinks.actorId, actorId), isNull(playerLinks.revokedAt)))
    .run();
};

export const newPlayerToken = (): string => randomBytes(24).toString('base64url');
