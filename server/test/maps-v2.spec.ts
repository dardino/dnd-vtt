import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import {
  mapDocumentSchema,
  type BackgroundTransform,
  type Map,
  type MapDocument,
  type MapLayers,
} from '@dnd-vtt/shared';
import { storeAsset } from '../src/assets/service.js';
import { maps } from '../src/db/schema.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign } from './factories.js';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ASSET_ID = '22222222-2222-4222-8222-222222222222';

const legacyDocument = (): Record<string, unknown> => ({
  name: 'Mappa legacy',
  imageAssetId: ASSET_ID,
  backgroundTransform: { x: 12, y: -8, scale: 1.25 },
  backgroundColor: 'rgba(20, 30, 40, 1)',
  widthPx: 1400,
  heightPx: 1000,
  grid: {
    type: 'square',
    cellSizePx: 70,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    diagonalRule: '5-5-5',
    hexOffset: 'odd-r',
  },
  terrain: {
    ambientLight: 'dim',
    visionLimitFeet: 60,
    visionEnabled: true,
    walls: [
      { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
      { id: 'door-1', kind: 'door', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, door: 'open' },
    ],
    lights: [
      { id: 'light-1', x: 3, y: 4, brightFeet: 20, dimFeet: 40, color: '#ffcc80' },
    ],
  },
  spawns: [
    {
      id: 'spawn-1',
      kind: 'monster',
      x: 2,
      y: 3,
      source: { type: 'srd', monsterId: 'goblin' },
      size: 1,
      hidden: false,
      quantity: 1,
    },
  ],
  playerStarts: [{ id: 'start-1', x: 1, y: 1, label: 'Ingresso' }],
  fogBase: 'revealed',
  showDoorIcons: false,
  notes: 'Nota legacy',
});

const insertLegacyMap = (testApp: TestApp, campaignId: string): string => {
  const id = uuidv7();
  const now = new Date().toISOString();
  testApp.database.db.insert(maps).values({
    id,
    campaignId,
    name: 'Mappa legacy',
    imageAssetId: ASSET_ID,
    widthPx: 1400,
    heightPx: 1000,
    document: JSON.stringify(legacyDocument()),
    version: 3,
    createdAt: now,
    updatedAt: now,
  }).run();
  return id;
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

const createMap = async (
  app: FastifyInstance,
  campaignId: string,
  imageAssetId?: string,
): Promise<Map> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/maps`,
    payload: {
      name: 'Mappa v2',
      ...(imageAssetId === undefined ? {} : { imageAssetId }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Map>();
};

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

const withLayers = (
  document: MapDocument,
  patch: {
    constraints?: MapLayers[2]['items'];
    elements?: MapLayers[3]['items'];
  },
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [
      background,
      graphics,
      { ...constraints, items: patch.constraints ?? constraints.items },
      { ...elements, items: patch.elements ?? elements.items },
    ],
  };
};

const storeImage = async (testApp: TestApp, width = 100, height = 100): Promise<string> => {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: '#335577' },
  }).png().toBuffer();
  const asset = await storeAsset(testApp.env, testApp.database.db, buffer);
  return asset.id;
};

const idsOf = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe('lettura e salvataggio del documento v2', () => {
  it('restituisce un documento v1 salvato nel DB come v2 con muri, luci, spawn e partenze', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const mapId = insertLegacyMap(testApp, campaignId);

    const response = await testApp.app.inject({ method: 'GET', url: `/api/v1/maps/${mapId}` });
    expect(response.statusCode).toBe(200);
    const map = response.json<Map>();

    expect(map.version).toBe(3);
    // Il campo denormalizzato resta disponibile e coincide col layer background.
    expect(map.imageAssetId).toBe(ASSET_ID);
    expect(map).not.toHaveProperty('terrain');
    expect(map).not.toHaveProperty('spawns');
    expect(map).not.toHaveProperty('playerStarts');
    expect(map).not.toHaveProperty('backgroundTransform');

    const document = documentOf(map);
    expect(document.schemaVersion).toBe(2);
    expect(document.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    const [background, , constraints, elements] = document.layers;
    expect(background.imageAssetId).toBe(ASSET_ID);
    expect(background.imageTransform).toEqual({ x: 12, y: -8, scale: 1.25 });
    expect(idsOf(constraints.items)).toEqual(['wall-1', 'door-1']);
    expect(elements.items.map((item) => item.type)).toEqual(['light', 'spawn', 'start']);
    expect(elements.items.map((item) => item.id))
      .toEqual(['light-1', 'spawn-1', 'start-1']);
    expect(document.ambientLight).toBe('dim');
    expect(document.visionLimitFeet).toBe(60);
    expect(document.notes).toBe('Nota legacy');

    // La lista usa gli stessi layer per i contatori della summary.
    const list = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/maps`,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({
      id: mapId,
      walls: 2,
      lights: 1,
      spawns: 1,
      playerStarts: 1,
    });
    await closeTestApp(testApp);
  });

  it('rifiuta un PUT con documento v1 con 400 validation_error', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);

    const response = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/maps/${map.id}`,
      payload: { version: map.version, document: legacyDocument() },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    await closeTestApp(testApp);
  });

  it('rifiuta un PUT che riferisce un asset inesistente senza modificare la mappa', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);
    expect(map.layers[0].imageAssetId).toBeNull();

    const response = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/maps/${map.id}`,
      payload: {
        version: map.version,
        document: withBackground(documentOf(map), OTHER_ASSET_ID, { x: 0, y: 0, scale: 1 }),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'not_found' } });

    const fetched = await testApp.app.inject({ method: 'GET', url: `/api/v1/maps/${map.id}` });
    const unchanged = fetched.json<Map>();
    expect(unchanged.version).toBe(map.version);
    expect(unchanged.imageAssetId).toBeNull();
    expect(unchanged.layers[0].imageAssetId).toBeNull();
    await closeTestApp(testApp);
  });

  it('accetta un PUT v2 e incrementa la versione', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);
    const document = { ...documentOf(map), name: 'Mappa rinominata', notes: 'nuove note' };

    const saved = await saveMap(testApp.app, map, document);

    expect(saved.version).toBe(map.version + 1);
    expect(saved.name).toBe('Mappa rinominata');
    expect(saved.notes).toBe('nuove note');
    expect(saved.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    await closeTestApp(testApp);
  });

  it('allinea Map.imageAssetId al layer background a ogni salvataggio', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const firstAsset = await storeImage(testApp);
    const secondAsset = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId, firstAsset);
    expect(map.imageAssetId).toBe(firstAsset);

    const withSecond = await saveMap(
      testApp.app,
      map,
      withBackground(documentOf(map), secondAsset, { x: 1, y: 2, scale: 1 }),
    );
    expect(withSecond.imageAssetId).toBe(secondAsset);
    expect(withSecond.layers[0].imageAssetId).toBe(secondAsset);

    const withoutBackground = await saveMap(
      testApp.app,
      withSecond,
      withBackground(documentOf(withSecond), null, { x: 0, y: 0, scale: 1 }),
    );
    expect(withoutBackground.imageAssetId).toBeNull();
    expect(withoutBackground.layers[0].imageAssetId).toBeNull();

    const fetched = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/maps/${map.id}`,
    });
    expect(fetched.json<Map>().imageAssetId).toBeNull();
    await closeTestApp(testApp);
  });
});

describe('scene e duplicati da documento v2', () => {
  it('crea la scena copiando muri, luci e sfondo dai layer', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const assetId = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId, assetId);
    const document = withLayers(
      withBackground(documentOf(map), assetId, { x: 3, y: 4, scale: 0.5 }),
      {
        constraints: [
          { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
          { id: 'door-1', kind: 'door', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, door: 'closed' },
        ],
        elements: [
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
        ],
      },
    );
    const saved = await saveMap(testApp.app, map, document);

    const created = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/scenes/from-map`,
      payload: { mapId: saved.id, playerAssignments: [] },
    });
    expect(created.statusCode).toBe(201);
    const sceneId = created.json<{ sceneId: string }>().sceneId;

    const snapshot = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/scenes/${sceneId}`,
    });
    const body = snapshot.json();
    expect(body.scene).toMatchObject({
      imageAssetId: assetId,
      backgroundTransform: { x: 3, y: 4, scale: 0.5 },
      widthPx: saved.widthPx,
      heightPx: saved.heightPx,
    });
    expect(body.state.terrain.walls.map((wall: { id: string }) => wall.id))
      .toEqual(['wall-1', 'door-1']);
    expect(body.state.terrain.lights.map((light: { id: string }) => light.id))
      .toEqual(['light-1']);
    expect(body.state.backgroundColor).toBe(saved.backgroundColor);
    await closeTestApp(testApp);
  });

  it('duplica la mappa copiando i layer', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const assetId = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId, assetId);
    const document = withLayers(
      withBackground(documentOf(map), assetId, { x: 5, y: 6, scale: 1.5 }),
      {
        constraints: [
          { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
        ],
        elements: [
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
          { id: 'start-1', type: 'start', x: 1, y: 1 },
        ],
      },
    );
    const saved = await saveMap(testApp.app, map, document);

    const duplicated = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/maps/${saved.id}/duplicate`,
      payload: {},
    });
    expect(duplicated.statusCode).toBe(201);
    const copy = duplicated.json<Map>();

    expect(copy.name).toBe('Mappa v2 (copia)');
    expect(copy.version).toBe(1);
    expect(copy.layers[0]).toEqual(saved.layers[0]);
    expect(copy.layers[2]).toEqual(saved.layers[2]);
    expect(copy.layers[3].items.map((item) => item.type))
      .toEqual(saved.layers[3].items.map((item) => item.type));
    expect(copy.layers[3].items.map((item) => item.id))
      .toEqual(saved.layers[3].items.map((item) => item.id));
    await closeTestApp(testApp);
  });

  it('esporta e reimporta la mappa mantenendo il documento v2', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);
    const document = withLayers(documentOf(map), {
      constraints: [
        { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
      ],
      elements: [
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
      ],
    });
    await saveMap(testApp.app, map, document);

    const exported = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/export`,
    });
    expect(exported.statusCode).toBe(200);
    const bundle = exported.json();
    expect(bundle.maps[0].schemaVersion).toBe(2);

    const imported = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/campaigns/import',
      payload: bundle,
    });
    expect(imported.statusCode).toBe(201);
    const importedCampaignId = imported.json<{ campaign: { id: string } }>().campaign.id;

    const list = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${importedCampaignId}/maps`,
    });
    expect(list.json().items).toHaveLength(1);
    const importedMapId = list.json().items[0].id;
    const fetched = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/maps/${importedMapId}`,
    });
    const importedMap = fetched.json<Map>();
    expect(importedMap.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    expect(idsOf(importedMap.layers[2].items)).toEqual(['wall-1']);
    expect(importedMap.layers[3].items.map((item) => item.id)).toEqual(['light-1']);
    await closeTestApp(testApp);
  });
});
