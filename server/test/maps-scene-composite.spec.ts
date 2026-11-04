import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import {
  mapDocumentSchema,
  type Asset,
  type BackgroundTransform,
  type Map,
  type MapDocument,
  type SceneSnapshot,
} from '@dnd-vtt/shared';
import { storeAsset } from '../src/assets/service.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign } from './factories.js';

/**
 * Asset id mai inserito nel database: la validazione deve accettarlo come UUID
 * e trattarlo come riferimento inesistente.
 */
const NONEXISTENT_ASSET_ID = '33333333-3333-4333-8333-333333333333';

const storeImage = async (
  testApp: TestApp,
  width: number,
  height: number,
  background = '#335577',
): Promise<Asset> => {
  const buffer = await sharp({
    create: { width, height, channels: 3, background },
  }).png().toBuffer();
  return storeAsset(testApp.env, testApp.database.db, buffer);
};

const documentOf = (map: Map): MapDocument => {
  const document: Record<string, unknown> = { ...map };
  for (const key of [
    'id',
    'campaignId',
    'version',
    'createdAt',
    'updatedAt',
    'imageAssetId',
    'thumbAssetId',
    'compositeAssetId',
  ]) {
    delete document[key];
  }
  return mapDocumentSchema.parse(document);
};

interface CreateMapInput {
  imageAssetId?: string;
  widthPx?: number;
  heightPx?: number;
}

const createMap = async (
  app: FastifyInstance,
  campaignId: string,
  input: CreateMapInput = {},
): Promise<Map> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/maps`,
    payload: {
      name: 'Mappa con derivati',
      widthPx: input.widthPx ?? 1280,
      heightPx: input.heightPx ?? 720,
      ...(input.imageAssetId === undefined ? {} : { imageAssetId: input.imageAssetId }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Map>();
};

interface DerivedAssets {
  thumbAssetId?: string | null;
  compositeAssetId?: string | null;
}

const saveMap = async (
  app: FastifyInstance,
  map: Map,
  document: MapDocument,
): Promise<Map> => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/v1/maps/${map.id}`,
    payload: { version: map.version, document },
  });
  expect(response.statusCode).toBe(200);
  return response.json<Map>();
};

/** Scrive le colonne derivate direttamente: isola i test che non usano il PUT. */
const setMapAssetColumns = (
  testApp: TestApp,
  mapId: string,
  patch: DerivedAssets,
): void => {
  if (patch.thumbAssetId !== undefined) {
    testApp.database.sqlite
      .prepare('UPDATE maps SET thumb_asset_id = ? WHERE id = ?')
      .run(patch.thumbAssetId, mapId);
  }
  if (patch.compositeAssetId !== undefined) {
    testApp.database.sqlite
      .prepare('UPDATE maps SET composite_asset_id = ? WHERE id = ?')
      .run(patch.compositeAssetId, mapId);
  }
};

const withBackground = (
  document: MapDocument,
  imageAssetId: string | null,
  imageTransform: BackgroundTransform,
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [
      { ...background, imageAssetId, imageTransform: { ...imageTransform } },
      graphics,
      constraints,
      elements,
    ],
  };
};

const withElements = (
  document: MapDocument,
  items: MapDocument['layers'][3]['items'],
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [background, graphics, constraints, { ...elements, items }],
  };
};

const withWalls = (
  document: MapDocument,
  items: MapDocument['layers'][2]['items'],
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [background, graphics, { ...constraints, items }, elements],
  };
};

const createScene = async (
  app: FastifyInstance,
  campaignId: string,
  mapId: string,
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/scenes/from-map`,
    payload: { mapId, playerAssignments: [] },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ sceneId: string }>().sceneId;
};

const fetchScene = async (app: FastifyInstance, sceneId: string): Promise<SceneSnapshot> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
  expect(response.statusCode).toBe(200);
  return response.json<SceneSnapshot>();
};

describe('scena creata da mappa con derivati', () => {
  it('usa il composito adattandolo in cover alle dimensioni della mappa', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 200, 100, '#335577');
    const composite = await storeImage(testApp, 400, 400, '#553377');
    const map = await createMap(testApp.app, campaignId, {
      imageAssetId: background.id,
      widthPx: 1280,
      heightPx: 720,
    });
    setMapAssetColumns(testApp, map.id, { compositeAssetId: composite.id });

    const sceneId = await createScene(testApp.app, campaignId, map.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(snapshot.scene).toMatchObject({
      imageAssetId: composite.id,
      widthPx: 1280,
      heightPx: 720,
    });
    // cover: scala = max(1280/400, 720/400) = 3.2, centrato su entrambi gli assi.
    expect(snapshot.scene.backgroundTransform.scale).toBeCloseTo(3.2, 6);
    expect(snapshot.scene.backgroundTransform.x).toBeCloseTo(0, 6);
    expect(snapshot.scene.backgroundTransform.y).toBeCloseTo(-280, 6);
    await closeTestApp(testApp);
  });

  it('adatta in cover un composito orizzontale non quadrato', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const composite = await storeImage(testApp, 400, 200, '#553377');
    const map = await createMap(testApp.app, campaignId, {
      widthPx: 1280,
      heightPx: 720,
    });
    setMapAssetColumns(testApp, map.id, { compositeAssetId: composite.id });

    const sceneId = await createScene(testApp.app, campaignId, map.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    // cover: scala = max(1280/400, 720/200) = 3.6, eccedenza orizzontale.
    expect(snapshot.scene.imageAssetId).toBe(composite.id);
    expect(snapshot.scene.backgroundTransform.scale).toBeCloseTo(3.6, 6);
    expect(snapshot.scene.backgroundTransform.x).toBeCloseTo(-80, 6);
    expect(snapshot.scene.backgroundTransform.y).toBeCloseTo(0, 6);
    await closeTestApp(testApp);
  });

  it('adatta in cover un composito verticale non quadrato', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const composite = await storeImage(testApp, 200, 400, '#553377');
    const map = await createMap(testApp.app, campaignId, {
      widthPx: 1280,
      heightPx: 720,
    });
    setMapAssetColumns(testApp, map.id, { compositeAssetId: composite.id });

    const sceneId = await createScene(testApp.app, campaignId, map.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    // cover: scala = max(1280/200, 720/400) = 6.4, eccedenza verticale.
    expect(snapshot.scene.imageAssetId).toBe(composite.id);
    expect(snapshot.scene.backgroundTransform.scale).toBeCloseTo(6.4, 6);
    expect(snapshot.scene.backgroundTransform.x).toBeCloseTo(0, 6);
    expect(snapshot.scene.backgroundTransform.y).toBeCloseTo(-920, 6);
    await closeTestApp(testApp);
  });

  it('ripiega su sfondo e trasformazione quando il composito è null', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 200, 100, '#335577');
    const map = await createMap(testApp.app, campaignId, {
      imageAssetId: background.id,
    });
    const transform = { x: 5, y: 6, scale: 1.5 };
    const saved = await saveMap(
      testApp.app,
      map,
      withBackground(documentOf(map), background.id, transform),
    );

    const sceneId = await createScene(testApp.app, campaignId, saved.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(snapshot.scene.imageAssetId).toBe(background.id);
    expect(snapshot.scene.backgroundTransform).toEqual(transform);
    await closeTestApp(testApp);
  });

  it('ripiega su sfondo e trasformazione quando l\'asset del composito manca', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 200, 100, '#335577');
    const map = await createMap(testApp.app, campaignId, {
      imageAssetId: background.id,
    });
    const transform = { x: 2, y: -3, scale: 1.25 };
    const saved = await saveMap(
      testApp.app,
      map,
      withBackground(documentOf(map), background.id, transform),
    );
    setMapAssetColumns(testApp, saved.id, { compositeAssetId: NONEXISTENT_ASSET_ID });

    const sceneId = await createScene(testApp.app, campaignId, saved.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(snapshot.scene.imageAssetId).toBe(background.id);
    expect(snapshot.scene.backgroundTransform).toEqual(transform);
    await closeTestApp(testApp);
  });

  it('copia il loot senza type e continua a copiare muri e luci', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);
    const document = withElements(
      withWalls(documentOf(map), [
        { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
      ]),
      [
        {
          id: 'light-1',
          type: 'light',
          x: 2,
          y: 2,
          brightFeet: 20,
          dimFeet: 40,
          color: '#ffcc80',
          enabled: true,
          shape: 'circle',
          angle: 60,
        },
        {
          id: 'loot-1',
          type: 'loot',
          itemId: 'potion-of-healing',
          x: 4,
          y: 5,
          quantity: 3,
          visible: false,
        },
        {
          id: 'loot-2',
          type: 'loot',
          itemId: 'torch',
          x: 6,
          y: 7,
          quantity: 1,
          visible: true,
        },
      ],
    );
    const saved = await saveMap(testApp.app, map, document);

    const sceneId = await createScene(testApp.app, campaignId, saved.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(snapshot.state.loot).toEqual([
      {
        id: 'loot-1',
        itemId: 'potion-of-healing',
        x: 4,
        y: 5,
        quantity: 3,
        visible: false,
      },
      {
        id: 'loot-2',
        itemId: 'torch',
        x: 6,
        y: 7,
        quantity: 1,
        visible: true,
      },
    ]);
    expect(snapshot.state.loot[0]).not.toHaveProperty('type');
    expect(snapshot.state.terrain.walls.map((wall) => wall.id)).toEqual(['wall-1']);
    expect(snapshot.state.terrain.lights.map((light) => light.id)).toEqual(['light-1']);
    await closeTestApp(testApp);
  });

  it('crea una scena con loot vuoto quando la mappa non ha elementi loot', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);

    const sceneId = await createScene(testApp.app, campaignId, map.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(snapshot.state.loot).toEqual([]);
    await closeTestApp(testApp);
  });
});
