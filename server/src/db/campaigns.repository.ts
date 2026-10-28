import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Campaign, CreateCampaign, UpdateCampaign } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { encodeCursor, type Cursor } from './cursor.js';
import { toCampaign } from './mappers.js';
import { mergeDefined } from './merge.js';
import { campaigns } from './schema.js';

export interface PageQuery {
  limit: number;
  cursor: Cursor | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const listCampaigns = (db: DbExecutor, query: PageQuery): Page<Campaign> => {
  const where = query.cursor === null
    ? undefined
    : or(
      lt(campaigns.createdAt, query.cursor.createdAt),
      and(eq(campaigns.createdAt, query.cursor.createdAt), lt(campaigns.id, query.cursor.id)),
    );
  const rows = db
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
    .limit(query.limit + 1)
    .all();
  const page = rows.slice(0, query.limit).map(toCampaign);
  const last = rows[query.limit - 1];
  return {
    items: page,
    nextCursor: last === undefined ? null : encodeCursor({ createdAt: last.createdAt, id: last.id }),
  };
};

export const getCampaign = (db: DbExecutor, id: string): Campaign | null => {
  const row = db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  return row === undefined ? null : toCampaign(row);
};

export const insertCampaign = (db: DbExecutor, input: CreateCampaign): Campaign => {
  const now = new Date().toISOString();
  const row = {
    id: uuidv7(),
    name: input.name,
    description: input.description,
    activeSceneId: null,
    fogDefault: input.fogDefault,
    autoApprove: true,
    advancementMode: input.advancementMode,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(campaigns).values(row).run();
  return toCampaign(row);
};

export const updateCampaign = (
  db: DbExecutor,
  id: string,
  patch: UpdateCampaign,
): Campaign | null => {
  const current = db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (current === undefined) {
    return null;
  }
  const updated = {
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.update(campaigns).set(updated).where(eq(campaigns.id, id)).run();
  return toCampaign(mergeDefined(current, updated));
};

export const deleteCampaign = (db: DbExecutor, id: string): boolean =>
  db.delete(campaigns).where(eq(campaigns.id, id)).run().changes > 0;
