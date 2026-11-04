import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { mapDocumentSchema, type Asset, type Map, type MapDocument } from '@dnd-vtt/shared';
import { getAsset } from '../src/db/assets.repository.js';
import { storeAsset } from '../src/assets/service.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign } from './factories.js';

const storeImage = async (testApp: TestApp, background: string): Promise<Asset> => {
  const buffer = await sharp({
    create: { width: 320, height: 240, channels: 3, background },
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

const withBackground = (
  document: MapDocument,
  imageAssetId: string | null,
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [{ ...background, imageAssetId }, graphics, constraints, elements],
  };
};

/** File sorgente WebP scritto da `storeAsset`: la raccolta deve rimuoverlo. */
const webpFileOf = (testApp: TestApp, asset: Asset): string =>
  join(testApp.env.uploadDir, 'webp', `${asset.hash}.webp`);

const createMap = async (
  app: FastifyInstance,
  campaignId: string,
  imageAssetId?: string,
): Promise<Map> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/maps`,
    payload: {
      name: 'Mappa con derivati',
      ...(imageAssetId === undefined ? {} : { imageAssetId }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Map>();
};

const fetchMap = async (app: FastifyInstance, id: string): Promise<Map> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/maps/${id}` });
  expect(response.statusCode).toBe(200);
  return response.json<Map>();
};

const setMapAssetColumns = (
  testApp: TestApp,
  mapId: string,
  patch: { thumbAssetId?: string | null; compositeAssetId?: string | null },
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

interface DerivedAssets {
  thumbAssetId?: string | null;
  compositeAssetId?: string | null;
}

const putMap = (
  app: FastifyInstance,
  map: Map,
  document: MapDocument,
  derived: DerivedAssets = {},
) => {
  const payload: Record<string, unknown> = { version: map.version, document };
  if (derived.thumbAssetId !== undefined) {
    payload.thumbAssetId = derived.thumbAssetId;
  }
  if (derived.compositeAssetId !== undefined) {
    payload.compositeAssetId = derived.compositeAssetId;
  }
  return app.inject({ method: 'PUT', url: `/api/v1/maps/${map.id}`, payload });
};

const saveWithDerived = async (
  app: FastifyInstance,
  map: Map,
  document: MapDocument,
  derived: DerivedAssets = {},
): Promise<Map> => {
  const response = await putMap(app, map, document, derived);
  expect(response.statusCode).toBe(200);
  return response.json<Map>();
};

describe('PUT con asset derivati', () => {
  it('salva thumb e composite esistenti e il GET li espone', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp, '#aa2211');
    const composite = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId);

    const response = await putMap(testApp.app, map, documentOf(map), {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<Map>()).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
      version: map.version + 1,
    });

    expect(await fetchMap(testApp.app, map.id)).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
      version: map.version + 1,
    });
    await closeTestApp(testApp);
  });

  it('conserva i derivati precedenti quando i campi sono assenti', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp, '#aa2211');
    const composite = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });

    const saved = await saveWithDerived(testApp.app, map, {
      ...documentOf(map),
      name: 'Mappa aggiornata',
    });

    expect(saved).toMatchObject({
      name: 'Mappa aggiornata',
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
      version: map.version + 1,
    });
    expect(await fetchMap(testApp.app, map.id)).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });
    await closeTestApp(testApp);
  });

  it('azzera i derivati quando i campi sono null', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp, '#aa2211');
    const composite = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });

    const saved = await saveWithDerived(testApp.app, map, documentOf(map), {
      thumbAssetId: null,
      compositeAssetId: null,
    });

    expect(saved).toMatchObject({ thumbAssetId: null, compositeAssetId: null });
    expect(await fetchMap(testApp.app, map.id)).toMatchObject({
      thumbAssetId: null,
      compositeAssetId: null,
    });
    await closeTestApp(testApp);
  });

  it.each(['thumbAssetId', 'compositeAssetId'] as const)(
    'rifiuta un %s inesistente senza modificare mappa, versione e derivati',
    async (field) => {
      const testApp = await createTestApp();
      const campaignId = await createCampaign(testApp.app);
      const previousThumb = await storeImage(testApp, '#aa2211');
      const previousComposite = await storeImage(testApp, '#22aa11');
      const map = await createMap(testApp.app, campaignId);
      setMapAssetColumns(testApp, map.id, {
        thumbAssetId: previousThumb.id,
        compositeAssetId: previousComposite.id,
      });

      const response = await putMap(
        testApp.app,
        map,
        { ...documentOf(map), name: 'Non deve essere applicata' },
        { [field]: uuidv7() },
      );

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: 'not_found' } });

      const unchanged = await fetchMap(testApp.app, map.id);
      expect(unchanged).toMatchObject({
        name: map.name,
        version: map.version,
        thumbAssetId: previousThumb.id,
        compositeAssetId: previousComposite.id,
      });
      expect(unchanged.layers[0]).toEqual(map.layers[0]);
      await closeTestApp(testApp);
    },
  );

  it('applica thumb valida e composite null nello stesso aggiornamento', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const oldThumb = await storeImage(testApp, '#aa2211');
    const oldComposite = await storeImage(testApp, '#22aa11');
    const newThumb = await storeImage(testApp, '#1122aa');
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, {
      thumbAssetId: oldThumb.id,
      compositeAssetId: oldComposite.id,
    });

    const saved = await saveWithDerived(testApp.app, map, documentOf(map), {
      thumbAssetId: newThumb.id,
      compositeAssetId: null,
    });

    expect(saved).toMatchObject({
      thumbAssetId: newThumb.id,
      compositeAssetId: null,
    });
    await closeTestApp(testApp);
  });

  it('sostituisce la thumb e cancella la vecchia ormai non referenziata', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const oldThumb = await storeImage(testApp, '#aa2211');
    const newThumb = await storeImage(testApp, '#1122aa');
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, { thumbAssetId: oldThumb.id });

    const saved = await saveWithDerived(testApp.app, map, documentOf(map), {
      thumbAssetId: newThumb.id,
    });

    expect(saved.thumbAssetId).toBe(newThumb.id);
    expect(getAsset(testApp.database.db, newThumb.id)).not.toBeNull();
    expect(getAsset(testApp.database.db, oldThumb.id)).toBeNull();
    await closeTestApp(testApp);
  });

  it('non cancella un composito condiviso quando una sola mappa lo sostituisce', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const shared = await storeImage(testApp, '#22aa11');
    const replacement = await storeImage(testApp, '#115522');
    const first = await createMap(testApp.app, campaignId);
    const second = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, first.id, { compositeAssetId: shared.id });
    setMapAssetColumns(testApp, second.id, { compositeAssetId: shared.id });

    const savedFirst = await saveWithDerived(testApp.app, first, documentOf(first), {
      compositeAssetId: replacement.id,
    });
    expect(savedFirst.compositeAssetId).toBe(replacement.id);
    expect(getAsset(testApp.database.db, shared.id)).not.toBeNull();
    expect(await fetchMap(testApp.app, second.id)).toMatchObject({
      compositeAssetId: shared.id,
    });

    // Solo quando anche l'ultima mappa smette di referenziarlo il derivato
    // sostituito diventa raccoglibile.
    const savedSecond = await saveWithDerived(testApp.app, second, documentOf(second), {
      compositeAssetId: replacement.id,
    });
    expect(savedSecond.compositeAssetId).toBe(replacement.id);
    expect(getAsset(testApp.database.db, shared.id)).toBeNull();
    await closeTestApp(testApp);
  });
});

describe('raccolta del vecchio sfondo', () => {
  it('sostituisce lo sfondo e cancella il vecchio asset e il suo file', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const oldBackground = await storeImage(testApp, '#aa2211');
    const newBackground = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId, oldBackground.id);
    expect(existsSync(webpFileOf(testApp, oldBackground))).toBe(true);

    const saved = await saveWithDerived(
      testApp.app,
      map,
      withBackground(documentOf(map), newBackground.id),
    );

    expect(saved.layers[0].imageAssetId).toBe(newBackground.id);
    expect(getAsset(testApp.database.db, newBackground.id)).not.toBeNull();
    expect(getAsset(testApp.database.db, oldBackground.id)).toBeNull();
    expect(existsSync(webpFileOf(testApp, oldBackground))).toBe(false);
    await closeTestApp(testApp);
  });

  it('azzera lo sfondo e cancella il vecchio asset e il suo file', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const oldBackground = await storeImage(testApp, '#aa2211');
    const map = await createMap(testApp.app, campaignId, oldBackground.id);

    const saved = await saveWithDerived(
      testApp.app,
      map,
      withBackground(documentOf(map), null),
    );

    expect(saved.layers[0].imageAssetId).toBeNull();
    expect(getAsset(testApp.database.db, oldBackground.id)).toBeNull();
    expect(existsSync(webpFileOf(testApp, oldBackground))).toBe(false);
    await closeTestApp(testApp);
  });

  it('non cancella lo sfondo ancora usato da un\'altra mappa', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const shared = await storeImage(testApp, '#aa2211');
    const replacement = await storeImage(testApp, '#22aa11');
    const first = await createMap(testApp.app, campaignId, shared.id);
    const second = await createMap(testApp.app, campaignId, shared.id);

    const saved = await saveWithDerived(
      testApp.app,
      first,
      withBackground(documentOf(first), replacement.id),
    );

    expect(saved.layers[0].imageAssetId).toBe(replacement.id);
    expect(getAsset(testApp.database.db, shared.id)).not.toBeNull();
    expect(existsSync(webpFileOf(testApp, shared))).toBe(true);
    const untouched = await fetchMap(testApp.app, second.id);
    expect(untouched.layers[0].imageAssetId).toBe(shared.id);
    await closeTestApp(testApp);
  });

  it('non cancella lo sfondo ancora usato da una scena', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const shared = await storeImage(testApp, '#aa2211');
    const replacement = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId, shared.id);

    const sceneResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/scenes/from-map`,
      payload: { mapId: map.id, playerAssignments: [] },
    });
    expect(sceneResponse.statusCode).toBe(201);

    const saved = await saveWithDerived(
      testApp.app,
      map,
      withBackground(documentOf(map), replacement.id),
    );

    expect(saved.layers[0].imageAssetId).toBe(replacement.id);
    expect(getAsset(testApp.database.db, shared.id)).not.toBeNull();
    expect(existsSync(webpFileOf(testApp, shared))).toBe(true);
    await closeTestApp(testApp);
  });
});
