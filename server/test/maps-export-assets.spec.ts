import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import {
  isImageGraphic,
  mapDocumentSchema,
  mapGraphicSchema,
  type Asset,
  type Map,
  type MapDocument,
} from '@dnd-vtt/shared';
import { storeAsset } from '../src/assets/service.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign } from './factories.js';
import { legacyBundleMap } from './maps-legacy-fixture.js';

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

const createMap = async (
  app: FastifyInstance,
  campaignId: string,
  imageAssetId?: string,
): Promise<Map> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/maps`,
    payload: {
      name: 'Mappa da esportare',
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

const withGraphics = (document: MapDocument, assetId: string): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [
      background,
      {
        ...graphics,
        items: [mapGraphicSchema.parse({ id: 'graphic-1', assetId, x: 10, y: 20 })],
      },
      constraints,
      elements,
    ],
  };
};

const withGraphicItems = (
  document: MapDocument,
  items: MapDocument['layers'][1]['items'],
): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [background, { ...graphics, items }, constraints, elements],
  };
};

const polygonGraphic = (): MapDocument['layers'][1]['items'][number] => mapGraphicSchema.parse({
  kind: 'polygon',
  id: 'polygon-1',
  points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 2,
});

const textGraphic = (): MapDocument['layers'][1]['items'][number] => mapGraphicSchema.parse({
  kind: 'text',
  id: 'text-1',
  text: 'Sala del trono',
  fontFamily: 'serif',
  fontSize: 32,
  color: '#ffcc80',
  x: 15,
  y: 25,
  opacity: 0.8,
  z: 3,
});

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

const expectAssetExists = async (app: FastifyInstance, assetId: string): Promise<void> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/assets/${assetId}` });
  expect(response.statusCode, `asset ${assetId} mancante`).toBe(200);
};

const deleteAssetRow = (testApp: TestApp, assetId: string): void => {
  testApp.database.sqlite.prepare('DELETE FROM assets WHERE id = ?').run(assetId);
};

/**
 * Nessun id appartenente al bundle di origine deve sopravvivere nella mappa
 * importata: un riferimento non rimappato sarebbe dangling nel nuovo database.
 */
const expectNoSourceReference = (map: Map, ids: readonly string[]): void => {
  const serialized = JSON.stringify(map);
  for (const id of ids) {
    expect(serialized, `riferimento residuo al vecchio id ${id}`).not.toContain(id);
  }
};

describe('export e import con grafica e loot', () => {
  const exportCampaign = async (app: FastifyInstance, campaignId: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/export`,
    });
    expect(response.statusCode).toBe(200);
    return response.json<{
      maps: Array<{ id: string }>;
      assets: Array<{ id: string }>;
    }>();
  };

  const importCampaign = async (
    app: FastifyInstance,
    bundle: object,
  ): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns/import',
      payload: bundle,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ campaign: { id: string } }>().campaign.id;
  };

  const onlyMapOfCampaign = async (
    app: FastifyInstance,
    campaignId: string,
  ): Promise<Map> => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/maps`,
    });
    expect(response.statusCode).toBe(200);
    const items = response.json<{ items: Array<{ id: string }> }>().items;
    expect(items).toHaveLength(1);
    return fetchMap(app, items[0]!.id);
  };

  it('include gli asset di sfondo e grafica e li rimappa all\'import', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 320, 240, '#335577');
    const graphic = await storeImage(testApp, 64, 64, '#aa2211');
    const map = await createMap(testApp.app, campaignId, background.id);
    const document = withElements(
      withGraphics(documentOf(map), graphic.id),
      [
        {
          id: 'loot-1',
          type: 'loot',
          itemId: 'potion-of-healing',
          x: 4,
          y: 5,
          quantity: 3,
          visible: false,
        },
      ],
    );
    await saveMap(testApp.app, map, document);

    const bundle = await exportCampaign(testApp.app, campaignId);
    const exportedIds = bundle.assets.map((asset) => asset.id);
    expect(exportedIds).toContain(background.id);
    expect(exportedIds).toContain(graphic.id);

    const importedCampaignId = await importCampaign(testApp.app, bundle);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);

    const importedBackgroundId = imported.layers[0].imageAssetId;
    const importedGraphic = imported.layers[1].items[0];
    if (importedGraphic === undefined || !isImageGraphic(importedGraphic)) {
      throw new Error('Grafica importata mancante');
    }
    const importedGraphicId = importedGraphic.assetId;
    expect(importedBackgroundId).not.toBe(background.id);
    expect(importedGraphicId).not.toBe(graphic.id);
    if (importedBackgroundId === null) {
      throw new Error('Riferimenti importati mancanti');
    }
    await expectAssetExists(testApp.app, importedBackgroundId);
    await expectAssetExists(testApp.app, importedGraphicId);
    expect(imported.layers[3].items).toHaveLength(1);
    expect(imported.layers[3].items[0]).toMatchObject({
      id: 'loot-1',
      type: 'loot',
      itemId: 'potion-of-healing',
      quantity: 3,
      visible: false,
    });
    await closeTestApp(testApp);
  });

  it('azzera thumb e composite e conserva un documento v2 con il loot', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const thumb = await storeImage(testApp, 320, 240, '#aa2211');
    const composite = await storeImage(testApp, 640, 360, '#22aa11');
    const map = await createMap(testApp.app, campaignId);
    setMapAssetColumns(testApp, map.id, {
      thumbAssetId: thumb.id,
      compositeAssetId: composite.id,
    });
    const withLoot = withElements(documentOf(map), [
      {
        id: 'loot-1',
        type: 'loot',
        itemId: 'torch',
        x: 6,
        y: 7,
        quantity: 1,
        visible: true,
      },
    ]);
    await saveMap(testApp.app, map, withLoot);

    const bundle = await exportCampaign(testApp.app, campaignId);
    const importedCampaignId = await importCampaign(testApp.app, bundle);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);

    expect(imported).toMatchObject({ thumbAssetId: null, compositeAssetId: null });
    expect(mapDocumentSchema.safeParse(documentOf(imported)).success).toBe(true);
    expect(imported.layers[3].items).toHaveLength(1);
    expect(imported.layers[3].items[0]).toMatchObject({
      id: 'loot-1',
      type: 'loot',
      itemId: 'torch',
      quantity: 1,
      visible: true,
    });
    await closeTestApp(testApp);
  });

  it('azzera lo sfondo quando l\'asset non è presente nel bundle', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 320, 240, '#335577');
    const graphic = await storeImage(testApp, 64, 64, '#aa2211');
    const map = await createMap(testApp.app, campaignId, background.id);
    await saveMap(testApp.app, map, withGraphics(documentOf(map), graphic.id));

    const bundle = await exportCampaign(testApp.app, campaignId);
    // L'asset manca davvero sia dal bundle sia dal database di destinazione.
    deleteAssetRow(testApp, background.id);
    const withoutBackground = {
      ...bundle,
      assets: bundle.assets.filter((asset) => asset.id !== background.id),
    };

    const importedCampaignId = await importCampaign(testApp.app, withoutBackground);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);

    expect(imported.layers[0].imageAssetId).toBeNull();
    expectNoSourceReference(imported, [background.id]);

    // La grafica, presente nel bundle, resta e viene rimappata.
    const importedGraphic = imported.layers[1].items[0];
    if (importedGraphic === undefined || !isImageGraphic(importedGraphic)) {
      throw new Error('Grafica importata mancante');
    }
    const importedGraphicId = importedGraphic.assetId;
    expect(importedGraphicId).not.toBe(graphic.id);
    expectNoSourceReference(imported, [graphic.id]);
    await expectAssetExists(testApp.app, importedGraphicId);
    await closeTestApp(testApp);
  });

  it('scarta la grafica quando il suo asset non è presente nel bundle', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 320, 240, '#335577');
    const graphic = await storeImage(testApp, 64, 64, '#aa2211');
    const map = await createMap(testApp.app, campaignId, background.id);
    await saveMap(testApp.app, map, withGraphics(documentOf(map), graphic.id));

    const bundle = await exportCampaign(testApp.app, campaignId);
    deleteAssetRow(testApp, graphic.id);
    const withoutGraphic = {
      ...bundle,
      assets: bundle.assets.filter((asset) => asset.id !== graphic.id),
    };

    const importedCampaignId = await importCampaign(testApp.app, withoutGraphic);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);

    // La grafica non può restare appesa a un asset inesistente: viene scartata.
    expect(imported.layers[1].items).toHaveLength(0);
    expectNoSourceReference(imported, [graphic.id]);

    const importedBackgroundId = imported.layers[0].imageAssetId;
    expect(importedBackgroundId).not.toBeNull();
    expect(importedBackgroundId).not.toBe(background.id);
    if (importedBackgroundId === null) {
      throw new Error('Sfondo importato mancante');
    }
    await expectAssetExists(testApp.app, importedBackgroundId);
    await closeTestApp(testApp);
  });

  it('conserva polygon e text e rimappa solo l\'asset dell\'immagine', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 320, 240, '#335577');
    const graphic = await storeImage(testApp, 64, 64, '#aa2211');
    const map = await createMap(testApp.app, campaignId, background.id);

    const document = withGraphicItems(
      withGraphics(documentOf(map), graphic.id),
      [
        mapGraphicSchema.parse({ id: 'image-1', assetId: graphic.id, x: 10, y: 20 }),
        polygonGraphic(),
        textGraphic(),
      ],
    );
    await saveMap(testApp.app, map, document);

    const bundle = await exportCampaign(testApp.app, campaignId);
    const exportedIds = bundle.assets.map((asset) => asset.id);
    expect(exportedIds).toContain(background.id);
    expect(exportedIds).toContain(graphic.id);
    expect(exportedIds).toHaveLength(2);

    const importedCampaignId = await importCampaign(testApp.app, bundle);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);
    const items = imported.layers[1].items;

    expect(items).toHaveLength(3);
    const importedImage = items.find((item) => item.id === 'image-1');
    if (importedImage === undefined || !('kind' in importedImage) || importedImage.kind !== 'image') {
      throw new Error('Immagine importata mancante');
    }
    expect(importedImage.assetId).not.toBe(graphic.id);
    expect(importedImage.assetId).not.toBeUndefined();
    await expectAssetExists(testApp.app, importedImage.assetId);

    const importedPolygon = items.find((item) => item.id === 'polygon-1');
    expect(importedPolygon).toMatchObject({
      kind: 'polygon',
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }],
      fill: '#4ea1ff',
      opacity: 0.35,
      z: 2,
    });
    expect(importedPolygon).not.toHaveProperty('assetId');

    const importedText = items.find((item) => item.id === 'text-1');
    expect(importedText).toMatchObject({
      kind: 'text',
      text: 'Sala del trono',
      fontFamily: 'serif',
      fontSize: 32,
      color: '#ffcc80',
      x: 15,
      y: 25,
      opacity: 0.8,
      z: 3,
    });
    expect(importedText).not.toHaveProperty('assetId');

    expectNoSourceReference(imported, [background.id, graphic.id]);
    await closeTestApp(testApp);
  });

  it('scarta solo l\'immagine con asset mancante e conserva polygon e text', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 320, 240, '#335577');
    const graphic = await storeImage(testApp, 64, 64, '#aa2211');
    const map = await createMap(testApp.app, campaignId, background.id);

    const document = withGraphicItems(
      withGraphics(documentOf(map), graphic.id),
      [
        mapGraphicSchema.parse({ id: 'image-1', assetId: graphic.id, x: 10, y: 20 }),
        polygonGraphic(),
        textGraphic(),
      ],
    );
    await saveMap(testApp.app, map, document);

    const bundle = await exportCampaign(testApp.app, campaignId);
    deleteAssetRow(testApp, graphic.id);
    const withoutImageAsset = {
      ...bundle,
      assets: bundle.assets.filter((asset) => asset.id !== graphic.id),
    };

    const importedCampaignId = await importCampaign(testApp.app, withoutImageAsset);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);
    const items = imported.layers[1].items;

    // Solo l'immagine perde il proprio asset; poligono e testo restano intatti.
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'polygon', id: 'polygon-1', fill: '#4ea1ff' });
    expect(items[1]).toMatchObject({ kind: 'text', id: 'text-1', text: 'Sala del trono' });
    expectNoSourceReference(imported, [graphic.id]);

    const importedBackgroundId = imported.layers[0].imageAssetId;
    if (importedBackgroundId === null) {
      throw new Error('Sfondo importato mancante');
    }
    await expectAssetExists(testApp.app, importedBackgroundId);
    await closeTestApp(testApp);
  });

  it('importa un bundle con una mappa in formato v1 migrandola a v2', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const background = await storeImage(testApp, 320, 240, '#335577');
    // La mappa v2 serve solo a far finire lo sfondo fra gli asset del bundle.
    await createMap(testApp.app, campaignId, background.id);

    const bundle = await exportCampaign(testApp.app, campaignId);
    const legacyMap = legacyBundleMap(campaignId, background.id);
    const legacyBundle = { ...bundle, maps: [legacyMap] };

    const importedCampaignId = await importCampaign(testApp.app, legacyBundle);
    const imported = await onlyMapOfCampaign(testApp.app, importedCampaignId);

    expect(imported.id).not.toBe(legacyMap.id);
    expect(imported.schemaVersion).toBe(2);
    expect(imported).not.toHaveProperty('terrain');
    expect(imported).not.toHaveProperty('spawns');
    expect(imported).not.toHaveProperty('playerStarts');
    expect(imported.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);

    const [importedBackground, , constraints, elements] = imported.layers;
    expect(importedBackground.imageTransform).toEqual({ x: 12, y: -8, scale: 1.25 });
    expect(importedBackground.imageAssetId).not.toBeNull();
    expect(importedBackground.imageAssetId).not.toBe(background.id);
    if (importedBackground.imageAssetId === null) {
      throw new Error('Sfondo legacy non importato');
    }
    await expectAssetExists(testApp.app, importedBackground.imageAssetId);

    expect(constraints.items.map((item) => item.id)).toEqual(['legacy-wall']);
    expect(elements.items.map((item) => `${item.type}:${item.id}`))
      .toEqual(['light:legacy-light', 'spawn:legacy-spawn', 'start:legacy-start']);
    expect(imported.ambientLight).toBe('dim');
    expect(imported.visionLimitFeet).toBe(60);
    expect(imported.visionEnabled).toBe(true);
    expect(imported.notes).toBe('Nota legacy');
    expect(imported.fogBase).toBe('revealed');
    expect(imported).toMatchObject({ widthPx: 1400, heightPx: 1000 });
    await closeTestApp(testApp);
  });
});
