import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import {
  emptyMapDocumentV2,
  mapGraphicSchema,
  type Asset,
  type Map,
  type MapDocument,
} from '@dnd-vtt/shared';
import { countAssetReferences } from '../src/db/assets.repository.js';
import { getMap, insertMap } from '../src/db/maps.repository.js';
import { maps } from '../src/db/schema.js';
import { storeAsset } from '../src/assets/service.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign } from './factories.js';

const storeImage = async (testApp: TestApp, background = '#335577'): Promise<Asset> => {
  const buffer = await sharp({
    create: { width: 320, height: 240, channels: 3, background },
  }).png().toBuffer();
  return storeAsset(testApp.env, testApp.database.db, buffer);
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
      name: 'Mappa con asset',
      ...(imageAssetId === undefined ? {} : { imageAssetId }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Map>();
};

const fetchMap = async (
  app: FastifyInstance,
  id: string,
): Promise<Record<string, unknown>> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/maps/${id}` });
  expect(response.statusCode).toBe(200);
  return response.json<Record<string, unknown>>();
};

const listMaps = async (
  app: FastifyInstance,
  campaignId: string,
): Promise<Record<string, unknown>[]> => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/campaigns/${campaignId}/maps`,
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ items: Record<string, unknown>[] }>().items;
};

/**
 * Scrive direttamente le colonne derivate per isolare persistenza, mapper e
 * summary dall'API. POST e PUT espongono ormai `thumbAssetId`/`compositeAssetId`
 * (vedi `maps-derived-put.spec.ts`), quindi qui non serve passarci.
 * `undefined` lascia la colonna invariata, `null` la azzera.
 */
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

const graphicsDocument = (
  name: string,
  backgroundAssetId: string | null,
  graphicAssetId: string,
): MapDocument => {
  const base = emptyMapDocumentV2(name, backgroundAssetId, 1280, 720);
  const [background, graphics, constraints, elements] = base.layers;
  return {
    ...base,
    layers: [
      background,
      {
        ...graphics,
        items: [
          mapGraphicSchema.parse({ id: 'graphic-1', assetId: graphicAssetId, x: 10, y: 20 }),
        ],
      },
      constraints,
      elements,
    ],
  };
};

const legacyDocument = (imageAssetId: string): Record<string, unknown> => ({
  name: 'Mappa legacy',
  imageAssetId,
  backgroundTransform: { x: 0, y: 0, scale: 1 },
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
    walls: [],
    lights: [],
  },
  spawns: [],
  playerStarts: [],
  fogBase: 'revealed',
  showDoorIcons: false,
  notes: '',
});

const insertLegacyMap = (
  testApp: TestApp,
  campaignId: string,
  imageAssetId: string,
): string => {
  const id = uuidv7();
  const now = new Date().toISOString();
  // La colonna denormalizzata resta NULL: l'unico riferimento vive nel documento
  // v1, che va migrato in lettura.
  testApp.database.db.insert(maps).values({
    id,
    campaignId,
    name: 'Mappa legacy',
    imageAssetId: null,
    widthPx: 1400,
    heightPx: 1000,
    document: JSON.stringify(legacyDocument(imageAssetId)),
    version: 1,
    createdAt: now,
    updatedAt: now,
  }).run();
  return id;
};

describe('persistenza thumbnail e composito', () => {
  it('espone thumbAssetId e compositeAssetId null alla creazione e nel GET', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);

    expect(map).toHaveProperty('thumbAssetId', null);
    expect(map).toHaveProperty('compositeAssetId', null);

    const fetched = await fetchMap(testApp.app, map.id);
    expect(fetched).toHaveProperty('thumbAssetId', null);
    expect(fetched).toHaveProperty('compositeAssetId', null);
    await closeTestApp(testApp);
  });

  it('persiste thumb_asset_id e composite_asset_id e li rilegge dal repository', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp, '#aa2211');
    const composite = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId);

    setMapAssetColumns(testApp, map.id, {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });

    const fetched = await fetchMap(testApp.app, map.id);
    expect(fetched).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });

    const stored = getMap(testApp.database.db, map.id);
    expect(stored).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });
    await closeTestApp(testApp);
  });

  it('insertMap persiste i derivati passati come quarto argomento', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp, '#aa2211');
    const composite = await storeImage(testApp, '#22aa11');
    const document = emptyMapDocumentV2('Mappa con derivati', null, 1280, 720);

    const inserted = insertMap(testApp.database.db, campaignId, document, {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });

    expect(inserted).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });
    expect(getMap(testApp.database.db, inserted.id)).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });
    await closeTestApp(testApp);
  });

  it('preserva thumb e composito su PUT con documento v2 senza campi derivati', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, '#335577');
    const thumb = await storeImage(testApp, '#aa2211');
    const composite = await storeImage(testApp, '#22aa11');
    const map = await createMap(testApp.app, campaignId, background.id);
    setMapAssetColumns(testApp, map.id, {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });

    const response = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/maps/${map.id}`,
      payload: {
        version: map.version,
        // Documento v2 puro: i derivati non sono campi del documento e non
        // devono essere azzerati dall'aggiornamento.
        document: emptyMapDocumentV2('Mappa aggiornata', background.id, map.widthPx, map.heightPx),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<Map>()).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
      version: map.version + 1,
    });

    const fetched = await fetchMap(testApp.app, map.id);
    expect(fetched).toMatchObject({
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
      version: map.version + 1,
    });
    await closeTestApp(testApp);
  });

  it('aggiunge le due colonne nullable senza invalidare le mappe preesistenti', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const columns = testApp.database.sqlite.pragma('table_info(maps)') as Array<{
      name: string;
      notnull: number;
    }>;

    for (const name of ['thumb_asset_id', 'composite_asset_id']) {
      const column = columns.find((entry) => entry.name === name);
      expect(column, `colonna ${name} mancante`).toBeDefined();
      expect(column?.notnull, `colonna ${name} deve ammettere NULL`).toBe(0);
    }

    // Riga scritta senza le nuove colonne: deve restare valida e leggersi NULL.
    const id = uuidv7();
    const now = new Date().toISOString();
    testApp.database.sqlite
      .prepare(`
        INSERT INTO maps
          (id, campaign_id, name, width_px, height_px, document, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        campaignId,
        'Mappa preesistente',
        1280,
        720,
        JSON.stringify(emptyMapDocumentV2('Mappa preesistente', null, 1280, 720)),
        1,
        now,
        now,
      );

    const row = testApp.database.sqlite
      .prepare(`
        SELECT thumb_asset_id AS thumbAssetId, composite_asset_id AS compositeAssetId
        FROM maps WHERE id = ?
      `)
      .get(id);
    expect(row).toEqual({ thumbAssetId: null, compositeAssetId: null });
    await closeTestApp(testApp);
  });
});

describe('thumbUrl della lista mappe', () => {
  it('usa la thumb di thumb_asset_id anche se lo sfondo ha un\'altra thumb', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, '#335577');
    const thumb = await storeImage(testApp, '#aa2211');
    const map = await createMap(testApp.app, campaignId, background.id);
    setMapAssetColumns(testApp, map.id, { thumbAssetId: thumb.id });

    const [summary] = await listMaps(testApp.app, campaignId);
    expect(summary).toMatchObject({
      id: map.id,
      imageAssetId: background.id,
      imageUrl: background.url,
      thumbUrl: thumb.thumbUrl,
    });
    expect(summary?.thumbUrl).not.toBe(background.thumbUrl);
    await closeTestApp(testApp);
  });

  it('ripiega sulla thumb dello sfondo quando thumb_asset_id è null', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, '#335577');
    const map = await createMap(testApp.app, campaignId, background.id);
    setMapAssetColumns(testApp, map.id, { thumbAssetId: null });

    const [summary] = await listMaps(testApp.app, campaignId);
    expect(summary).toMatchObject({
      id: map.id,
      imageAssetId: background.id,
      thumbUrl: background.thumbUrl,
    });
    await closeTestApp(testApp);
  });

  it('restituisce thumbUrl null senza sfondo e senza thumb', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);

    const [summary] = await listMaps(testApp.app, campaignId);
    expect(summary).toMatchObject({
      id: map.id,
      imageAssetId: null,
      imageUrl: null,
      thumbUrl: null,
    });
    await closeTestApp(testApp);
  });

  it('ripiega deterministicamente sulla thumb dello sfondo se l\'asset thumb è mancante', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, '#335577');
    const map = await createMap(testApp.app, campaignId, background.id);
    setMapAssetColumns(testApp, map.id, { thumbAssetId: uuidv7() });

    const [summary] = await listMaps(testApp.app, campaignId);
    // L'id thumb punta a un asset rimosso: la summary resta valida e usa la
    // thumb dello sfondo, senza esporre URL rotti.
    expect(summary).toMatchObject({
      id: map.id,
      imageAssetId: background.id,
      thumbUrl: background.thumbUrl,
    });
    await closeTestApp(testApp);
  });

  it('non fa crashare GET /maps se l\'asset di sfondo non esiste più', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, '#335577');
    const map = await createMap(testApp.app, campaignId, background.id);
    testApp.database.sqlite.prepare('DELETE FROM assets WHERE id = ?').run(background.id);

    const [summary] = await listMaps(testApp.app, campaignId);
    expect(summary).toMatchObject({
      id: map.id,
      imageAssetId: background.id,
      imageUrl: null,
      thumbUrl: null,
    });
    await closeTestApp(testApp);
  });
});

describe('conteggio riferimenti asset', () => {
  it('conta un asset referenziato solo come thumb_asset_id', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, { thumbAssetId: thumb.id });

    expect(countAssetReferences(testApp.database.db, thumb.id)).toBe(1);
    await closeTestApp(testApp);
  });

  it('conta un asset referenziato solo come composite_asset_id', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const composite = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, { compositeAssetId: composite.id });

    expect(countAssetReferences(testApp.database.db, composite.id)).toBe(1);
    await closeTestApp(testApp);
  });

  it('conta un asset usato solo come grafica del documento v2', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const graphic = await storeImage(testApp);
    insertMap(
      testApp.database.db,
      campaignId,
      graphicsDocument('Mappa con grafica', null, graphic.id),
    );

    expect(countAssetReferences(testApp.database.db, graphic.id)).toBe(1);
    await closeTestApp(testApp);
  });

  it('conta una sola volta un asset usato sia come sfondo sia come thumb', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const shared = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId, shared.id);
    setMapAssetColumns(testApp, map.id, { thumbAssetId: shared.id });

    // Due riferimenti sulla stessa mappa non devono produrre un doppio conteggio.
    expect(countAssetReferences(testApp.database.db, shared.id)).toBe(1);
    await closeTestApp(testApp);
  });

  it('conta lo sfondo di un documento v1 solo dopo la migrazione in lettura', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp);
    insertLegacyMap(testApp, campaignId, background.id);

    expect(countAssetReferences(testApp.database.db, background.id)).toBe(1);
    await closeTestApp(testApp);
  });

  it('non conta un asset non referenziato', async () => {
    const testApp = await createTestApp();
    const orphan = await storeImage(testApp);
    await createCampaign(testApp.app);

    expect(countAssetReferences(testApp.database.db, orphan.id)).toBe(0);
    await closeTestApp(testApp);
  });
});

describe('protezione degli asset referenziati da thumb e composito', () => {
  it('blocca la cancellazione di un asset usato solo come composito e la sblocca dopo', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const composite = await storeImage(testApp);
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, { compositeAssetId: composite.id });

    const blocked = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${composite.id}`,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: 'asset_in_use' } });

    setMapAssetColumns(testApp, map.id, { compositeAssetId: null });
    const removed = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${composite.id}`,
    });
    expect(removed.statusCode).toBe(204);
    await closeTestApp(testApp);
  });

  it('blocca la cancellazione di un asset usato solo da una grafica e la sblocca dopo', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const graphic = await storeImage(testApp);
    const map = insertMap(
      testApp.database.db,
      campaignId,
      graphicsDocument('Mappa con grafica', null, graphic.id),
    );

    const blocked = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${graphic.id}`,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: 'asset_in_use' } });

    const saved = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/maps/${map.id}`,
      payload: {
        version: map.version,
        document: emptyMapDocumentV2(map.name, null, map.widthPx, map.heightPx),
      },
    });
    expect(saved.statusCode).toBe(200);

    const removed = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/assets/${graphic.id}`,
    });
    expect(removed.statusCode).toBe(204);
    await closeTestApp(testApp);
  });
});
