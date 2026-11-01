import {
  computeVisionGrid,
  doorsForDisplay,
  isTokenVisible,
  sceneStateSchema,
  tokenCenterCell,
  type Display,
  type DisplayLayer,
  type DisplayState,
  type ProgramComposition,
  type ProgramLayer,
  type ProgramState,
  type PublicScene,
  type PublicToken,
  type Viewport,
  type VisionSource,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getAsset } from '../db/assets.repository.js';
import { getActor } from '../db/actors.repository.js';
import { getCampaign } from '../db/campaigns.repository.js';
import {
  getDisplay,
  getDisplayByCode,
  getDisplayComposition,
  touchDisplay,
  updateDisplayComposition,
} from '../db/displays.repository.js';
import { listDiceRolls } from '../db/dice-rolls.repository.js';
import { getProgramRow, insertProgram, updateProgram } from '../db/programs.repository.js';
import { getScene, getSceneState } from '../db/scenes.repository.js';
import { AppError, notFound } from '../errors.js';

const VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

const blankLayer = (): ProgramLayer => ({
  id: 'base',
  content: { type: 'blank' },
  frame: { x: 0, y: 0, width: 1, height: 1 },
  opacity: 1,
  interactive: true,
});

export const getProgram = (db: AppDatabase, campaignId: string): { version: number; state: ProgramState } => {
  const existing = getProgramRow(db, campaignId);
  if (existing !== null) {
    return existing;
  }
  const campaign = getCampaign(db, campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const content = campaign.activeSceneId === null
    ? { type: 'blank' as const }
    : {
      type: 'map' as const,
      sceneId: campaign.activeSceneId,
      viewport: VIEWPORT,
      fog: true,
      cameraLocked: false,
    };
  const state: ProgramState = {
    base: { ...blankLayer(), content },
    overlays: [],
    hud: { dice: true, initiative: true, pointer: false },
    blackout: false,
    background: '#000000',
    updatedAt: new Date().toISOString(),
  };
  return insertProgram(db, campaignId, state);
};

export const putProgram = (
  db: AppDatabase,
  campaignId: string,
  version: number,
  state: ProgramState,
): { version: number; state: ProgramState } => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  const current = getProgram(db, campaignId);
  if (current.version !== version) {
    throw new AppError('state_conflict', 409, 'Il program è stato modificato altrove', {
      currentVersion: current.version,
    });
  }
  const updated = updateProgram(db, campaignId, { ...state, updatedAt: new Date().toISOString() }, version);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'Il program è stato modificato altrove');
  }
  return updated;
};

export const putDisplayComposition = (
  db: AppDatabase,
  campaignId: string,
  displayId: string,
  version: number,
  composition: ProgramComposition,
): { version: number; composition: ProgramComposition } => {
  const display = getDisplay(db, displayId);
  if (display === null || display.campaignId !== campaignId) {
    throw notFound('Schermo non trovato');
  }
  const updated = updateDisplayComposition(db, displayId, composition, version);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'Lo schermo è stato aggiornato altrove', {
      currentVersion: display.compositionVersion,
    });
  }
  return { version: updated, composition };
};

export const putDisplayViewport = (
  db: AppDatabase,
  campaignId: string,
  displayId: string,
  version: number | undefined,
  viewport: Viewport,
): { version: number; viewport: Viewport } => {
  const display = getDisplay(db, displayId);
  if (display === null || display.campaignId !== campaignId) {
    throw notFound('Schermo non trovato');
  }
  const program = getProgram(db, campaignId);
  const override = getDisplayComposition(db, displayId);
  const composition = override?.composition ?? {
    base: program.state.base,
    overlays: program.state.overlays,
  };
  const mapLayer = [composition.base, ...composition.overlays]
    .find((layer) => layer.content.type === 'map');
  if (mapLayer === undefined || mapLayer.content.type !== 'map') {
    throw new AppError('validation_error', 422, 'Lo schermo non sta proiettando una mappa');
  }
  const content = { ...mapLayer.content, viewport };
  const next = {
    base: composition.base.id === mapLayer.id
      ? { ...composition.base, content }
      : composition.base,
    overlays: composition.overlays.map((layer) =>
      layer.id === mapLayer.id ? { ...layer, content } : layer),
  };
  const updated = updateDisplayComposition(db, displayId, next, version ?? display.compositionVersion);
  if (updated === null) {
    throw new AppError('state_conflict', 409, 'Lo schermo è stato aggiornato altrove', {
      currentVersion: display.compositionVersion,
    });
  }
  return { version: updated, viewport };
};

const actorView = (db: AppDatabase, actorId: string): DisplayLayer['actor'] => {
  const actor = getActor(db, actorId);
  if (actor === null) {
    return undefined;
  }
  const asset = actor.imageAssetId === null ? null : getAsset(db, actor.imageAssetId);
  return {
    id: actor.id,
    name: actor.name,
    kind: actor.kind,
    imageUrl: asset?.url ?? null,
    hp: actor.hp === null ? null : { current: actor.hp.current, max: actor.hp.max },
  };
};

const publicScene = (db: AppDatabase, sceneId: string, fogEnabled: boolean): PublicScene | undefined => {
  const scene = getScene(db, sceneId);
  const stored = getSceneState(db, sceneId);
  if (scene === null || stored === null) {
    return undefined;
  }
  const state = sceneStateSchema.parse(stored.state);
  const grid = state.grid;
  const fog = fogEnabled ? state.fog : { base: 'revealed' as const, ops: [], override: 'none' as const };
  const actorCache = new Map<string, ReturnType<typeof getActor>>();
  const assetCache = new Map<string, ReturnType<typeof getAsset>>();
  const actorOf = (id: string): ReturnType<typeof getActor> => {
    if (!actorCache.has(id)) {
      actorCache.set(id, getActor(db, id));
    }
    return actorCache.get(id) ?? null;
  };
  const assetOf = (id: string): ReturnType<typeof getAsset> => {
    if (!assetCache.has(id)) {
      assetCache.set(id, getAsset(db, id));
    }
    return assetCache.get(id) ?? null;
  };
  const sources: VisionSource[] = fogEnabled
    ? state.tokens.flatMap((token) => {
      if (token.actorId === undefined) {
        return [];
      }
      const actor = actorOf(token.actorId);
      if (actor === null || (actor.kind !== 'pc' && token.owner !== 'players')) {
        return [];
      }
      const senses = actor.statblock.senses;
      return [{
        cell: tokenCenterCell(token),
        ...(senses.darkvision === undefined ? {} : { darkvision: senses.darkvision }),
        ...(senses.blindsight === undefined ? {} : { blindsight: senses.blindsight }),
        ...(senses.truesight === undefined ? {} : { truesight: senses.truesight }),
        ...(senses.tremorsense === undefined ? {} : { tremorsense: senses.tremorsense }),
        ...(token.light === undefined ? {} : { light: token.light }),
      }];
    })
    : [];
  const vision = fogEnabled
    ? computeVisionGrid({
      widthPx: scene.widthPx,
      heightPx: scene.heightPx,
      grid,
      terrain: state.terrain,
      sources,
    })
    : null;
  const tokens: PublicToken[] = state.tokens.flatMap((token) => {
    if (!token.visible) {
      return [];
    }
    if (fogEnabled && !isTokenVisible(fog, vision, grid, token)) {
      return [];
    }
    const actor = token.actorId === undefined ? null : actorOf(token.actorId);
    const actorAsset = actor?.imageAssetId === null || actor?.imageAssetId === undefined
      ? null
      : assetOf(actor.imageAssetId);
    return [{
      id: token.id,
      label: token.label,
      x: token.x,
      y: token.y,
      size: token.size,
      rotation: token.rotation,
      elevation: token.elevation,
      hp: { current: token.hp.current, max: token.hp.max },
      conditions: token.conditions.map((condition) => condition.name),
      imageUrl: actorAsset?.url ?? null,
      portrait: actor?.portrait ?? null,
    }];
  });
  const asset = scene.imageAssetId === null ? null : assetOf(scene.imageAssetId);
  return {
    id: scene.id,
    name: scene.name,
    widthPx: scene.widthPx,
    heightPx: scene.heightPx,
    imageUrl: asset?.url ?? null,
    grid,
    tokens,
    fog,
    ...(vision === null ? {} : { vision }),
    ...(fogEnabled && state.showDoorIcons
      ? { doors: doorsForDisplay(state.terrain, fog, vision, grid) }
      : {}),
  };
};

const displayLayer = (
  db: AppDatabase,
  layer: ProgramLayer,
): DisplayLayer => {
  const content = layer.content;
  switch (content.type) {
    case 'blank':
      return { id: layer.id, frame: layer.frame, opacity: layer.opacity, type: 'blank' };
    case 'map':
      return {
        id: layer.id,
        frame: layer.frame,
        opacity: layer.opacity,
        type: 'map',
        viewport: content.viewport,
        scene: publicScene(db, content.sceneId, content.fog),
      };
    case 'actor':
      return {
        id: layer.id,
        frame: layer.frame,
        opacity: layer.opacity,
        type: 'actor',
        actor: actorView(db, content.actorId),
      };
    case 'image': {
      const asset = getAsset(db, content.assetId);
      return {
        id: layer.id,
        frame: layer.frame,
        opacity: layer.opacity,
        type: 'image',
        imageUrl: asset?.url,
        fit: content.fit,
      };
    }
    case 'text':
      return {
        id: layer.id,
        frame: layer.frame,
        opacity: layer.opacity,
        type: 'text',
        title: content.title,
        body: content.body,
      };
    case 'initiative':
      return { id: layer.id, frame: layer.frame, opacity: layer.opacity, type: 'initiative' };
    default:
      return { id: layer.id, frame: layer.frame, opacity: layer.opacity, type: 'blank' };
  }
};

export const projectDisplay = (db: AppDatabase, display: Display): DisplayState => {
  const campaign = getCampaign(db, display.campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const program = getProgram(db, display.campaignId);
  const override = getDisplayComposition(db, display.id);
  const composition = override?.composition ?? {
    base: program.state.base,
    overlays: program.state.overlays,
  };
  const base = displayLayer(db, composition.base);
  const overlays = composition.overlays.map((layer) => displayLayer(db, layer));
  const mapLayer = [composition.base, ...composition.overlays]
    .find((layer) => layer.content.type === 'map');
  let initiative: DisplayState['initiative'];
  if (mapLayer?.content.type === 'map') {
    const stored = getSceneState(db, mapLayer.content.sceneId);
    if (stored !== null) {
      const state = sceneStateSchema.parse(stored.state);
      if (state.initiative.entries.length > 0) {
        initiative = {
          active: state.initiative.active,
          round: state.initiative.round,
          turnIndex: state.initiative.turnIndex,
          entries: state.initiative.entries,
        };
      }
    }
  }
  return {
    campaign: { id: campaign.id, name: campaign.name },
    compositionVersion: display.compositionVersion,
    program: {
      hud: program.state.hud,
      blackout: program.state.blackout,
      background: program.state.background,
      updatedAt: program.state.updatedAt,
    },
    composition: { base, overlays },
    ...(initiative === undefined ? {} : { initiative }),
    rolls: listDiceRolls(db, display.campaignId, 'public').items.slice(0, 20),
  };
};

export const displayStateByCode = (
  db: AppDatabase,
  code: string,
): { display: Display; state: DisplayState } => {
  const display = getDisplayByCode(db, code);
  if (display === null) {
    throw notFound('Schermo non trovato');
  }
  touchDisplay(db, display.id);
  return { display, state: projectDisplay(db, display) };
};
