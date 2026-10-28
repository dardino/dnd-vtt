import { and, desc, eq, like, lt, or } from 'drizzle-orm';
import type { Actor, ActorKind, CreateActor, PcStatblock, UpdateActor } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { encodeCursor } from './cursor.js';
import { toActor } from './mappers.js';
import { mergeDefined } from './merge.js';
import { actors } from './schema.js';
import type { Page, PageQuery } from './campaigns.repository.js';

export interface ActorFilters {
  kind?: ActorKind;
  campaignId?: string;
  query?: string;
}

export const listActors = (
  db: DbExecutor,
  filters: ActorFilters,
  page: PageQuery,
): Page<Actor> => {
  const conditions = [
    filters.kind === undefined ? undefined : eq(actors.kind, filters.kind),
    filters.campaignId === undefined ? undefined : eq(actors.campaignId, filters.campaignId),
    filters.query === undefined ? undefined : like(actors.name, `%${filters.query}%`),
    page.cursor === null
      ? undefined
      : or(
        lt(actors.createdAt, page.cursor.createdAt),
        and(eq(actors.createdAt, page.cursor.createdAt), lt(actors.id, page.cursor.id)),
      ),
  ];
  const rows = db
    .select()
    .from(actors)
    .where(and(...conditions))
    .orderBy(desc(actors.createdAt), desc(actors.id))
    .limit(page.limit + 1)
    .all();
  const items = rows.slice(0, page.limit).map(toActor);
  const last = rows[page.limit - 1];
  return {
    items,
    nextCursor: last === undefined ? null : encodeCursor({ createdAt: last.createdAt, id: last.id }),
  };
};

export const getActor = (db: DbExecutor, id: string): Actor | null => {
  const row = db.select().from(actors).where(eq(actors.id, id)).get();
  return row === undefined ? null : toActor(row);
};

export const insertActor = (db: DbExecutor, input: CreateActor): Actor => {
  const now = new Date().toISOString();
  const row = {
    id: uuidv7(),
    campaignId: input.campaignId ?? null,
    kind: input.kind,
    name: input.name,
    statblock: JSON.stringify(input.statblock),
    rulesVersion: input.rulesVersion ?? null,
    xp: input.xp,
    sheetVersion: 1,
    playerNotes: null,
    dmNotes: input.dmNotes ?? null,
    imageAssetId: input.imageAssetId ?? null,
    hpCurrent: null,
    hpMax: null,
    hpTemp: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(actors).values(row).run();
  return toActor(row);
};

export interface PcActorInsert {
  name: string;
  campaignId: string;
  statblock: PcStatblock;
  playerNotes: string | null;
  dmNotes: string | null;
}

export const insertPcActor = (db: DbExecutor, input: PcActorInsert): Actor => {
  const now = new Date().toISOString();
  const row = {
    id: uuidv7(),
    campaignId: input.campaignId,
    kind: 'pc' as const,
    name: input.name,
    statblock: JSON.stringify(input.statblock),
    rulesVersion: input.statblock.rulesVersion,
    xp: 0,
    sheetVersion: 1,
    playerNotes: input.playerNotes,
    dmNotes: input.dmNotes,
    imageAssetId: null,
    hpCurrent: input.statblock.hp.current,
    hpMax: input.statblock.hp.max,
    hpTemp: input.statblock.hp.temp,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(actors).values(row).run();
  return toActor(row);
};

export const updateActorSheet = (
  db: DbExecutor,
  id: string,
  expectedVersion: number,
  statblock: PcStatblock,
  dmNotes: string | null,
): boolean => db.update(actors)
  .set({
    statblock: JSON.stringify(statblock),
    hpCurrent: statblock.hp.current,
    hpMax: statblock.hp.max,
    hpTemp: statblock.hp.temp,
    dmNotes,
    sheetVersion: expectedVersion + 1,
    updatedAt: new Date().toISOString(),
  })
  .where(and(eq(actors.id, id), eq(actors.sheetVersion, expectedVersion)))
  .run().changes > 0;

export const updateActor = (
  db: DbExecutor,
  id: string,
  patch: UpdateActor,
): Actor | null => {
  const current = db.select().from(actors).where(eq(actors.id, id)).get();
  if (current === undefined) {
    return null;
  }
  const updated = { ...patch, updatedAt: new Date().toISOString() };
  db.update(actors).set(updated).where(eq(actors.id, id)).run();
  return toActor(mergeDefined(current, updated));
};

export const deleteActor = (db: DbExecutor, id: string): boolean =>
  db.delete(actors).where(eq(actors.id, id)).run().changes > 0;
