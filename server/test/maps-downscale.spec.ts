import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import {
  mapDocumentSchema,
  type BackgroundLayer,
  type BackgroundTransform,
  type Map,
  type MapDocument,
  type ProgramState,
} from '@dnd-vtt/shared';
import { getAsset } from '../src/db/assets.repository.js';
import { insertProgram } from '../src/db/programs.repository.js';
import { storeAsset } from '../src/assets/service.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign } from './factories.js';

const image = async (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#335577' } }).png().toBuffer();

const createMap = async (
  app: FastifyInstance,
  campaignId: string,
  imageAssetId: string,
): Promise<Map> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/maps`,
    payload: { name: 'Mappa', imageAssetId, widthPx: 1280, heightPx: 720 },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Map>();
};

const backgroundOf = (map: Map): BackgroundLayer => map.layers[0];

const documentFor = (map: Map): MapDocument => {
  const document: Record<string, unknown> = { ...map };
  // `imageAssetId` è denormalizzato sul DTO ma non fa parte del documento v2:
  // il riferimento vive nel layer background.
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

const withBackgroundTransform = (
  document: MapDocument,
  backgroundTransform: BackgroundTransform,
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [
      { ...background, imageTransform: { ...backgroundTransform } },
      graphics,
      constraints,
      elements,
    ],
  };
};

const saveMap = async (
  app: FastifyInstance,
  map: Map,
  backgroundTransform: BackgroundTransform,
): Promise<Map> => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/v1/maps/${map.id}`,
    payload: {
      version: map.version,
      document: withBackgroundTransform(documentFor(map), backgroundTransform),
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json<Map>();
};

const setup = async (width: number, height: number): Promise<{
  testApp: TestApp;
  campaignId: string;
  original: Awaited<ReturnType<typeof storeAsset>>;
}> => {
  const testApp = await createTestApp();
  const campaignId = await createCampaign(testApp.app);
  const original = await storeAsset(testApp.env, testApp.database.db, await image(width, height));
  return { testApp, campaignId, original };
};

describe('immutabilità dimensioni mappa', () => {
  const putDocument = async (
    app: FastifyInstance,
    map: Map,
    changes: Record<string, unknown>,
  ) => app.inject({
    method: 'PUT',
    url: `/api/v1/maps/${map.id}`,
    payload: {
      version: map.version,
      document: { ...documentFor(map), ...changes },
    },
  });

  it('rifiuta il cambio di widthPx/heightPx con 400 validation_error', async () => {
    const { testApp, campaignId, original } = await setup(640, 360);
    const map = await createMap(testApp.app, campaignId, original.id);
    const response = await putDocument(testApp.app, map, {
      widthPx: map.widthPx + 1,
      heightPx: map.heightPx + 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'validation_error',
        details: {
          expected: { widthPx: map.widthPx, heightPx: map.heightPx },
          received: { widthPx: map.widthPx + 1, heightPx: map.heightPx + 1 },
        },
      },
    });

    const unchanged = await testApp.app.inject({ method: 'GET', url: `/api/v1/maps/${map.id}` });
    expect(unchanged.json<Map>()).toMatchObject({
      widthPx: map.widthPx,
      heightPx: map.heightPx,
      version: map.version,
    });
    await closeTestApp(testApp);
  });

  it('accetta il salvataggio con le stesse dimensioni', async () => {
    const { testApp, campaignId, original } = await setup(640, 360);
    const map = await createMap(testApp.app, campaignId, original.id);
    const response = await putDocument(testApp.app, map, {
      name: 'Mappa rinominata',
      widthPx: map.widthPx,
      heightPx: map.heightPx,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Map>()).toMatchObject({
      name: 'Mappa rinominata',
      widthPx: map.widthPx,
      heightPx: map.heightPx,
    });
    await closeTestApp(testApp);
  });
});

describe('downscale sfondo al salvataggio mappa', () => {
  it.each([0.5, 1, 2])('riduce a f di scena e preserva la resa con scale=%s', async (scale) => {
    const { testApp, campaignId, original } = await setup(1920, 1280);
    const map = await createMap(testApp.app, campaignId, original.id);
    const originalSize = (await stat(
      join(testApp.env.uploadDir, 'webp', `${original.hash}.webp`),
    )).size;
    const saved = await saveMap(testApp.app, map, { x: 0, y: 0, scale });

    expect(saved.widthPx).toBe(1280);
    expect(saved.heightPx).toBe(720);
    expect(saved.imageAssetId).not.toBe(original.id);
    if (saved.imageAssetId === null) {
      throw new Error('Asset derivato non trovato');
    }
    const derived = getAsset(testApp.database.db, saved.imageAssetId);
    if (derived === null) {
      throw new Error('Asset derivato non trovato');
    }
    const f = Math.min(1, 1280 / 1920, 720 / 1280);
    expect(derived.width).toBe(Math.round(1920 * f));
    expect(derived.height).toBe(Math.round(1280 * f));
    // Il downscale aggiorna il layer background e il campo denormalizzato.
    expect(backgroundOf(saved).imageAssetId).toBe(saved.imageAssetId);
    expect(backgroundOf(saved).imageTransform.scale).toBeCloseTo(scale / f, 10);

    const derivedSize = (await stat(
      join(testApp.env.uploadDir, 'webp', `${derived.hash}.webp`),
    )).size;
    expect(derivedSize).toBeLessThan(originalSize);
    await closeTestApp(testApp);
  });

  it('non tocca un asset già più piccolo della scena', async () => {
    const { testApp, campaignId, original } = await setup(640, 360);
    const map = await createMap(testApp.app, campaignId, original.id);
    const saved = await saveMap(testApp.app, map, { x: 0, y: 0, scale: 2 });

    expect(saved.imageAssetId).toBe(original.id);
    expect(backgroundOf(saved).imageAssetId).toBe(original.id);
    expect(backgroundOf(saved).imageTransform.scale).toBe(2);
    expect(saved.widthPx).toBe(1280);
    expect(saved.heightPx).toBe(720);
    await closeTestApp(testApp);
  });

  it('crea un asset derivato senza toccare quello condiviso', async () => {
    const { testApp, campaignId, original } = await setup(1920, 1280);
    const first = await createMap(testApp.app, campaignId, original.id);
    const second = await createMap(testApp.app, campaignId, original.id);
    const savedFirst = await saveMap(testApp.app, first, { x: 0, y: 0, scale: 1 });

    expect(savedFirst.imageAssetId).not.toBe(original.id);
    const unchanged = await testApp.app.inject({ method: 'GET', url: `/api/v1/maps/${second.id}` });
    expect(unchanged.json<Map>().imageAssetId).toBe(original.id);
    expect(getAsset(testApp.database.db, original.id)).not.toBeNull();
    expect(existsSync(join(testApp.env.uploadDir, 'webp', `${original.hash}.webp`))).toBe(true);

    // Il secondo salvataggio rende l'asset originale non più referenziato: il GC lo raccoglie.
    const savedSecond = await saveMap(testApp.app, second, { x: 0, y: 0, scale: 1 });
    expect(savedSecond.imageAssetId).toBe(savedFirst.imageAssetId);
    expect(getAsset(testApp.database.db, original.id)).toBeNull();
    expect(existsSync(join(testApp.env.uploadDir, 'webp', `${original.hash}.webp`))).toBe(false);
    await closeTestApp(testApp);
  });

  it('non elimina un asset referenziato da un layer immagine del program', async () => {
    const { testApp, campaignId, original } = await setup(1920, 1280);
    const state: ProgramState = {
      base: {
        id: 'base',
        content: { type: 'image', assetId: original.id, fit: 'contain' },
        frame: { x: 0, y: 0, width: 1, height: 1 },
        opacity: 1,
        interactive: true,
      },
      overlays: [],
      hud: { dice: true, initiative: true, pointer: false },
      blackout: false,
      background: '#000000',
      updatedAt: new Date().toISOString(),
    };
    insertProgram(testApp.database.db, campaignId, state);
    const map = await createMap(testApp.app, campaignId, original.id);
    const saved = await saveMap(testApp.app, map, { x: 0, y: 0, scale: 1 });

    expect(saved.imageAssetId).not.toBe(original.id);
    expect(getAsset(testApp.database.db, original.id)).not.toBeNull();
    expect(existsSync(join(testApp.env.uploadDir, 'webp', `${original.hash}.webp`))).toBe(true);
    await closeTestApp(testApp);
  });

  it('elimina l\'asset esclusivo e i file derivati dopo il downscale', async () => {
    const testApp = await createTestApp({ KEEP_ORIGINALS: 'true' });
    const campaignId = await createCampaign(testApp.app);
    const original = await storeAsset(
      testApp.env,
      testApp.database.db,
      await image(2600, 1800),
    );
    const map = await createMap(testApp.app, campaignId, original.id);
    const saved = await saveMap(testApp.app, map, { x: 0, y: 0, scale: 1 });

    expect(saved.imageAssetId).not.toBe(original.id);
    expect(getAsset(testApp.database.db, original.id)).toBeNull();

    const uploadDir = testApp.env.uploadDir;
    expect(existsSync(join(uploadDir, 'webp', `${original.hash}.webp`))).toBe(false);
    expect(existsSync(join(uploadDir, 'previews', `${original.hash}.webp`))).toBe(false);
    expect(existsSync(join(uploadDir, 'thumbs', `${original.hash}.webp`))).toBe(false);
    expect(existsSync(join(uploadDir, 'tiles', original.hash))).toBe(false);
    expect(existsSync(join(uploadDir, 'originals', `${original.hash}.png`))).toBe(false);

    if (saved.imageAssetId === null) {
      throw new Error('Asset derivato non trovato');
    }
    const derived = getAsset(testApp.database.db, saved.imageAssetId);
    if (derived === null) {
      throw new Error('Asset derivato non trovato');
    }
    expect(existsSync(join(uploadDir, 'webp', `${derived.hash}.webp`))).toBe(true);

    const fetched = await testApp.app.inject({ method: 'GET', url: `/api/v1/maps/${map.id}` });
    const fetchedMap = fetched.json<Map>();
    expect(fetchedMap.imageAssetId).toBe(saved.imageAssetId);
    expect(backgroundOf(fetchedMap).imageAssetId).toBe(saved.imageAssetId);
    await closeTestApp(testApp);
  });
});
