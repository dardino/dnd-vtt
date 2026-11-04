import { expect, test } from '@playwright/test';
import type { Map, SceneSnapshot } from '@dnd-vtt/shared';
import { campaignId } from './fixtures.js';
import {
  commitField,
  clickCell,
  createMapFixture,
  dragLattice,
  openMapEditor,
  pngFile,
  selectTool,
  uploadPng,
} from './map-editor-helpers.js';

const MAP_NAME = 'Mappa a layer';
const MAP_WIDTH = 5120;
const MAP_HEIGHT = 1280;

test('una mappa a layer salva i derivati e genera una scena composita con loot', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const campaign = await campaignId(request, {
    description: 'Fixture mappa a layer',
  });
  const backgroundId = await uploadPng(
    request,
    await pngFile({ width: 640, height: 640, color: '#2e4a6b', name: 'sfondo.png' }),
  );
  const map = await createMapFixture(request, campaign, {
    name: MAP_NAME,
    widthPx: MAP_WIDTH,
    heightPx: MAP_HEIGHT,
    imageAssetId: backgroundId,
  });

  await openMapEditor(page, map.id);
  const status = page.locator('.editor__status');
  await expect(status).toContainText('Sfondo caricato');

  // Vincoli: un muro dritto e un'area rettangolare con etichetta.
  const constraintsLayer = page.locator(
    '.layer-panel__row[data-kind="constraints"] .layer-panel__activate',
  );
  await constraintsLayer.click();
  await expect(constraintsLayer).toHaveAttribute('aria-pressed', 'true');
  await selectTool(page, 'Muro', 'wall');
  await dragLattice(page, { x: 2, y: 2 }, { x: 6, y: 2 });
  await expect(status).toContainText('1 muri');

  await selectTool(page, 'Area rettangolo', 'areaRect');
  await dragLattice(page, { x: 3, y: 4 }, { x: 6, y: 6 });
  const areaInspector = page.locator('.area-inspector');
  await expect(areaInspector).toBeVisible();
  const areaLabel = areaInspector.getByLabel('Etichetta area');
  await areaLabel.fill('Sala');
  await areaLabel.press('Tab');
  await expect(areaLabel).toHaveValue('Sala');

  // Elementi: luce, spawn dal catalogo SRD, partenza e loot dal dialog.
  const elementsLayer = page.locator(
    '.layer-panel__row[data-kind="elements"] .layer-panel__activate',
  );
  await elementsLayer.click();
  await expect(elementsLayer).toHaveAttribute('aria-pressed', 'true');

  await selectTool(page, 'Luce', 'light');
  await clickCell(page, { x: 2, y: 3 });
  await expect(status).toContainText('1 luci');

  await selectTool(page, 'Mostro', 'spawn');
  await clickCell(page, { x: 5, y: 2 });
  const spawnDialog = page.locator('dialog.dialog', { has: page.locator('.spawn-dialog') });
  await expect(spawnDialog.getByRole('heading', { name: 'Aggiungi mostro o NPC' })).toBeVisible();
  await spawnDialog.getByPlaceholder('Cerca…').fill('Goblin');
  const goblin = spawnDialog.getByRole('button', { name: /Goblin Warrior/ });
  await expect(goblin).toBeVisible();
  await goblin.click();
  await expect(status).toContainText('1 spawn');

  await selectTool(page, 'Partenza', 'start');
  await clickCell(page, { x: 3, y: 3 });
  await expect(status).toContainText('1 partenze');

  await selectTool(page, 'Oggetti', 'loot');
  await clickCell(page, { x: 4, y: 2 });
  const lootDialog = page.locator('.loot-dialog');
  await expect(lootDialog).toBeVisible();
  await lootDialog.getByLabel('Cerca oggetti').fill('Longsword');
  const longsword = lootDialog.getByRole('button', { name: /Longsword/ }).first();
  await expect(longsword).toBeVisible();
  await longsword.click();
  await commitField(lootDialog.getByLabel('Quantità'), 2);
  await lootDialog.getByRole('button', { name: 'Conferma' }).click();
  await expect(lootDialog).toBeHidden();
  await expect(page.locator('.inspector-list[aria-label="Oggetti sulla mappa"]'))
    .toContainText('Longsword');

  // Grafica: upload dal file chooser e trasformazione dal pannello.
  const graphicsLayer = page.locator(
    '.layer-panel__row[data-kind="graphics"] .layer-panel__activate',
  );
  await graphicsLayer.click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Aggiungi immagine' }).click(),
  ]);
  await chooser.setFiles(await pngFile({
    width: 160,
    height: 90,
    color: '#c0392b',
    name: 'grafica.png',
  }));
  const graphicInspector = page.locator('.graphic-inspector');
  await expect(graphicInspector).toBeVisible();
  const scaleField = graphicInspector
    .locator('.graphic-field', { hasText: 'Scala' })
    .locator('input');
  const rotationField = graphicInspector
    .locator('.graphic-field', { hasText: 'Rotazione' })
    .locator('input');
  await commitField(scaleField, 1.5);
  await expect(scaleField).toHaveValue('1.5');
  await commitField(rotationField, 15);
  await expect(rotationField).toHaveValue('15');

  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('.editor__title .badge')).toHaveText('salvata', {
    timeout: 30_000,
  });

  const saved = await (await request.get(`/api/v1/maps/${map.id}`)).json() as Map;
  const thumbId = saved.thumbAssetId;
  const compositeId = saved.compositeAssetId;
  expect({ thumbId, compositeId }).toEqual({
    thumbId: expect.any(String),
    compositeId: expect.any(String),
  });
  if (compositeId === null) {
    throw new Error('Il salvataggio non ha prodotto il composito');
  }
  expect(compositeId).not.toBe(backgroundId);

  const graphics = saved.layers.find((layer) => layer.kind === 'graphics');
  expect(graphics?.items).toHaveLength(1);
  const graphic = graphics?.items[0];
  expect(graphic).toMatchObject({
    scale: 1.5,
    rotation: 15,
    x: MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2,
  });

  const constraints = saved.layers.find((layer) => layer.kind === 'constraints');
  expect(constraints?.items).toHaveLength(2);
  expect(constraints?.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      kind: 'wall',
      a: { x: 2, y: 2 },
      b: { x: 6, y: 2 },
    }),
    expect.objectContaining({
      shape: 'rect',
      points: [{ x: 3, y: 4 }, { x: 6, y: 6 }],
      label: 'Sala',
    }),
  ]));

  const elements = saved.layers.find((layer) => layer.kind === 'elements');
  expect(elements?.items).toHaveLength(4);
  expect(elements?.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'light', x: 2, y: 3 }),
    expect.objectContaining({
      type: 'spawn',
      x: 5,
      y: 2,
      source: { type: 'srd', monsterId: 'goblin-warrior' },
    }),
    expect.objectContaining({ type: 'start', x: 3, y: 3 }),
    expect.objectContaining({
      type: 'loot',
      itemId: 'longsword',
      x: 4,
      y: 2,
      quantity: 2,
      visible: true,
    }),
  ]));

  // L'elenco mappe espone una thumbnail e la card la usa al posto del foglio CSS.
  const listResponse = await request.get(`/api/v1/campaigns/${campaign}/maps`);
  const list = await listResponse.json() as {
    items: { id: string; thumbUrl: string | null }[];
  };
  const summary = list.items.find((entry) => entry.id === map.id);
  const thumbUrl = summary?.thumbUrl ?? '';
  expect(thumbUrl).toMatch(/^\/uploads\//);

  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['dnd-vtt.lastCampaignId', campaign] as const,
  );
  await page.goto('/maps');
  await expect(page.getByRole('heading', { level: 1, name: 'Mappe' })).toBeVisible();
  const card = page.locator('.map-card', { hasText: MAP_NAME });
  const thumb = card.locator('.map-card__preview img');
  await expect(thumb).toBeVisible();
  await expect(thumb).toHaveAttribute('src', thumbUrl);
  await expect(card.locator('.map-card__blank')).toHaveCount(0);

  // La scena parte dal composito con trasformazione cover e conserva il loot.
  const sceneResponse = await request.post(`/api/v1/campaigns/${campaign}/scenes/from-map`, {
    data: { mapId: map.id, name: 'Scena a layer', playerAssignments: [] },
  });
  expect(sceneResponse.status()).toBe(201);
  const { sceneId } = await sceneResponse.json() as { sceneId: string };
  const snapshot = await (await request.get(`/api/v1/scenes/${sceneId}`))
    .json() as SceneSnapshot;
  expect(snapshot.scene.imageAssetId).toBe(compositeId);

  const compositeAsset = await (await request.get(`/api/v1/assets/${compositeId}`))
    .json() as { width: number; height: number };
  const coverScale = Math.max(
    MAP_WIDTH / compositeAsset.width,
    MAP_HEIGHT / compositeAsset.height,
  );
  expect(coverScale).toBeGreaterThan(1);
  expect(snapshot.scene.backgroundTransform.scale).toBeCloseTo(coverScale, 5);
  expect(snapshot.scene.backgroundTransform.x).toBeCloseTo(
    (MAP_WIDTH - compositeAsset.width * coverScale) / 2,
    5,
  );
  expect(snapshot.scene.backgroundTransform.y).toBeCloseTo(
    (MAP_HEIGHT - compositeAsset.height * coverScale) / 2,
    5,
  );

  expect(snapshot.state.loot).toHaveLength(1);
  expect(snapshot.state.loot[0]).toMatchObject({
    itemId: 'longsword',
    x: 4,
    y: 2,
    quantity: 2,
    visible: true,
  });
});
