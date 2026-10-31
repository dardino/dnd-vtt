import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { SceneSnapshot } from '@dnd-vtt/shared';

const CAMPAIGN_NAME = 'E2E Campagna';

const openCampaign = async (page: Page): Promise<void> => {
  await page.goto('/dm');
  const dialog = page.getByRole('dialog');
  const heading = page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME });
  await expect(dialog.or(heading)).toBeVisible();
  if (await dialog.isVisible()) {
    if (await dialog.getByRole('heading', { name: 'Crea campagna' }).isVisible()) {
      await dialog.getByLabel('Nome').fill(CAMPAIGN_NAME);
      await dialog.getByRole('button', { name: 'Crea campagna' }).click();
    } else {
      await dialog.getByRole('button', { name: new RegExp(CAMPAIGN_NAME) }).first().click();
    }
  }
  await expect(heading).toBeVisible();
};

const campaignId = async (request: APIRequestContext): Promise<string> => {
  const list = await request.get('/api/v1/campaigns?limit=200');
  const items = (await list.json() as { items: { id: string; name: string }[] }).items;
  const existing = items.find((item) => item.name === CAMPAIGN_NAME);
  if (existing !== undefined) {
    return existing.id;
  }
  const created = await request.post('/api/v1/campaigns', {
    data: { name: CAMPAIGN_NAME, description: 'Fog', advancementMode: 'milestone' },
  });
  return (await created.json() as { id: string }).id;
};

const ensureScene = async (request: APIRequestContext, id: string): Promise<string> => {
  const campaign = await request.get(`/api/v1/campaigns/${id}`);
  const activeSceneId = (await campaign.json() as { activeSceneId: string | null }).activeSceneId;
  if (activeSceneId !== null) {
    return activeSceneId;
  }
  const created = await request.post(`/api/v1/campaigns/${id}/scenes`, {
    data: { name: 'Arena Fog', widthPx: 1024, heightPx: 768 },
  });
  const sceneId = (await created.json() as { id: string }).id;
  await request.patch(`/api/v1/campaigns/${id}`, { data: { activeSceneId: sceneId } });
  return sceneId;
};

const sceneState = async (request: APIRequestContext, sceneId: string): Promise<SceneSnapshot> => {
  const response = await request.get(`/api/v1/scenes/${sceneId}`);
  return response.json() as Promise<SceneSnapshot>;
};

test('disegna fog e annotazioni, annulla il disegno e persiste la fog', async ({ page, request }) => {
  const id = await campaignId(request);
  const sceneId = await ensureScene(request, id);
  await openCampaign(page);

  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => canvas.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const left = (box?.x ?? 0) + 100;
  const top = (box?.y ?? 0) + 100;

  await page.getByRole('button', { name: 'Fog: rettangolo' }).click();
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 160, top + 100, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length).toBe(1);
  expect((await sceneState(request, sceneId)).state.fog.ops[0]?.softness).toBe(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible();
  expect((await sceneState(request, sceneId)).state.fog.ops).toHaveLength(1);

  await page.getByRole('button', { name: 'Disegno' }).click();
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 120, top + 60, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.drawings.length).toBe(1);
  const drawing = (await sceneState(request, sceneId)).state.drawings[0];
  expect(drawing?.width).toBe(17.5);

  await page.getByRole('button', { name: /Azioni \(/ }).click();
  const row = page.locator('.action-history li', { hasText: 'Disegno aggiunto' }).first();
  await row.getByRole('button', { name: 'Annulla fino a qui' }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.drawings.length).toBe(0);
  expect((await sceneState(request, sceneId)).state.fog.ops).toHaveLength(1);

  await page.getByRole('button', { name: 'Rivela tutto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Conferma' }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.base).toBe('revealed');
  await page.getByRole('button', { name: 'Nascondi tutto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Conferma' }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.base).toBe('hidden');
  expect((await sceneState(request, sceneId)).state.fog.ops).toHaveLength(0);
});

test('esporta la scena in PNG', async ({ page }) => {
  await openCampaign(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scena.png');
});

test('annulla e ripete matita e fog dall editor', async ({ page, request }) => {
  const id = await campaignId(request);
  const sceneId = await ensureScene(request, id);
  await openCampaign(page);

  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => canvas.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  const left = (box?.x ?? 0) + 140;
  const top = (box?.y ?? 0) + 140;

  const drawingsBefore = (await sceneState(request, sceneId)).state.drawings.length;
  await page.getByRole('button', { name: 'Disegno' }).click();
  await expect(page.getByRole('button', { name: 'Disegno' })).toHaveClass(/is-active/);
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 90, top + 50, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.drawings.length)
    .toBe(drawingsBefore + 1);

  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.drawings.length)
    .toBe(drawingsBefore);
  await page.getByRole('button', { name: 'Ripeti', exact: true }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.drawings.length)
    .toBe(drawingsBefore + 1);

  const opsBefore = (await sceneState(request, sceneId)).state.fog.ops.length;
  await page.getByRole('button', { name: 'Fog: rivela' }).click();
  await expect(page.getByRole('button', { name: 'Fog: rivela' })).toHaveClass(/is-active/);
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 70, top + 40, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBe(opsBefore + 1);

  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBe(opsBefore);

  await page.getByRole('button', { name: 'Ripeti', exact: true }).click();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBe(opsBefore + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBe(opsBefore);
});

test('il pennello fog ha un diametro di 3 celle', async ({ page, request }) => {
  const id = await campaignId(request);
  const sceneId = await ensureScene(request, id);
  const before = await sceneState(request, sceneId);
  await request.post(`/api/v1/campaigns/${id}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase6-brush',
      sceneId,
      action: {
        type: 'grid.update',
        grid: { ...before.state.grid, cellSizePx: 64 },
      },
    },
  });
  await openCampaign(page);

  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => canvas.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  const left = (box?.x ?? 0) + 120;
  const top = (box?.y ?? 0) + 120;

  await page.getByRole('button', { name: 'Fog: rivela' }).click();
  await expect(page.getByRole('button', { name: 'Fog: rivela' })).toHaveClass(/is-active/);
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 80, top + 40, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBeGreaterThan(0);
  const ops = (await sceneState(request, sceneId)).state.fog.ops;
  const brush = ops.at(-1);
  expect(brush?.shape.type).toBe('brush');
  if (brush?.shape.type === 'brush') {
    expect(brush.shape.radius).toBe(96);
  }
});

test('le impostazioni mappa regolano matita e pennello e ripuliscono history e fog', async ({ page, request }) => {
  const id = await campaignId(request);
  const sceneId = await ensureScene(request, id);
  await openCampaign(page);

  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => canvas.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  const left = (box?.x ?? 0) + 160;
  const top = (box?.y ?? 0) + 160;
  const cell = (await sceneState(request, sceneId)).state.grid.cellSizePx;

  await page.getByRole('button', { name: 'Impostazioni mappa' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Dimensione pennello/).fill('4');
  await dialog.getByLabel(/Dimensione pennello/).press('Tab');
  await dialog.getByLabel(/Dimensione matita/).fill('5');
  await dialog.getByLabel(/Dimensione matita/).press('Tab');
  await dialog.getByRole('button', { name: 'Chiudi impostazioni' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(100);

  const drawingsBefore = (await sceneState(request, sceneId)).state.drawings.length;
  await page.getByRole('button', { name: 'Disegno' }).click();
  await expect(page.getByRole('button', { name: 'Disegno' })).toHaveClass(/is-active/);
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 80, top + 40, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.drawings.length)
    .toBe(drawingsBefore + 1);
  const drawing = (await sceneState(request, sceneId)).state.drawings.at(-1);
  expect(drawing?.width).toBe(cell * 0.5);

  const opsBefore = (await sceneState(request, sceneId)).state.fog.ops.length;
  await page.getByRole('button', { name: 'Fog: rivela' }).click();
  await expect(page.getByRole('button', { name: 'Fog: rivela' })).toHaveClass(/is-active/);
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 70, top + 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBe(opsBefore + 1);
  const fogOps = (await sceneState(request, sceneId)).state.fog.ops;
  const lastFog = fogOps.at(-1);
  if (lastFog?.shape.type === 'brush') {
    expect(lastFog.shape.radius).toBe((cell * 4) / 2);
  } else {
    throw new Error('atteso un tratto fog a pennello');
  }

  await page.getByRole('button', { name: 'Impostazioni mappa' }).click();
  await page.getByRole('button', { name: 'Svuota history' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => {
    const history = await request.get(`/api/v1/campaigns/${id}/actions`);
    return (await history.json() as { items: unknown[] }).items.length;
  }).toBe(0);

  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(left + 50, top + 30, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog.ops.length)
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Impostazioni mappa' }).click();
  await page.getByRole('button', { name: 'Reset FOG' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await sceneState(request, sceneId)).state.fog)
    .toEqual({ base: 'hidden', ops: [] });
  await expect.poll(async () => {
    const history = await request.get(`/api/v1/campaigns/${id}/actions`);
    const items = (await history.json() as { items: { type: string }[] }).items;
    return items.filter((entry) => entry.type.startsWith('fog.')).length;
  }).toBe(0);
});

test('il tasto destro fa pan con qualsiasi strumento', async ({ page, request }) => {
  const id = await campaignId(request);
  const sceneId = await ensureScene(request, id);
  await openCampaign(page);

  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => canvas.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Fog: rivela' }).click();
  await expect(page.getByRole('button', { name: 'Fog: rivela' })).toHaveClass(/is-active/);

  const opsBefore = (await sceneState(request, sceneId)).state.fog.ops.length;
  const beforeX = await canvas.getAttribute('data-camera-x');
  const beforeY = await canvas.getAttribute('data-camera-y');
  const box = await canvas.boundingBox();
  const left = (box?.x ?? 0) + 200;
  const top = (box?.y ?? 0) + 200;

  await page.mouse.move(left, top);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(left + 90, top + 60, { steps: 5 });
  await page.mouse.up({ button: 'right' });

  await expect.poll(async () => canvas.getAttribute('data-camera-x')).not.toBe(beforeX);
  expect(await canvas.getAttribute('data-camera-y')).not.toBe(beforeY);
  expect((await sceneState(request, sceneId)).state.fog.ops.length).toBe(opsBefore);
});
