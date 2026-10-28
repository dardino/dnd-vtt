import type { Campaign, CreateCampaign, UpdateCampaign } from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import type { Cursor } from '../db/cursor.js';
import {
  deleteCampaign,
  getCampaign,
  insertCampaign,
  listCampaigns,
  updateCampaign,
} from '../db/campaigns.repository.js';
import { getScene } from '../db/scenes.repository.js';
import { AppError, notFound } from '../errors.js';
export interface PageParams {
  limit: number;
  cursor: Cursor | null;
}

export const listCampaignPage = (
  db: AppDatabase,
  page: PageParams,
): { items: Campaign[]; nextCursor: string | null } =>
  listCampaigns(db, page);

export const requireCampaign = (db: AppDatabase, id: string): Campaign => {
  const campaign = getCampaign(db, id);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  return campaign;
};

export const createCampaign = (db: AppDatabase, input: CreateCampaign): Campaign =>
  insertCampaign(db, input);

export const patchCampaign = (
  db: AppDatabase,
  id: string,
  patch: UpdateCampaign,
): Campaign => {
  requireCampaign(db, id);
  if (patch.activeSceneId !== undefined && patch.activeSceneId !== null) {
    const scene = getScene(db, patch.activeSceneId);
    if (scene === null || scene.campaignId !== id) {
      throw new AppError('validation_error', 400, 'La scena attiva non appartiene alla campagna');
    }
  }
  const updated = updateCampaign(db, id, patch);
  if (updated === null) {
    throw notFound('Campagna non trovata');
  }
  return updated;
};

export const removeCampaign = (db: AppDatabase, id: string): void => {
  if (!deleteCampaign(db, id)) {
    throw notFound('Campagna non trovata');
  }
};
