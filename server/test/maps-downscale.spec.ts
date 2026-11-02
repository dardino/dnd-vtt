import { describe, expect, it } from 'vitest';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { mapDocumentSchema, type BackgroundTransform, type Map } from '@dnd-vtt/shared';
import { getAsset } from '../src/db/assets.repository.js';
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

const documentFor = (map: Map) => {
  const document: Record<string, unknown> = { ...map };
  for (const key of ['id', 'campaignId', 'version', 'createdAt', 'updatedAt']) {
    delete document[key];
  }
  return mapDocumentSchema.parse(document);
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
      document: { ...documentFor(map), backgroundTransform },
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

describe('downscale sfondo al salvataggio mappa', () => {
  it.each([0.5, 1, 2])('riduce a f di scena e preserva la resa con scale=%s', async (scale) => {
    const { testApp, campaignId, original } = await setup(1920, 1280);
    const map = await createMap(testApp.app, campaignId, original.id);
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
    expect(saved.backgroundTransform.scale).toBeCloseTo(scale / f, 10);

    const fileSize = async (hash: string): Promise<number> =>
      (await stat(join(testApp.env.uploadDir, 'webp', `${hash}.webp`))).size;
    expect(await fileSize(derived.hash)).toBeLessThan(await fileSize(original.hash));
    await closeTestApp(testApp);
  });

  it('non tocca un asset già più piccolo della scena', async () => {
    const { testApp, campaignId, original } = await setup(640, 360);
    const map = await createMap(testApp.app, campaignId, original.id);
    const saved = await saveMap(testApp.app, map, { x: 0, y: 0, scale: 2 });

    expect(saved.imageAssetId).toBe(original.id);
    expect(saved.backgroundTransform.scale).toBe(2);
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

    const savedSecond = await saveMap(testApp.app, second, { x: 0, y: 0, scale: 1 });
    expect(savedSecond.imageAssetId).toBe(savedFirst.imageAssetId);
    await closeTestApp(testApp);
  });
});
