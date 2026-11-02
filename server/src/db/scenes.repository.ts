import { and, desc, eq, lt, or } from 'drizzle-orm';
import {
  createDefaultSceneState,
  defaultBackgroundTransform,
  sceneDimensions,
  type CreateScene,
  type Scene,
  type SceneState,
  type UpdateScene,
} from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DbExecutor } from './client.js';
import { encodeCursor } from './cursor.js';
import { toScene } from './mappers.js';
import { mergeDefined } from './merge.js';
import { scenes } from './schema.js';
import type { Page, PageQuery } from './campaigns.repository.js';

export const listScenes = (
  db: DbExecutor,
  campaignId: string,
  query: PageQuery,
): Page<Scene> => {
  const cursorFilter = query.cursor === null
    ? undefined
    : or(
      lt(scenes.createdAt, query.cursor.createdAt),
      and(eq(scenes.createdAt, query.cursor.createdAt), lt(scenes.id, query.cursor.id)),
    );
  const rows = db
    .select()
    .from(scenes)
    .where(and(eq(scenes.campaignId, campaignId), cursorFilter))
    .orderBy(desc(scenes.createdAt), desc(scenes.id))
    .limit(query.limit + 1)
    .all();
  const items = rows.slice(0, query.limit).map(toScene);
  const last = rows[query.limit - 1];
  return {
    items,
    nextCursor: last === undefined ? null : encodeCursor({ createdAt: last.createdAt, id: last.id }),
  };
};

export const getScene = (db: DbExecutor, id: string): Scene | null => {
  const row = db.select().from(scenes).where(eq(scenes.id, id)).get();
  return row === undefined ? null : toScene(row);
};

export const getSceneState = (
  db: DbExecutor,
  id: string,
): { state: SceneState; stateVersion: number } | null => {
  const row = db.select().from(scenes).where(eq(scenes.id, id)).get();
  if (row === undefined) {
    return null;
  }
  return {
    state: JSON.parse(row.state) as SceneState,
    stateVersion: row.stateVersion,
  };
};

export const insertScene = (
  db: DbExecutor,
  campaignId: string,
  input: CreateScene,
  state: SceneState = createDefaultSceneState(),
): Scene => {
  const now = new Date().toISOString();
  const presetDimensions = sceneDimensions(
    input.preset ?? '1080p',
    input.orientation ?? 'landscape',
  );
  const row = {
    id: uuidv7(),
    campaignId,
    mapId: input.mapId ?? null,
    name: input.name,
    imageAssetId: input.imageAssetId ?? null,
    backgroundTransform: JSON.stringify(input.backgroundTransform ?? defaultBackgroundTransform),
    widthPx: input.widthPx ?? presetDimensions.widthPx,
    heightPx: input.heightPx ?? presetDimensions.heightPx,
    state: JSON.stringify(state),
    stateVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(scenes).values(row).run();
  return toScene(row);
};

export const updateScene = (
  db: DbExecutor,
  id: string,
  patch: UpdateScene,
): Scene | null => {
  const current = db.select().from(scenes).where(eq(scenes.id, id)).get();
  if (current === undefined) {
    return null;
  }
  const { name, imageAssetId, backgroundTransform } = patch;
  const updated = {
    ...(name === undefined ? {} : { name }),
    ...(imageAssetId === undefined ? {} : { imageAssetId }),
    ...(backgroundTransform === undefined
      ? {}
      : { backgroundTransform: JSON.stringify(backgroundTransform) }),
    updatedAt: new Date().toISOString(),
  };
  db.update(scenes).set(updated).where(eq(scenes.id, id)).run();
  return toScene(mergeDefined(current, updated));
};

export const deleteScene = (db: DbExecutor, id: string): boolean =>
  db.delete(scenes).where(eq(scenes.id, id)).run().changes > 0;
