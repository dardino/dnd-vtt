import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  backgroundLayer,
  createDefaultSceneState,
  emptyMapDocumentV2,
  lightsOf,
  lootOf,
  newId,
  sceneDimensions,
  spawnsOf,
  srdMonsterToStatblock,
  startsOf,
  wallsOf,
  withBackgroundLayer,
  type Actor,
  type Asset,
  type BackgroundTransform,
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
import { storeAsset } from '../assets/service.js';
import type { AppEnv } from '../config/env.js';
import { getActor, insertActor } from '../db/actors.repository.js';
import { getAsset, getStoredAsset } from '../db/assets.repository.js';
import { getCampaign, updateCampaign } from '../db/campaigns.repository.js';
import { requireCampaign } from '../campaigns/service.js';
import { removeUnreferencedAsset } from './derived-assets.js';
import {
  deleteMap,
  getMap,
  insertMap,
  listMaps,
  updateMapDocument,
  type MapDerivedAssets,
} from '../db/maps.repository.js';
import { insertScene } from '../db/scenes.repository.js';
import { AppError, notFound } from '../errors.js';
import { currentSrdVersion, loadSrdCatalog } from '../srd/load.js';

const requireMap = (db: AppDatabase, id: string): Map => {
  const map = getMap(db, id);
  if (map === null) {
    throw notFound('Mappa non trovata');
  }
  return map;
};

const mapSummary = (db: AppDatabase, map: Map): MapSummary => {
  const imageAssetId = backgroundLayer(map).imageAssetId;
  const asset = imageAssetId === null ? null : getAsset(db, imageAssetId);
  const thumbAsset = map.thumbAssetId === null ? null : getAsset(db, map.thumbAssetId);
  return {
    id: map.id,
    campaignId: map.campaignId,
    name: map.name,
    imageAssetId,
    imageUrl: asset?.url ?? null,
    // La thumb persistita vince su quella dello sfondo; se l'asset è stato
    // rimosso si ripiega sullo sfondo senza esporre URL rotti.
    thumbUrl: thumbAsset?.thumbUrl ?? asset?.thumbUrl ?? null,
    backgroundColor: map.backgroundColor,
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    grid: map.grid,
    fogBase: map.fogBase,
    version: map.version,
    walls: wallsOf(map).length,
    lights: lightsOf(map).length,
    spawns: spawnsOf(map).length,
    playerStarts: startsOf(map).length,
    updatedAt: map.updatedAt,
  };
};

export const listCampaignMaps = (db: AppDatabase, campaignId: string): MapSummary[] => {
  requireCampaign(db, campaignId);
  return listMaps(db, campaignId).map((map) => mapSummary(db, map));
};

export const createMap = (db: AppDatabase, campaignId: string, input: CreateMap): Map => {
  requireCampaign(db, campaignId);
  const asset = input.imageAssetId === undefined || input.imageAssetId === null
    ? null
    : getAsset(db, input.imageAssetId);
  if (asset === null && input.imageAssetId !== undefined && input.imageAssetId !== null) {
    throw notFound('Immagine non trovata');
  }
  const presetDimensions = sceneDimensions(
    input.preset ?? '1080p',
    input.orientation ?? 'landscape',
  );
  return insertMap(db, campaignId, emptyMapDocumentV2(
    input.name,
    asset?.id ?? null,
    input.widthPx ?? presetDimensions.widthPx,
    input.heightPx ?? presetDimensions.heightPx,
  ));
};

export const requireMapFull = (db: AppDatabase, id: string): Map => requireMap(db, id);

/**
 * Riduce lo sfondo alla dimensione effettivamente renderizzata, preservando la
 * resa: il nuovo asset viene salvato come derivato e la scala viene ricalcolata.
 * L'asset originale non viene mai sovrascritto in questo passo: se dopo
 * l'aggiornamento non resta referenziato, `putMap` lo raccoglie insieme ai file.
 */
const downscaleBackground = async (
  env: AppEnv,
  db: AppDatabase,
  document: MapDocument,
  asset: Asset,
): Promise<MapDocument> => {
  const transform = backgroundLayer(document).imageTransform;
  const scale = transform.scale;
  const factor = Math.min(
    1,
    document.widthPx / asset.width,
    document.heightPx / asset.height,
  );
  if (factor >= 1) {
    return document;
  }
  const width = Math.max(1, Math.round(asset.width * factor));
  const height = Math.max(1, Math.round(asset.height * factor));
  if (width === asset.width && height === asset.height) {
    return document;
  }
  const source = await readFile(join(env.uploadDir, 'webp', `${asset.hash}.webp`));
  const resized = await sharp(source, { limitInputPixels: 100_000_000, failOn: 'error' })
    .resize({ width, height, fit: 'fill' })
    .webp({ quality: 82 })
    .toBuffer();
  const derived = await storeAsset(env, db, resized);
  return withBackgroundLayer(document, derived.id, {
    ...transform,
    scale: scale / factor,
  });
};

export const putMap = async (
  env: AppEnv,
  db: AppDatabase,
  id: string,
  version: number,
  document: MapDocument,
  derived: MapDerivedAssets = {},
): Promise<Map> => {
  const current = requireMap(db, id);
  if (current.version !== version) {
    throw new AppError('state_conflict', 409, 'La mappa è stata modificata altrove', {
      currentVersion: current.version,
    });
  }
  if (
    document.widthPx !== current.widthPx
    || document.heightPx !== current.heightPx
  ) {
    throw new AppError(
      'validation_error',
      400,
      'Le dimensioni della mappa non possono essere modificate',
      {
        expected: { widthPx: current.widthPx, heightPx: current.heightPx },
        received: { widthPx: document.widthPx, heightPx: document.heightPx },
      },
    );
  }
  const currentAssetId = backgroundLayer(document).imageAssetId;
  const asset = currentAssetId === null ? null : getStoredAsset(db, currentAssetId);
  if (currentAssetId !== null && asset === null) {
    throw notFound('Immagine non trovata');
  }
  // Lo sfondo precedente può essere sostituito o azzerato: va recuperato prima
  // dell'update per poterlo raccogliere quando nessuno lo referenzia più.
  const previousBackgroundId = backgroundLayer(current).imageAssetId;
  const previousBackground = previousBackgroundId === null
    ? null
    : getStoredAsset(db, previousBackgroundId);
  // Tutti i riferimenti derivati vanno validati prima di qualunque scrittura:
  // un solo asset inesistente annulla l'intero aggiornamento.
  for (const derivedId of [derived.thumbAssetId, derived.compositeAssetId]) {
    if (derivedId !== undefined && derivedId !== null && getAsset(db, derivedId) === null) {
      throw notFound('Asset non trovato');
    }
  }
  const previousDerived: Array<{ assetId: string | null; nextId: string | null }> = [
    {
      assetId: current.thumbAssetId,
      nextId: derived.thumbAssetId === undefined ? current.thumbAssetId : derived.thumbAssetId,
    },
    {
      assetId: current.compositeAssetId,
      nextId: derived.compositeAssetId === undefined
        ? current.compositeAssetId
        : derived.compositeAssetId,
    },
  ];
  const next = asset === null ? document : await downscaleBackground(env, db, document, asset);
  const updated = updateMapDocument(db, id, next, version, derived);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'La mappa è stata modificata altrove');
  }
  if (asset !== null && asset.id !== backgroundLayer(next).imageAssetId) {
    await removeUnreferencedAsset(env, db, asset);
  }
  if (
    previousBackground !== null
    && previousBackgroundId !== backgroundLayer(next).imageAssetId
  ) {
    await removeUnreferencedAsset(env, db, previousBackground);
  }
  for (const entry of previousDerived) {
    if (entry.assetId === null || entry.assetId === entry.nextId) {
      continue;
    }
    const replaced = getStoredAsset(db, entry.assetId);
    if (replaced !== null) {
      await removeUnreferencedAsset(env, db, replaced);
    }
  }
  return updated;
};

export const removeMap = (db: AppDatabase, id: string): void => {
  requireMap(db, id);
  deleteMap(db, id);
};

export const duplicateMap = (db: AppDatabase, id: string): Map => {
  const source = requireMap(db, id);
  const [background, graphics, constraints, elements] = source.layers;
  const document: MapDocument = {
    schemaVersion: 2,
    name: `${source.name} (copia)`,
    backgroundColor: source.backgroundColor,
    widthPx: source.widthPx,
    heightPx: source.heightPx,
    grid: structuredClone(source.grid),
    layers: [
      structuredClone(background),
      structuredClone(graphics),
      structuredClone(constraints),
      structuredClone(elements),
    ],
    ambientLight: source.ambientLight,
    visionLimitFeet: source.visionLimitFeet,
    visionEnabled: source.visionEnabled,
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
  for (const spawn of spawnsOf(map)) {
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
        id: newId(),
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
  const starts = startsOf(map);
  for (const assignment of assignments) {
    const start = starts.find((entry) => entry.id === assignment.startId);
    if (start === undefined || assignedStarts.has(start.id)) {
      continue;
    }
    const actor = getActor(db, assignment.actorId);
    if (actor === null || actor.campaignId !== map.campaignId || actor.kind !== 'pc') {
      continue;
    }
    assignedStarts.add(start.id);
    tokens.push({
      id: newId(),
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

/**
 * Adatta un asset a riempire la scena (cover): scala massima fra i due assi e
 * centratura dell'eccedenza su entrambe le direzioni.
 */
const coverTransform = (map: Map, asset: Asset): BackgroundTransform => {
  const scale = Math.max(map.widthPx / asset.width, map.heightPx / asset.height);
  return {
    scale,
    x: (map.widthPx - asset.width * scale) / 2,
    y: (map.heightPx - asset.height * scale) / 2,
  };
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
  const background = backgroundLayer(map);
  const composite = map.compositeAssetId === null ? null : getAsset(tx, map.compositeAssetId);
  const sceneImage = composite === null
    ? {
      imageAssetId: background.imageAssetId,
      backgroundTransform: { ...background.imageTransform },
    }
    : {
      imageAssetId: composite.id,
      backgroundTransform: coverTransform(map, composite),
    };
  const walls = wallsOf(map).map((wall) => structuredClone(wall));
  const lights = lightsOf(map).map(({ type: _type, ...light }) => structuredClone(light));
  const terrain = {
    ambientLight: map.ambientLight,
    visionLimitFeet: map.visionLimitFeet,
    visionEnabled: map.visionEnabled,
    walls,
    lights,
  };
  const state: SceneState = {
    ...createDefaultSceneState(fogBase, terrain),
    backgroundColor: map.backgroundColor,
    grid: map.grid,
    fog: { base: fogBase, ops: [], override: 'none' },
    terrain: {
      ...terrain,
      walls: walls.map((wall) => ({ ...wall })),
      lights: lights.map((light) => ({ ...light })),
    },
    showDoorIcons: map.showDoorIcons,
    ...(map.startView === undefined ? {} : { startView: map.startView }),
  };
  state.tokens = createTokens(tx, map, input.playerAssignments);
  state.loot = lootOf(map).map(({ id, itemId, x, y, quantity, visible }) => ({
    id,
    itemId,
    x,
    y,
    quantity,
    visible,
  }));
  const scene = insertScene(tx, campaignId, {
    name: input.name ?? map.name,
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    ...(sceneImage.imageAssetId === null ? {} : { imageAssetId: sceneImage.imageAssetId }),
    backgroundTransform: sceneImage.backgroundTransform,
    mapId: map.id,
  }, state);
  updateCampaign(tx, campaignId, { activeSceneId: scene.id });
  return { sceneId: scene.id, mapId: map.id, fogBase };
});
