import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  cellCenterPx,
  measureDistance,
  snapTokenCell,
  type GridConfig,
  type SceneSnapshot,
  type TokenState,
} from '@dnd-vtt/shared';

const CAMPAIGN_NAME = 'E2E Campagna';

interface ActorResponse {
  id: string;
}

const campaignId = async (request: APIRequestContext): Promise<string> => {
  const list = await request.get('/api/v1/campaigns?limit=200');
  const items = (await list.json() as { items: { id: string; name: string }[] }).items;
  const existing = items.find((item) => item.name === CAMPAIGN_NAME);
  if (existing !== undefined) {
    return existing.id;
  }
  const created = await request.post('/api/v1/campaigns', {
    data: { name: CAMPAIGN_NAME, description: 'Mappa di prova', advancementMode: 'milestone' },
  });
  return (await created.json() as { id: string }).id;
};

const createGoblin = async (request: APIRequestContext, id: string): Promise<ActorResponse> => {
  const response = await request.post('/api/v1/actors', {
    data: {
      campaignId: id,
      kind: 'monster',
      name: 'Goblin E2E',
      statblock: {
        kind: 'monster',
        size: 'medium',
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        hp: { current: 7, max: 7, temp: 0 },
        speed: { walk: 30 },
        senses: { darkvision: 60 },
        languages: ['common', 'goblin'],
        conditions: [],
        creatureType: 'goblinoid',
        cr: '1/4',
        tags: [],
        ac: 15,
        damageResistances: [],
        damageImmunities: [],
        damageVulnerabilities: [],
        conditionImmunities: [],
        traits: [],
        actions: [],
        reactions: [],
      },
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<ActorResponse>;
};

const openCampaign = async (page: Page): Promise<void> => {
  await page.goto('/dm');
  const dialog = page.getByRole('dialog');
  const heading = page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME });
  await expect(dialog.or(heading)).toBeVisible();
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: new RegExp(CAMPAIGN_NAME) }).first().click();
  }
  await expect(heading).toBeVisible();
};

const mapFile = async (): Promise<{ name: string; mimeType: string; buffer: Buffer }> => {
  const buffer = await sharp({
    create: { width: 8192, height: 1024, channels: 3, background: '#2e4a6b' },
  }).png().toBuffer();
  return { name: 'mappa-8k.png', mimeType: 'image/png', buffer };
};

const replacementMapFile = async (): Promise<{ name: string; mimeType: string; buffer: Buffer }> => {
  const buffer = await sharp({
    create: { width: 1024, height: 512, channels: 3, background: '#6b4a2e' },
  }).png().toBuffer();
  return { name: 'mappa-sostituta.png', mimeType: 'image/png', buffer };
};

const uploadMap = async (page: Page): Promise<void> => {
  await page.locator('#new-map-file').setInputFiles(await mapFile());
  const canvas = page.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-tiled', 'true', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-tiles-ready', 'true', { timeout: 60_000 });
};

const activeScene = async (
  request: APIRequestContext,
  id: string,
): Promise<{ sceneId: string; snapshot: SceneSnapshot }> => {
  const campaign = await request.get(`/api/v1/campaigns/${id}`);
  const sceneId = (await campaign.json() as { activeSceneId: string }).activeSceneId;
  const snapshot = await request.get(`/api/v1/scenes/${sceneId}`);
  return { sceneId, snapshot: await snapshot.json() as SceneSnapshot };
};

const tokenOf = (snapshot: SceneSnapshot): TokenState => {
  const token = snapshot.state.tokens[0];
  expect(token).toBeDefined();
  return token as TokenState;
};

const canvasPoint = async (
  page: Page,
  grid: GridConfig,
  cell: { x: number; y: number },
): Promise<{ x: number; y: number; scale: number }> => {
  const camera = await page.locator('.scene-canvas').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      scale: Number(element.getAttribute('data-camera-scale')),
      cameraX: Number(element.getAttribute('data-camera-x')),
      cameraY: Number(element.getAttribute('data-camera-y')),
    };
  });
  const world = cellCenterPx(grid, cell);
  return {
    x: camera.x + camera.cameraX + world.x * camera.scale,
    y: camera.y + camera.cameraY + world.y * camera.scale,
    scale: camera.scale,
  };
};

test.describe.configure({ mode: 'serial' });

test('carica una mappa 8k, trascina un token e calcola la misura condivisa', async ({ page, request }) => {
  test.setTimeout(120_000);
  const id = await campaignId(request);
  await createGoblin(request, id);
  await openCampaign(page);

  await uploadMap(page);

  const actorCard = page.locator('.available-actor', { hasText: 'Goblin E2E' });
  await expect(actorCard).toBeVisible();
  const canvas = page.locator('.scene-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await actorCard.dispatchEvent('dragstart', { dataTransfer });
  const dropX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const dropY = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await canvas.dispatchEvent('dragover', {
    dataTransfer,
    clientX: dropX,
    clientY: dropY,
  });
  await canvas.dispatchEvent('drop', {
    dataTransfer,
    clientX: dropX,
    clientY: dropY,
  });

  await expect(page.locator('.token-row', { hasText: 'Goblin E2E' })).toBeVisible();
  await expect(page.locator('.available-actor', { hasText: 'Goblin E2E' })).toContainText('1 in mappa');
  await expect(page.locator('.slots')).not.toContainText('Goblin E2E');
  const first = await activeScene(request, id);
  const dropped = tokenOf(first.snapshot);
  expect(Number.isInteger(dropped.x)).toBe(true);
  expect(Number.isInteger(dropped.y)).toBe(true);

  await page.locator('.token-row__name', { hasText: 'Goblin E2E' }).click();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const squareScale = Number(await canvas.getAttribute('data-camera-scale'));
  const squareCenter = {
    x: (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) / 2,
    y: (canvasBox?.y ?? 0) + (canvasBox?.height ?? 0) / 2,
    scale: squareScale,
  };
  await page.mouse.move(squareCenter.x, squareCenter.y);
  await page.mouse.down();
  await page.mouse.move(
    squareCenter.x + first.snapshot.state.grid.cellSizePx * squareCenter.scale * 1.2,
    squareCenter.y + first.snapshot.state.grid.cellSizePx * squareCenter.scale * 1.2,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect.poll(async () => {
    const snapshot: SceneSnapshot = (await activeScene(request, id)).snapshot;
    return tokenOf(snapshot).x;
  }).toBeGreaterThan(dropped.x);

  const moved = await activeScene(request, id);
  expect(tokenOf(moved.snapshot).y).toBeGreaterThan(dropped.y);

  await page.getByLabel('Forma').selectOption('hex');
  await expect(canvas).toHaveAttribute('data-grid-type', 'hex');
  await expect.poll(async () => {
    const snapshot: SceneSnapshot = (await activeScene(request, id)).snapshot;
    return snapshot.state.grid.type;
  }).toBe('hex');

  const hexScene = await activeScene(request, id);
  const beforeHex = tokenOf(hexScene.snapshot);
  await page.locator('.token-row__name', { hasText: 'Goblin E2E' }).click();
  const hexBox = await canvas.boundingBox();
  expect(hexBox).not.toBeNull();
  const hexScale = Number(await canvas.getAttribute('data-camera-scale'));
  const hexCenter = {
    x: (hexBox?.x ?? 0) + (hexBox?.width ?? 0) / 2,
    y: (hexBox?.y ?? 0) + (hexBox?.height ?? 0) / 2,
    scale: hexScale,
  };
  await page.mouse.move(hexCenter.x, hexCenter.y);
  await page.mouse.down();
  await page.mouse.move(
    hexCenter.x + hexScene.snapshot.state.grid.cellSizePx * hexCenter.scale * 1.4,
    hexCenter.y,
    { steps: 8 },
  );
  await page.mouse.up();

  const expectedHex = snapTokenCell(
    hexScene.snapshot.state.grid,
    {
      x: cellCenterPx(hexScene.snapshot.state.grid, beforeHex).x
        + hexScene.snapshot.state.grid.cellSizePx * 1.4,
      y: cellCenterPx(hexScene.snapshot.state.grid, beforeHex).y,
    },
    beforeHex.size,
  );
  await expect.poll(async () => {
    const current = await activeScene(request, id);
    return `${tokenOf(current.snapshot).x},${tokenOf(current.snapshot).y}`;
  }).toBe(`${expectedHex.x},${expectedHex.y}`);

  const measured = measureDistance({ x: 1, y: 1 }, { x: 4, y: 2 }, hexScene.snapshot.state.grid);
  await page.getByRole('button', { name: 'Misura distanza' }).click();
  const from = await canvasPoint(page, hexScene.snapshot.state.grid, { x: 1, y: 1 });
  const to = await canvasPoint(page, hexScene.snapshot.state.grid, { x: 4, y: 2 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('.scene-canvas__measure')).toContainText(`${measured.feet} ft`);
});

test('sostituisce la mappa della scena attiva', async ({ page }) => {
  test.setTimeout(60_000);
  await openCampaign(page);
  const activeItem = page.locator('.scene-list__item', { hasText: 'mappa-8k' });
  await expect(activeItem).toContainText('8192 × 1024');

  const chooserPromise = page.waitForEvent('filechooser');
  await activeItem.getByRole('button', { name: /Sostituisci mappa/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(await replacementMapFile());

  await expect(activeItem).toContainText('1024 × 512');
  await expect(page.locator('.statusbar')).toContainText('Mappa sostituita');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-tiled', 'false');
});

test('due console convergono senza conflitti', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const id = await campaignId(request);
  await openCampaign(page);
  await expect(page.locator('.scene-canvas')).toBeVisible();

  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible();
  await expect(second.locator('.scene-canvas')).toBeVisible();

  const scene = await activeScene(request, id);
  const token = tokenOf(scene.snapshot);
  const canvas = page.locator('.scene-canvas');
  const beforeCamera = await canvas.getAttribute('data-camera-x');
  await page.locator('.token-row__name', { hasText: 'Goblin E2E' }).click();
  await expect.poll(async () => canvas.getAttribute('data-camera-x')).not.toBe(beforeCamera);
  const point = await canvasPoint(page, scene.snapshot.state.grid, token);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(
    point.x + scene.snapshot.state.grid.cellSizePx * point.scale,
    point.y,
    { steps: 6 },
  );
  await page.mouse.up();

  await expect.poll(async () => {
    const current = await activeScene(request, id);
    return `${tokenOf(current.snapshot).x}:${current.snapshot.stateVersion}`;
  }).not.toBe(`${token.x}:${scene.snapshot.stateVersion}`);

  const latest = await activeScene(request, id);
  await expect(second.locator('.statusbar')).toContainText(`v${latest.snapshot.stateVersion}`, { timeout: 10_000 });
  await expect(second.locator('.statusbar')).not.toContainText('offline');
  await expect(second.locator('.statusbar')).not.toContainText('read-only');
  await expect(page.locator('.statusbar')).not.toContainText('offline');
});

test('le sezioni sono accordion e la scena si attiva solo dal pulsante', async ({ page, request }) => {
  const id = await campaignId(request);
  await request.post(`/api/v1/campaigns/${id}/scenes`, {
    data: { name: 'Scena di riserva', widthPx: 1024, heightPx: 768 },
  });
  await openCampaign(page);
  const trigger = page.getByRole('button', { name: 'Griglia', exact: true });
  const form = page.getByLabel('Forma');
  await expect(form).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Attiva scena Scena di riserva' })).toBeVisible();
  await expect(page.locator('.scene-list__item.is-active .badge')).toHaveText('attiva');

  await trigger.click();
  await expect(form).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible();
  const reloaded = page.getByRole('button', { name: 'Griglia', exact: true });
  await expect(reloaded).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Forma')).toBeHidden();

  await reloaded.click();
  await expect(page.getByLabel('Forma')).toBeVisible();

  const reserve = page.locator('.scene-list__item', { hasText: 'Scena di riserva' });
  await reserve.locator('.scene-list__info').click();
  await expect(page.locator('.scene-list__item.is-active')).toContainText('mappa-8k');
  await reserve.getByRole('button', { name: 'Attiva scena Scena di riserva' }).click();
  await expect(reserve.locator('.badge')).toHaveText('attiva');
});
