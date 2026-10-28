import { eq } from 'drizzle-orm';
import type { Asset } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { toAsset } from './mappers.js';
import { assets } from './schema.js';

export interface AssetInsert {
  hash: string;
  mime: Asset['mime'];
  bytes: number;
  width: number;
  height: number;
  originalPath: string;
  webpPath: string;
  thumbPath: string;
}

export const findAssetByHash = (db: DbExecutor, hash: string): Asset | null => {
  const row = db.select().from(assets).where(eq(assets.hash, hash)).get();
  return row === undefined ? null : toAsset(row);
};

export const getAsset = (db: DbExecutor, id: string): Asset | null => {
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  return row === undefined ? null : toAsset(row);
};

export const insertAsset = (db: DbExecutor, input: AssetInsert): Asset => {
  const row = {
    id: uuidv7(),
    ...input,
    createdAt: new Date().toISOString(),
  };
  db.insert(assets).values(row).run();
  return toAsset(row);
};

export const deleteAsset = (db: DbExecutor, id: string): boolean =>
  db.delete(assets).where(eq(assets.id, id)).run().changes > 0;
