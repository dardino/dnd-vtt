import { and, desc, eq } from 'drizzle-orm';
import type { Map, MapDocument } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { toMap } from './mappers.js';
import { maps } from './schema.js';

export const listMaps = (db: DbExecutor, campaignId: string): Map[] =>
  db
    .select()
    .from(maps)
    .where(eq(maps.campaignId, campaignId))
    .orderBy(desc(maps.updatedAt), desc(maps.id))
    .all()
    .map(toMap);

export const getMap = (db: DbExecutor, id: string): Map | null => {
  const row = db.select().from(maps).where(eq(maps.id, id)).get();
  return row === undefined ? null : toMap(row);
};

export const insertMap = (
  db: DbExecutor,
  campaignId: string,
  document: MapDocument,
): Map => {
  const now = new Date().toISOString();
  const row = {
    id: uuidv7(),
    campaignId,
    name: document.name,
    imageAssetId: document.imageAssetId,
    widthPx: document.widthPx,
    heightPx: document.heightPx,
    document: JSON.stringify(document),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(maps).values(row).run();
  return toMap(row);
};

export const updateMapDocument = (
  db: DbExecutor,
  id: string,
  document: MapDocument,
  expectedVersion: number,
): Map | null => {
  const result = db
    .update(maps)
    .set({
      name: document.name,
      imageAssetId: document.imageAssetId,
      widthPx: document.widthPx,
      heightPx: document.heightPx,
      document: JSON.stringify(document),
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(maps.id, id), eq(maps.version, expectedVersion)))
    .run();
  if (result.changes === 0) {
    return null;
  }
  return getMap(db, id);
};

export const deleteMap = (db: DbExecutor, id: string): boolean =>
  db.delete(maps).where(eq(maps.id, id)).run().changes > 0;
