import {
  actorStatblockSchema,
  type ActionLogEntry,
  type Actor,
  type Asset,
  type Campaign,
  type GameAction,
  type Scene,
} from '@dnd-vtt/shared';
import type { actionLog, actors, assets, campaigns, scenes } from './schema.js';

export const toCampaign = (row: typeof campaigns.$inferSelect): Campaign => ({
  id: row.id,
  name: row.name,
  description: row.description,
  activeSceneId: row.activeSceneId,
  fogDefault: row.fogDefault,
  autoApprove: row.autoApprove,
  advancementMode: row.advancementMode,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toScene = (row: typeof scenes.$inferSelect): Scene => ({
  id: row.id,
  campaignId: row.campaignId,
  name: row.name,
  imageAssetId: row.imageAssetId,
  widthPx: row.widthPx,
  heightPx: row.heightPx,
  stateVersion: row.stateVersion,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * `playerNotes` non compare mai nel DTO della console DM (D26): resta nel
 * database e sarà esposto solo al link giocatore.
 */
export const toActor = (row: typeof actors.$inferSelect): Actor => {
  const hp = row.hpCurrent !== null && row.hpMax !== null
    ? { current: row.hpCurrent, max: row.hpMax, temp: row.hpTemp ?? 0 }
    : null;
  return {
    id: row.id,
    campaignId: row.campaignId,
    kind: row.kind,
    name: row.name,
    statblock: actorStatblockSchema.parse(JSON.parse(row.statblock) as unknown),
    rulesVersion: row.rulesVersion,
    xp: row.xp,
    sheetVersion: row.sheetVersion,
    dmNotes: row.dmNotes,
    imageAssetId: row.imageAssetId,
    hp,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const uploadUrl = (relativePath: string): string =>
  `/uploads/${relativePath.split('\\').join('/')}`;

export const toAsset = (row: typeof assets.$inferSelect): Asset => ({
  id: row.id,
  hash: row.hash,
  mime: row.mime as Asset['mime'],
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  url: uploadUrl(row.webpPath),
  thumbUrl: uploadUrl(row.thumbPath),
  createdAt: row.createdAt,
});

export const toActionLogEntry = (row: typeof actionLog.$inferSelect): ActionLogEntry => ({
  id: row.id,
  sceneId: row.sceneId,
  actorId: row.actorId,
  clientId: row.clientId,
  origin: row.origin,
  type: row.type,
  label: row.label,
  payload: JSON.parse(row.payload) as GameAction,
  inverse: JSON.parse(row.inverse) as GameAction,
  status: row.status,
  stateVersion: row.stateVersion,
  createdAt: row.createdAt,
  undoneAt: row.undoneAt,
});
