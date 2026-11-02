import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultSceneState,
  createCampaignSchema,
  type Actor,
  type Asset,
  type ProgramComposition,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import type * as actorsRepository from '../src/db/actors.repository.js';
import type * as assetsRepository from '../src/db/assets.repository.js';

vi.mock('../src/db/actors.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof actorsRepository>();
  return {
    ...actual,
    getActor: vi.fn(actual.getActor),
    getActorsByIds: vi.fn(actual.getActorsByIds),
  };
});

vi.mock('../src/db/assets.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof assetsRepository>();
  return {
    ...actual,
    getAsset: vi.fn(actual.getAsset),
    getAssetsByIds: vi.fn(actual.getAssetsByIds),
  };
});

import { getActor, getActorsByIds, insertActor } from '../src/db/actors.repository.js';
import { getAsset, getAssetsByIds, insertAsset } from '../src/db/assets.repository.js';
import { insertCampaign } from '../src/db/campaigns.repository.js';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { insertDisplay, updateDisplayComposition } from '../src/db/displays.repository.js';
import { runMigrations } from '../src/db/migrations.js';
import { insertScene } from '../src/db/scenes.repository.js';
import { projectDisplay } from '../src/program/service.js';
import { defaultMonsterStatblock } from './factories.js';
import { createTestEnv } from './helpers.js';

const token = (id: string, actorId: string, x: number): TokenState => ({
  id,
  actorId,
  label: id,
  x,
  y: 0,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 10, max: 10, temp: 0 },
  conditions: [],
  visible: true,
  owner: 'players',
});

describe('projectDisplay: contesto di proiezione condiviso', () => {
  let database: DatabaseHandle;

  beforeAll(() => {
    const env = createTestEnv();
    database = createDatabase(':memory:');
    runMigrations(database, env.migrationsDir);
  });

  afterAll(() => {
    database.close();
  });

  beforeEach(() => {
    vi.mocked(getActor).mockClear();
    vi.mocked(getActorsByIds).mockClear();
    vi.mocked(getAsset).mockClear();
    vi.mocked(getAssetsByIds).mockClear();
  });

  it('precarica 30 attori e 30 asset con una query per tabella', () => {
    const db = database.db;
    const campaign = insertCampaign(db, createCampaignSchema.parse({ name: 'Proiezione' }));
    const assets: Asset[] = [];
    const actors: Actor[] = [];
    for (let index = 0; index < 30; index += 1) {
      const asset = insertAsset(db, {
        hash: index.toString(16).padStart(64, '0'),
        mime: 'image/webp',
        bytes: 100,
        width: 64,
        height: 64,
        originalPath: `originals/${index}.png`,
        webpPath: `maps/${index}.webp`,
        thumbPath: `thumbs/${index}.webp`,
      });
      assets.push(asset);
      actors.push(insertActor(db, {
        campaignId: campaign.id,
        kind: 'monster',
        name: `Mostro ${index}`,
        statblock: defaultMonsterStatblock(),
        xp: 0,
        imageAssetId: asset.id,
      }));
    }
    const sceneAsset = assets[0];
    if (sceneAsset === undefined) {
      throw new Error('asset di scena mancante');
    }

    const state: SceneState = createDefaultSceneState('revealed');
    state.tokens = Array.from(
      { length: 30 },
      (_, index) => token(`t${index}`, actors[index]?.id ?? '', index),
    );
    const scene = insertScene(
      db,
      campaign.id,
      { name: 'Mappa', widthPx: 700, heightPx: 700, imageAssetId: sceneAsset.id },
      state,
    );

    const mapLayer = {
      id: 'map',
      content: {
        type: 'map' as const,
        sceneId: scene.id,
        viewport: { x: 0, y: 0, zoom: 1 },
        fog: false,
        cameraLocked: false,
      },
      frame: { x: 0, y: 0, width: 1, height: 1 },
      opacity: 1,
      interactive: true,
    };
    const composition: ProgramComposition = {
      base: mapLayer,
      overlays: [
        {
          ...mapLayer,
          id: 'map-overlay',
          frame: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        },
        {
          id: 'actor-a',
          content: { type: 'actor', actorId: actors[0]?.id ?? '' },
          frame: { x: 0, y: 0, width: 0.5, height: 0.5 },
          opacity: 1,
          interactive: true,
        },
        {
          id: 'image-b',
          content: { type: 'image', assetId: assets[29]?.id ?? '', fit: 'contain' },
          frame: { x: 0, y: 0, width: 1, height: 1 },
          opacity: 1,
          interactive: true,
        },
      ],
    };
    const displays = Array.from(
      { length: 3 },
      (_, index) => insertDisplay(db, campaign.id, `TV ${index}`),
    );
    for (const display of displays) {
      updateDisplayComposition(db, display.id, composition, display.compositionVersion);
    }

    const projected = displays.map((display) => {
      vi.mocked(getActorsByIds).mockClear();
      vi.mocked(getAssetsByIds).mockClear();
      const state = projectDisplay(db, display);

      const actorCalls = vi.mocked(getActorsByIds).mock.calls;
      expect(actorCalls).toHaveLength(1);
      expect(actorCalls[0]?.[1]).toHaveLength(30);
      const assetCalls = vi.mocked(getAssetsByIds).mock.calls;
      expect(assetCalls).toHaveLength(1);
      expect(assetCalls[0]?.[1]).toHaveLength(30);
      expect(getActor).not.toHaveBeenCalled();
      expect(getAsset).not.toHaveBeenCalled();
      return state;
    });

    expect(projected[0]?.composition.base.scene?.tokens).toHaveLength(30);
    expect(projected[0]?.composition.base.scene?.tokens[0]?.imageUrl).toBe(assets[0]?.url);
    expect(projected[0]?.composition.base.scene?.tokens[29]?.imageUrl).toBe(assets[29]?.url);
    expect(projected[0]?.composition.base.scene?.imageUrl).toBe(sceneAsset.url);
    expect(projected[0]?.composition.overlays[0]?.scene?.tokens).toHaveLength(30);
    expect(projected[0]?.composition.overlays[1]?.actor?.imageUrl).toBe(assets[0]?.url);
    expect(projected[0]?.composition.overlays[2]?.imageUrl).toBe(assets[29]?.url);
  });

  it('non riusa la cache tra due proiezioni distinte', () => {
    const db = database.db;
    const campaign = insertCampaign(db, createCampaignSchema.parse({ name: 'Isolata' }));
    const actor = insertActor(db, {
      campaignId: campaign.id,
      kind: 'monster',
      name: 'Lupo',
      statblock: defaultMonsterStatblock(),
      xp: 0,
    });
    const display = insertDisplay(db, campaign.id, 'TV');
    updateDisplayComposition(db, display.id, {
      base: {
        id: 'actor',
        content: { type: 'actor', actorId: actor.id },
        frame: { x: 0, y: 0, width: 1, height: 1 },
        opacity: 1,
        interactive: true,
      },
      overlays: [],
    }, display.compositionVersion);

    projectDisplay(db, display);
    projectDisplay(db, display);

    expect(getActorsByIds).toHaveBeenCalledTimes(2);
    expect(getAssetsByIds).not.toHaveBeenCalled();
  });
});
