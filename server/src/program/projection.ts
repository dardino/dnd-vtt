import {
  computeVisionGrid,
  doorsForDisplay,
  isTokenVisible,
  sceneStateSchema,
  tokenCenterCell,
  type Actor,
  type Asset,
  type DisplayLayer,
  type ProgramComposition,
  type ProgramLayer,
  type PublicScene,
  type PublicToken,
  type Scene,
  type SceneState,
  type VisionSource,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getAssetsByIds } from '../db/assets.repository.js';
import { getActorsByIds } from '../db/actors.repository.js';
import { getScene, getSceneState } from '../db/scenes.repository.js';

interface ResolvedScene {
  scene: Scene;
  state: SceneState;
}

/**
 * Snapshot valido per una singola proiezione (richiesta HTTP o broadcast):
 * attori e asset sono precaricati in batch e condivisi tra layer, token e scene.
 */
export interface ProjectionContext {
  actorsById: Map<string, Actor>;
  assetsById: Map<string, Asset>;
  scenesById: Map<string, ResolvedScene | null>;
}

const resolveScene = (
  db: AppDatabase,
  context: ProjectionContext,
  sceneId: string,
): ResolvedScene | null => {
  if (!context.scenesById.has(sceneId)) {
    const scene = getScene(db, sceneId);
    const stored = getSceneState(db, sceneId);
    context.scenesById.set(
      sceneId,
      scene === null || stored === null
        ? null
        : { scene, state: sceneStateSchema.parse(stored.state) },
    );
  }
  return context.scenesById.get(sceneId) ?? null;
};

export const createProjectionContext = (
  db: AppDatabase,
  composition: ProgramComposition,
): ProjectionContext => {
  const context: ProjectionContext = {
    actorsById: new Map(),
    assetsById: new Map(),
    scenesById: new Map(),
  };
  const actorIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const layer of [composition.base, ...composition.overlays]) {
    const content = layer.content;
    switch (content.type) {
      case 'map': {
        const resolved = resolveScene(db, context, content.sceneId);
        if (resolved === null) {
          break;
        }
        for (const token of resolved.state.tokens) {
          if (token.actorId !== undefined) {
            actorIds.add(token.actorId);
          }
        }
        if (resolved.scene.imageAssetId !== null) {
          assetIds.add(resolved.scene.imageAssetId);
        }
        break;
      }
      case 'actor':
        actorIds.add(content.actorId);
        break;
      case 'image':
        assetIds.add(content.assetId);
        break;
      default:
        break;
    }
  }
  if (actorIds.size > 0) {
    for (const [id, actor] of getActorsByIds(db, [...actorIds])) {
      context.actorsById.set(id, actor);
      if (actor.imageAssetId !== null) {
        assetIds.add(actor.imageAssetId);
      }
    }
  }
  if (assetIds.size > 0) {
    for (const [id, asset] of getAssetsByIds(db, [...assetIds])) {
      context.assetsById.set(id, asset);
    }
  }
  return context;
};

const actorOf = (context: ProjectionContext, id: string): Actor | null =>
  context.actorsById.get(id) ?? null;

const assetOf = (context: ProjectionContext, id: string): Asset | null =>
  context.assetsById.get(id) ?? null;

const actorView = (
  context: ProjectionContext,
  actorId: string,
): DisplayLayer['actor'] => {
  const actor = actorOf(context, actorId);
  if (actor === null) {
    return undefined;
  }
  const asset = actor.imageAssetId === null ? null : assetOf(context, actor.imageAssetId);
  return {
    id: actor.id,
    name: actor.name,
    kind: actor.kind,
    imageUrl: asset?.url ?? null,
    hp: actor.hp === null ? null : { current: actor.hp.current, max: actor.hp.max },
  };
};

const publicScene = (
  db: AppDatabase,
  context: ProjectionContext,
  sceneId: string,
  fogEnabled: boolean,
): PublicScene | undefined => {
  const resolved = resolveScene(db, context, sceneId);
  if (resolved === null) {
    return undefined;
  }
  const { scene, state } = resolved;
  const grid = state.grid;
  const fog = fogEnabled ? state.fog : { base: 'revealed' as const, ops: [], override: 'none' as const };
  const sources: VisionSource[] = fogEnabled
    ? state.tokens.flatMap((token) => {
      if (token.actorId === undefined) {
        return [];
      }
      const actor = actorOf(context, token.actorId);
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
    const actor = token.actorId === undefined ? null : actorOf(context, token.actorId);
    const actorAsset = actor?.imageAssetId === null || actor?.imageAssetId === undefined
      ? null
      : assetOf(context, actor.imageAssetId);
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
  const asset = scene.imageAssetId === null ? null : assetOf(context, scene.imageAssetId);
  return {
    id: scene.id,
    name: scene.name,
    widthPx: scene.widthPx,
    heightPx: scene.heightPx,
    imageUrl: asset?.url ?? null,
    backgroundColor: state.backgroundColor,
    backgroundTransform: scene.backgroundTransform,
    grid,
    tokens,
    fog,
    ...(vision === null ? {} : { vision }),
    ...(fogEnabled && state.showDoorIcons
      ? { doors: doorsForDisplay(state.terrain, fog, vision, grid) }
      : {}),
  };
};

export const displayLayer = (
  db: AppDatabase,
  context: ProjectionContext,
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
        scene: publicScene(db, context, content.sceneId, content.fog),
      };
    case 'actor':
      return {
        id: layer.id,
        frame: layer.frame,
        opacity: layer.opacity,
        type: 'actor',
        actor: actorView(context, content.actorId),
      };
    case 'image': {
      const asset = assetOf(context, content.assetId);
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
