import { count, eq, inArray, sql } from 'drizzle-orm';
import { migrateMapDocument, type Asset, type MapDocument } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { toAsset } from './mappers.js';
import { actors, assets, maps, scenes } from './schema.js';

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

/** Asset lato server con il path dell'originale, non esposto dall'API. */
export interface StoredAsset extends Asset {
  originalPath: string;
}

export const findAssetByHash = (db: DbExecutor, hash: string): Asset | null => {
  const row = db.select().from(assets).where(eq(assets.hash, hash)).get();
  return row === undefined ? null : toAsset(row);
};

export const getAsset = (db: DbExecutor, id: string): Asset | null => {
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  return row === undefined ? null : toAsset(row);
};

export const getStoredAsset = (db: DbExecutor, id: string): StoredAsset | null => {
  const row = db.select().from(assets).where(eq(assets.id, id)).get();
  return row === undefined ? null : { ...toAsset(row), originalPath: row.originalPath };
};

/** Batch loader per proiezioni: una sola query per tutti gli asset richiesti. */
export const getAssetsByIds = (db: DbExecutor, ids: readonly string[]): Map<string, Asset> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = db.select().from(assets).where(inArray(assets.id, unique)).all();
  return new Map(rows.map((row) => [row.id, toAsset(row)]));
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

const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

const isJson1Unavailable = (error: unknown): boolean =>
  error instanceof Error && /no such (table|function): json_/i.test(error.message);

/**
 * Migra e legge il documento senza mai propagare errori: una riga corrotta non
 * deve impedire il conteggio delle altre mappe.
 */
const parseMapDocument = (raw: string): MapDocument | null => {
  try {
    return migrateMapDocument(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

/** Sfondo e grafiche sono gli unici layer del documento che puntano ad asset. */
const documentReferencesAsset = (raw: string, id: string): boolean => {
  const document = parseMapDocument(raw);
  if (document === null) {
    return false;
  }
  const [background, graphics] = document.layers;
  return background.imageAssetId === id
    || graphics.items.some((item) => item.kind === 'image' && item.assetId === id);
};

/**
 * Conta le mappe che puntano all'asset: colonne denormalizzate (sfondo, thumb,
 * composito) e riferimenti interni al documento, migrato in lettura per le
 * versioni legacy. Ogni mappa è contata al più una volta.
 */
const countMapReferences = (db: DbExecutor, id: string): number => {
  const rows = db
    .select({
      imageAssetId: maps.imageAssetId,
      thumbAssetId: maps.thumbAssetId,
      compositeAssetId: maps.compositeAssetId,
      document: maps.document,
    })
    .from(maps)
    .all();
  let total = 0;
  for (const row of rows) {
    if (
      row.imageAssetId === id
      || row.thumbAssetId === id
      || row.compositeAssetId === id
      || documentReferencesAsset(row.document, id)
    ) {
      total += 1;
    }
  }
  return total;
};

/**
 * Conta i layer immagine dei program che puntano all'asset. `json_tree` visita
 * base e overlay senza assumere la forma dello stato; il fallback `LIKE` è
 * conservativo (può contare qualche falso positivo, mai un falso negativo) e
 * serve solo alle build SQLite senza JSON1.
 */
const countProgramReferences = (db: DbExecutor, id: string): number => {
  try {
    const [row] = db.all<{ total: number }>(sql`
      SELECT count(*) AS total
      FROM programs,
           json_tree(
             CASE WHEN json_valid(programs.state) THEN programs.state ELSE '{}' END
           ) AS node
      WHERE node.type = 'object'
        AND json_extract(node.value, '$.assetId') = ${id}
    `);
    return row?.total ?? 0;
  } catch (error) {
    if (!isJson1Unavailable(error)) {
      throw error;
    }
    const [row] = db.all<{ total: number }>(sql`
      SELECT count(*) AS total
      FROM programs
      WHERE state LIKE ${`%${escapeLikePattern(id)}%`} ESCAPE '\\'
    `);
    return row?.total ?? 0;
  }
};

/** Quante mappe, scene, attori e layer immagine dei program puntano all'asset. */
export const countAssetReferences = (db: DbExecutor, id: string): number => {
  const references = [
    db.select({ total: count() }).from(scenes).where(eq(scenes.imageAssetId, id)).get(),
    db.select({ total: count() }).from(actors).where(eq(actors.imageAssetId, id)).get(),
  ];
  const tabular = references.reduce((total, row) => total + (row?.total ?? 0), 0);
  return tabular + countMapReferences(db, id) + countProgramReferences(db, id);
};
