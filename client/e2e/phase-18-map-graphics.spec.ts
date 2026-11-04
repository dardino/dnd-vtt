import { expect, test } from '@playwright/test';
import type { Asset, Map } from '@dnd-vtt/shared';
import { campaignId } from './fixtures.js';
import {
  clickCell,
  commitField,
  createMapFixture,
  latticePoint,
  openMapEditor,
  selectTool,
} from './map-editor-helpers.js';

const MAP_NAME = 'Mappa con poligono e testo';
const MAP_WIDTH = 1280;
const MAP_HEIGHT = 960;

test('poligono e testo nel layer graphics finiscono nel documento e nei derivati', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const campaign = await campaignId(request, {
    description: 'Fixture grafiche poligono e testo',
  });
  const map = await createMapFixture(request, campaign, {
    name: MAP_NAME,
    widthPx: MAP_WIDTH,
    heightPx: MAP_HEIGHT,
  });

  await openMapEditor(page, map.id);
  const graphicsLayer = page.locator(
    '.layer-panel__row[data-kind="graphics"] .layer-panel__activate',
  );
  await graphicsLayer.click();
  await expect(graphicsLayer).toHaveAttribute('aria-pressed', 'true');

  // Poligono: tre vertici agganciati al reticolo, chiusi con Enter.
  await selectTool(page, 'Poligono', 'graphicPolygon');
  const vertices = [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }] as const;
  for (const vertex of vertices) {
    const point = await latticePoint(page, vertex);
    await page.mouse.click(point.x, point.y);
  }
  await page.keyboard.press('Enter');

  const inspector = page.locator('.graphic-inspector');
  await expect(inspector).toBeVisible();
  const fillField = inspector
    .locator('.graphic-field', { hasText: 'Colore riempimento' })
    .locator('input');
  await expect(fillField).toHaveValue('#4ea1ff');

  // Testo: click su una cella, poi contenuto modificato dall'inspector.
  await selectTool(page, 'Testo', 'graphicText');
  await clickCell(page, { x: 3, y: 6 });
  await expect(inspector).toBeVisible();
  const textField = inspector
    .locator('.graphic-field', { hasText: 'Testo' })
    .locator('input');
  await commitField(textField, 'Sala segreta');
  await expect(textField).toHaveValue('Sala segreta');

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
  if (thumbId === null || compositeId === null) {
    throw new Error('Il salvataggio non ha prodotto thumbnail e composito');
  }

  const graphics = saved.layers.find((layer) => layer.kind === 'graphics');
  expect(graphics?.items).toHaveLength(2);
  expect(graphics?.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      kind: 'polygon',
      points: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }],
      fill: '#4ea1ff',
    }),
    expect.objectContaining({
      kind: 'text',
      text: 'Sala segreta',
      fontFamily: 'sans',
    }),
  ]));

  // I derivati sono asset reali, non semplici riferimenti stringa: i metadati
  // rispondono 200 e i file puntati sono immagini servite dal server.
  const [thumbResponse, compositeResponse] = await Promise.all([
    request.get(`/api/v1/assets/${thumbId}`),
    request.get(`/api/v1/assets/${compositeId}`),
  ]);
  expect(thumbResponse.status()).toBe(200);
  expect(compositeResponse.status()).toBe(200);
  const derivates = [
    await thumbResponse.json() as Asset,
    await compositeResponse.json() as Asset,
  ];
  for (const derivative of derivates) {
    const file = await request.get(derivative.url);
    expect(file.status(), derivative.url).toBe(200);
    expect(file.headers()['content-type'], derivative.url).toMatch(/^image\//);
  }

  const summary = await (await request.get(`/api/v1/campaigns/${campaign}/maps`))
    .json() as { items: { id: string; thumbUrl: string | null }[] };
  expect(summary.items.find((entry) => entry.id === map.id)?.thumbUrl)
    .toMatch(/^\/uploads\//);
});
