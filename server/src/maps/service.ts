import {
  createDefaultSceneState,
  emptyMapDocument,
  srdMonsterToStatblock,
  type Actor,
  type CreateMap,
  type CreateSceneFromMap,
  type CreateSceneFromMapResult,
  type Map,
  type MapDocument,
  type MapSummary,
  type PlayerAssignment,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getActor, insertActor } from '../db/actors.repository.js';
import { getAsset } from '../db/assets.repository.js';
import { getCampaign, updateCampaign } from '../db/campaigns.repository.js';
import { deleteMap, getMap, insertMap, listMaps, updateMapDocument } from '../db/maps.repository.js';
import { insertScene } from '../db/scenes.repository.js';
import { AppError, notFound } from '../errors.js';
import { currentSrdVersion, loadSrdCatalog } from '../srd/load.js';

const requireCampaign = (db: AppDatabase, campaignId: string): void => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
};

const requireMap = (db: AppDatabase, id: string): Map => {
  const map = getMap(db, id);
  if (map === null) {
    throw notFound('Mappa non trovata');
  }
  return map;
};

const mapSummary = (db: AppDatabase, map: Map): MapSummary => {
  const asset = map.imageAssetId === null ? null : getAsset(db, map.imageAssetId);
  return {
    id: map.id,
    campaignId: map.campaignId,
    name: map.name,
    imageAssetId: map.imageAssetId,
    imageUrl: asset?.url ?? null,
    thumbUrl: asset?.thumbUrl ?? null,
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    grid: map.grid,
    fogBase: map.fogBase,
    version: map.version,
    walls: map.terrain.walls.length,
    lights: map.terrain.lights.length,
    spawns: map.spawns.length,
    playerStarts: map.playerStarts.length,
    updatedAt: map.updatedAt,
  };
};

export const listCampaignMaps = (db: AppDatabase, campaignId: string): MapSummary[] => {
  requireCampaign(db, campaignId);
  return listMaps(db, campaignId).map((map) => mapSummary(db, map));
};

export const createMap = (db: AppDatabase, campaignId: string, input: CreateMap): Map => {
  requireCampaign(db, campaignId);
  const asset = getAsset(db, input.imageAssetId);
  if (asset === null) {
    throw notFound('Immagine non trovata');
  }
  return insertMap(db, campaignId, emptyMapDocument(input.name, asset.id, asset.width, asset.height));
};

export const requireMapFull = (db: AppDatabase, id: string): Map => requireMap(db, id);

export const putMap = (
  db: AppDatabase,
  id: string,
  version: number,
  document: MapDocument,
): Map => {
  const current = requireMap(db, id);
  if (current.version !== version) {
    throw new AppError('state_conflict', 409, 'La mappa è stata modificata altrove', {
      currentVersion: current.version,
    });
  }
  if (document.imageAssetId !== null && getAsset(db, document.imageAssetId) === null) {
    throw notFound('Immagine non trovata');
  }
  const updated = updateMapDocument(db, id, document, version);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'La mappa è stata modificata altrove');
  }
  return updated;
};

export const removeMap = (db: AppDatabase, id: string): void => {
  requireMap(db, id);
  deleteMap(db, id);
};

export const duplicateMap = (db: AppDatabase, id: string): Map => {
  const source = requireMap(db, id);
  const document: MapDocument = {
    name: `${source.name} (copia)`,
    imageAssetId: source.imageAssetId,
    widthPx: source.widthPx,
    heightPx: source.heightPx,
    grid: source.grid,
    terrain: {
      ...source.terrain,
      walls: source.terrain.walls.map((wall) => ({ ...wall })),
      lights: source.terrain.lights.map((light) => ({ ...light })),
    },
    spawns: source.spawns.map((spawn) => ({ ...spawn, id: crypto.randomUUID() })),
    playerStarts: source.playerStarts.map((start) => ({ ...start, id: crypto.randomUUID() })),
    ...(source.startView === undefined ? {} : { startView: source.startView }),
    fogBase: source.fogBase,
    showDoorIcons: source.showDoorIcons,
    notes: source.notes,
  };
  return insertMap(db, source.campaignId, document);
};

const srdMonster = (monsterId: string) => {
  const catalog = loadSrdCatalog(currentSrdVersion());
  return catalog.monsters.find((monster) => monster.id === monsterId);
};

const createTokens = (
  db: AppDatabase,
  map: Map,
  assignments: PlayerAssignment[],
): TokenState[] => {
  const tokens: TokenState[] = [];
  for (const spawn of map.spawns) {
    const count = Math.max(1, spawn.quantity);
    for (let index = 0; index < count; index += 1) {
      let actor: Actor;
      if (spawn.source.type === 'srd') {
        const monster = srdMonster(spawn.source.monsterId);
        if (monster === undefined) {
          continue;
        }
        actor = insertActor(db, {
          campaignId: map.campaignId,
          kind: spawn.kind,
          name: spawn.label ?? monster.name,
          statblock: srdMonsterToStatblock(monster),
          xp: 0,
        });
      } else {
        const candidate = getActor(db, spawn.source.actorId);
        if (candidate === null || candidate.campaignId !== map.campaignId) {
          continue;
        }
        actor = candidate;
      }
      const offset = index % 3;
      const row = Math.floor(index / 3);
      tokens.push({
        id: crypto.randomUUID(),
        actorId: actor.id,
        label: spawn.label ?? actor.name,
        x: spawn.x + offset,
        y: spawn.y + row,
        size: spawn.size,
        rotation: 0,
        elevation: 0,
        hp: { ...actor.statblock.hp },
        conditions: [],
        visible: !spawn.hidden,
        ...(spawn.light === undefined ? {} : { light: spawn.light }),
      });
    }
  }
  const assignedStarts = new Set<string>();
  for (const assignment of assignments) {
    const start = map.playerStarts.find((entry) => entry.id === assignment.startId);
    if (start === undefined || assignedStarts.has(start.id)) {
      continue;
    }
    const actor = getActor(db, assignment.actorId);
    if (actor === null || actor.campaignId !== map.campaignId || actor.kind !== 'pc') {
      continue;
    }
    assignedStarts.add(start.id);
    tokens.push({
      id: crypto.randomUUID(),
      actorId: actor.id,
      label: actor.name,
      x: start.x,
      y: start.y,
      size: 1,
      rotation: 0,
      elevation: 0,
      hp: { ...actor.statblock.hp },
      conditions: [],
      visible: true,
      owner: 'players',
    });
  }
  return tokens;
};

export const createSceneFromMap = (
  db: AppDatabase,
  campaignId: string,
  input: CreateSceneFromMap,
): CreateSceneFromMapResult => db.transaction((tx) => {
  const campaign = getCampaign(tx, campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const map = requireMap(tx, input.mapId);
  if (map.campaignId !== campaignId) {
    throw notFound('Mappa non trovata');
  }
  const fogBase = input.fogBase ?? map.fogBase;
  const state: SceneState = {
    ...createDefaultSceneState(fogBase, map.terrain),
    grid: map.grid,
    fog: { base: fogBase, ops: [], override: 'none' },
    terrain: {
      ...map.terrain,
      walls: map.terrain.walls.map((wall) => ({ ...wall })),
      lights: map.terrain.lights.map((light) => ({ ...light })),
    },
    showDoorIcons: map.showDoorIcons,
    ...(map.startView === undefined ? {} : { startView: map.startView }),
  };
  state.tokens = createTokens(tx, map, input.playerAssignments);
  const scene = insertScene(tx, campaignId, {
    name: input.name ?? map.name,
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    ...(map.imageAssetId === null ? {} : { imageAssetId: map.imageAssetId }),
    mapId: map.id,
  }, state);
  updateCampaign(tx, campaignId, { activeSceneId: scene.id });
  return { sceneId: scene.id, mapId: map.id, fogBase };
});
