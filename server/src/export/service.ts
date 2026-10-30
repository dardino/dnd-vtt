import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  campaignExportSchema,
  type Actor,
  type CampaignExport,
  type CreateCampaign,
  type ImportResult,
  type SceneState,
} from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AppDatabase } from '../db/client.js';
import type { AppEnv } from '../config/env.js';
import { storeAsset } from '../assets/service.js';
import { getCampaign, insertCampaign, updateCampaign } from '../db/campaigns.repository.js';
import { insertActor, insertPcActor } from '../db/actors.repository.js';
import { getProgramRow, insertProgram } from '../db/programs.repository.js';
import { insertScene } from '../db/scenes.repository.js';
import { getAsset } from '../db/assets.repository.js';
import { listSessions } from '../db/sessions.repository.js';
import { actors, scenes, sessions } from '../db/schema.js';
import { notFound } from '../errors.js';

const refs = (value: unknown): Set<string> => {
  const ids = new Set<string>();
  if (typeof value !== 'object' || value === null) {
    return ids;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      for (const id of refs(entry)) {
        ids.add(id);
      }
    }
    return ids;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      (key === 'actorId' || key === 'sceneId' || key === 'assetId' || key === 'imageAssetId')
      && typeof entry === 'string'
    ) {
      ids.add(entry);
    } else {
      for (const id of refs(entry)) {
        ids.add(id);
      }
    }
  }
  return ids;
};

const remapUnknown = (value: unknown, map: Map<string, string>): unknown => {
  if (typeof value === 'string') {
    return map.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapUnknown(entry, map));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, remapUnknown(entry, map)]),
    );
  }
  return value;
};

const remap = <T>(value: T, map: Map<string, string>): T =>
  remapUnknown(value, map) as T;

export const exportCampaign = async (
  env: AppEnv,
  db: AppDatabase,
  campaignId: string,
): Promise<CampaignExport> => {
  const campaign = getCampaign(db, campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const sceneRows = db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).all();
  const actorRows = db.select().from(actors).where(eq(actors.campaignId, campaignId)).all();
  const program = getProgramRow(db, campaignId);
  const bundleScenes = sceneRows.map((row) => ({
    scene: {
      id: row.id,
      campaignId: row.campaignId,
      name: row.name,
      imageAssetId: row.imageAssetId,
      widthPx: row.widthPx,
      heightPx: row.heightPx,
      stateVersion: row.stateVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    state: JSON.parse(row.state) as SceneState,
  }));
  const bundleActors: Actor[] = actorRows.map((row) => ({
    id: row.id,
    campaignId: row.campaignId,
    kind: row.kind,
    name: row.name,
    statblock: JSON.parse(row.statblock) as Actor['statblock'],
    rulesVersion: row.rulesVersion,
    xp: row.xp,
    sheetVersion: row.sheetVersion,
    dmNotes: row.dmNotes,
    imageAssetId: row.imageAssetId,
    hp: row.hpCurrent === null || row.hpMax === null
      ? null
      : { current: row.hpCurrent, max: row.hpMax, temp: row.hpTemp ?? 0 },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  const ids = new Set<string>();
  for (const scene of bundleScenes) {
    if (scene.scene.imageAssetId !== null) {
      ids.add(scene.scene.imageAssetId);
    }
  }
  for (const actor of bundleActors) {
    if (actor.imageAssetId !== null) {
      ids.add(actor.imageAssetId);
    }
  }
  if (program !== null) {
    for (const id of refs(program.state)) {
      if (getAsset(db, id) !== null) {
        ids.add(id);
      }
    }
  }
  const assetsExport: CampaignExport['assets'] = [];
  for (const id of ids) {
    const asset = getAsset(db, id);
    if (asset === null) {
      continue;
    }
    try {
      const data = await readFile(join(env.uploadDir, 'webp', `${asset.hash}.webp`));
      assetsExport.push({ id: asset.id, mime: 'image/webp', data: data.toString('base64') });
    } catch {
      // Un asset orfano viene omesso; i riferimenti vengono azzerati in import.
    }
  }
  return campaignExportSchema.parse({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    campaign,
    scenes: bundleScenes,
    actors: bundleActors,
    program: program?.state ?? null,
    assets: assetsExport,
    sessions: listSessions(db, campaignId),
  });
};

export const importCampaign = async (
  env: AppEnv,
  db: AppDatabase,
  bundle: CampaignExport,
): Promise<ImportResult> => {
  const assetMap = new Map<string, string>();
  let importedAssets = 0;
  for (const asset of bundle.assets) {
    try {
      const buffer = Buffer.from(asset.data, 'base64');
      const created = await storeAsset(env, db, buffer);
      assetMap.set(asset.id, created.id);
      importedAssets += 1;
    } catch {
      // Un asset corrotto viene saltato; il resto dell'import continua.
    }
  }
  const campaignInput: CreateCampaign = {
    name: `${bundle.campaign.name} (import)`,
    description: bundle.campaign.description,
    fogDefault: bundle.campaign.fogDefault,
    advancementMode: bundle.campaign.advancementMode,
  };
  const created = insertCampaign(db, campaignInput);
  const sceneMap = new Map<string, string>();
  const actorMap = new Map<string, string>();

  for (const actor of bundle.actors) {
    const imageAssetId = actor.imageAssetId === null ? undefined : assetMap.get(actor.imageAssetId);
    if (actor.statblock.kind === 'pc') {
      const createdActor = insertPcActor(db, {
        name: actor.name,
        campaignId: created.id,
        statblock: actor.statblock,
        playerNotes: null,
        dmNotes: actor.dmNotes,
      });
      actorMap.set(actor.id, createdActor.id);
      if (imageAssetId !== undefined) {
        db.update(actors).set({ imageAssetId }).where(eq(actors.id, createdActor.id)).run();
      }
    } else {
      const createdActor = insertActor(db, {
        campaignId: created.id,
        kind: actor.kind === 'pc' ? 'npc' : actor.kind,
        name: actor.name,
        statblock: actor.statblock,
        ...(actor.rulesVersion === null ? {} : { rulesVersion: actor.rulesVersion }),
        xp: actor.xp,
        ...(actor.dmNotes === null ? {} : { dmNotes: actor.dmNotes }),
        ...(imageAssetId === undefined ? {} : { imageAssetId }),
      });
      actorMap.set(actor.id, createdActor.id);
    }
  }

  for (const entry of bundle.scenes) {
    const scene = insertScene(db, created.id, {
      name: entry.scene.name,
      widthPx: entry.scene.widthPx,
      heightPx: entry.scene.heightPx,
      ...(entry.scene.imageAssetId === null || assetMap.get(entry.scene.imageAssetId) === undefined
        ? {}
        : { imageAssetId: assetMap.get(entry.scene.imageAssetId) }),
    }, remap(entry.state, new Map([...actorMap, ...assetMap])));
    sceneMap.set(entry.scene.id, scene.id);
  }

  if (bundle.program !== null) {
    const remapped = remap(bundle.program, new Map([...sceneMap, ...actorMap, ...assetMap]));
    insertProgram(db, created.id, remapped);
  }

  for (const session of bundle.sessions) {
    db.insert(sessions).values({
      id: uuidv7(),
      campaignId: created.id,
      number: session.number,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      notes: session.notes,
    }).run();
  }

  const activeSceneId = bundle.campaign.activeSceneId === null
    ? null
    : sceneMap.get(bundle.campaign.activeSceneId) ?? null;
  const campaign = updateCampaign(db, created.id, {
    activeSceneId,
    autoApprove: bundle.campaign.autoApprove,
  });
  return {
    campaign: campaign ?? created,
    imported: {
      scenes: sceneMap.size,
      actors: actorMap.size,
      assets: importedAssets,
    },
  };
};
