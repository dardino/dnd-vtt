import type { CreateScene, Scene, SceneSnapshot, UpdateScene } from '@dnd-vtt/shared';
import { createDefaultSceneState, sceneStateSchema } from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import type { Cursor } from '../db/cursor.js';
import { getCampaign, updateCampaign } from '../db/campaigns.repository.js';
import {
  deleteScene,
  getScene,
  getSceneState,
  insertScene,
  listScenes,
  updateScene,
} from '../db/scenes.repository.js';
import { notFound } from '../errors.js';

export interface ScenePageParams {
  limit: number;
  cursor: Cursor | null;
}

export const listCampaignScenes = (
  db: AppDatabase,
  campaignId: string,
  page: ScenePageParams,
): { items: Scene[]; nextCursor: string | null } => listScenes(db, campaignId, page);

export const createScene = (db: AppDatabase, campaignId: string, input: CreateScene): Scene =>
  db.transaction((tx) => {
    const campaign = getCampaign(tx, campaignId);
    if (campaign === null) {
      throw notFound('Campagna non trovata');
    }
    const fogBase = input.fogBase ?? campaign.fogDefault;
    const created = insertScene(tx, campaignId, input, createDefaultSceneState(fogBase));
    if (campaign.activeSceneId === null) {
      updateCampaign(tx, campaignId, { activeSceneId: created.id });
    }
    return created;
  });

export const requireScene = (db: AppDatabase, id: string): Scene => {
  const scene = getScene(db, id);
  if (scene === null) {
    throw notFound('Scena non trovata');
  }
  return scene;
};

export const snapshotScene = (db: AppDatabase, id: string): SceneSnapshot => {
  const scene = requireScene(db, id);
  const stored = getSceneState(db, id);
  if (stored === null) {
    throw notFound('Scena non trovata');
  }
  return {
    scene,
    state: sceneStateSchema.parse(stored.state),
    stateVersion: stored.stateVersion,
  };
};

export const patchScene = (db: AppDatabase, id: string, patch: UpdateScene): Scene => {
  requireScene(db, id);
  const updated = updateScene(db, id, patch);
  if (updated === null) {
    throw notFound('Scena non trovata');
  }
  return updated;
};

export const removeScene = (db: AppDatabase, id: string): void => {
  const scene = requireScene(db, id);
  db.transaction((tx) => {
    if (!deleteScene(tx, id)) {
      throw notFound('Scena non trovata');
    }
    const campaign = getCampaign(tx, scene.campaignId);
    if (campaign !== null && campaign.activeSceneId === id) {
      updateCampaign(tx, campaign.id, { activeSceneId: null });
    }
  });
};
