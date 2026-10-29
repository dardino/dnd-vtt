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
