import { expect, test, type APIRequestContext } from '@playwright/test';
import type { SceneSnapshot } from '@dnd-vtt/shared';

const CAMPAIGN_NAME = 'E2E Regia';

const MAP_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const PORTRAIT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const createSceneFixture = async (
  request: APIRequestContext,
  size: { width: number; height: number } = { width: 1000, height: 800 },
): Promise<{
  campaignId: string;
  sceneId: string;
  tokenId: string;
  actorId: string;
}> => {
  const campaignResponse = await request.post('/api/v1/campaigns', {
    data: { name: CAMPAIGN_NAME, description: 'Doppio schermo' },
  });
  const campaignId = (await campaignResponse.json() as { id: string }).id;
  const mapResponse = await request.post('/api/v1/assets', {
    multipart: {
      file: { name: 'mappa.png', mimeType: 'image/png', buffer: MAP_PNG },
    },
  });
  const mapAssetId = (await mapResponse.json() as { id: string }).id;
  const sceneResponse = await request.post(`/api/v1/campaigns/${campaignId}/scenes`, {
    data: {
      name: 'Palco',
      widthPx: size.width,
      heightPx: size.height,
      fogBase: 'revealed',
      imageAssetId: mapAssetId,
    },
  });
  const sceneId = (await sceneResponse.json() as { id: string }).id;
  const actorResponse = await request.post('/api/v1/actors', {
    data: {
      campaignId,
      kind: 'monster',
      name: 'Goblin Palco',
      statblock: {
        kind: 'monster',
        size: 'medium',
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        hp: { current: 7, max: 7, temp: 0 },
        speed: { walk: 30 },
        senses: { darkvision: 60 },
        languages: ['common'],
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
        actions: [{
          name: 'Scimitarra',
          description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
          recharge: 'none',
        }],
        reactions: [],
      },
    },
  });
  const actorId = (await actorResponse.json() as { id: string }).id;
  const portraitResponse = await request.post('/api/v1/assets', {
    multipart: {
      file: { name: 'ritratto.png', mimeType: 'image/png', buffer: PORTRAIT_PNG },
    },
  });
  const portraitAssetId = (await portraitResponse.json() as { id: string }).id;
  await request.patch(`/api/v1/actors/${actorId}`, {
    data: {
      imageAssetId: portraitAssetId,
      portrait: { focusX: 0.5, focusY: 0.4, zoom: 1.2 },
    },
  });
  const tokenId = crypto.randomUUID();
  await request.post(`/api/v1/campaigns/${campaignId}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase7',
      sceneId,
      action: {
        type: 'token.add',
        token: {
          id: tokenId,
          actorId,
          label: 'Goblin Palco',
          x: 2,
          y: 2,
          size: 1,
          rotation: 0,
          elevation: 0,
          hp: { current: 7, max: 7, temp: 0 },
          conditions: [],
          visible: true,
        },
      },
    },
  });
  return { campaignId, sceneId, tokenId, actorId };
};

const snapshot = async (request: APIRequestContext, sceneId: string): Promise<SceneSnapshot> => {
  const response = await request.get(`/api/v1/scenes/${sceneId}`);
  return response.json() as Promise<SceneSnapshot>;
};

test('TAKE, blackout e token aggiornano lo schermo via WebSocket', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const fixture = await createSceneFixture(request);
  await page.goto(`/dm/campaigns/${fixture.campaignId}`);
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible({ timeout: 15_000 });
  const onAir = page.locator('.dm-topbar__onair');
  await expect(onAir).toHaveText('OFF AIR');

  const [display] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
  await display.waitForURL(/\/display\//);
  await display.waitForLoadState('domcontentloaded');
  const screen = display.locator('.display');
  await expect(screen).toBeVisible({ timeout: 15_000 });
  await expect(screen).toHaveAttribute('data-campaign', fixture.campaignId);
  await expect(screen).toHaveAttribute('data-token-count', '1', { timeout: 15_000 });
  await expect(onAir).toHaveText('ON AIR');
  await expect(onAir).toHaveClass(/is-onair/);

  const displayCode = new URL(display.url()).pathname.split('/').filter(Boolean).at(-1) ?? '';
  await expect(display.locator('.display__code')).toHaveText(displayCode);
  const screenList = page.locator('#sidebar-screens');
  await expect(screenList).toContainText(displayCode);
  await display.setViewportSize({ width: 800, height: 1200 });
  await expect(screenList).toContainText('800 × 1200', { timeout: 10_000 });

  const versionBeforeTake = await screen.getAttribute('data-composition-version');
  await page.getByRole('button', { name: 'Manda in onda' }).click();
  await expect.poll(async () => screen.getAttribute('data-composition-version'))
    .not.toBe(versionBeforeTake);
  await expect(screen.locator('.scene-canvas')).toBeVisible({ timeout: 10_000 });
  await expect(screen).toHaveAttribute('data-token-portraits', '1');

  const onlineResponse = await request.get(`/api/v1/campaigns/${fixture.campaignId}/displays/online`);
  const onlineItems = (await onlineResponse.json() as {
    items: { id: string; code: string }[];
  }).items;
  const target = onlineItems.find((item) => item.code === displayCode);
  expect(target).toBeDefined();
  const screenCanvasEl = screen.locator('.scene-canvas');
  const baseScale = Number(await screenCanvasEl.getAttribute('data-camera-scale'));
  await request.put(`/api/v1/campaigns/${fixture.campaignId}/displays/${target?.id}/viewport`, {
    data: { viewport: { x: 500, y: 400, zoom: 2 } },
  });
  await expect.poll(async () => Number(await screenCanvasEl.getAttribute('data-camera-scale')))
    .toBeCloseTo(baseScale * 2, 1);
  await request.put(`/api/v1/campaigns/${fixture.campaignId}/displays/${target?.id}/viewport`, {
    data: { viewport: { x: 500, y: 400, zoom: 1 } },
  });
  await expect.poll(async () => Number(await screenCanvasEl.getAttribute('data-camera-scale')))
    .toBeCloseTo(baseScale, 1);

  await screenList.locator('.screen-row').first().click();
  const viewer = page.getByRole('dialog').locator('.screen-viewer');
  await expect(viewer.locator('app-screen-preview')).toBeVisible({ timeout: 10_000 });
  await expect(viewer.locator('.scene-canvas')).toBeVisible();
  const viewerSize = await viewer.boundingBox();
  expect((viewerSize?.width ?? 0) / (viewerSize?.height ?? 1)).toBeCloseTo(800 / 1200, 1);
  const screenCanvas = screen.locator('.scene-canvas');
  const beforeScale = Number(await screenCanvas.getAttribute('data-camera-scale'));
  const beforeCameraX = await screenCanvas.getAttribute('data-camera-x');
  const zoomLabel = page.getByRole('dialog').locator('.inline-controls .muted');
  await viewer.hover();
  for (let tick = 0; tick < 5; tick += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(100);
  }
  await expect(zoomLabel).not.toHaveText('Zoom 100%');
  await expect.poll(async () => screenCanvas.getAttribute('data-camera-scale'))
    .not.toBe(String(beforeScale));
  const dialogZoom = Number(await viewer.getAttribute('data-zoom'));
  expect(dialogZoom).toBeGreaterThan(1.5);
  await expect.poll(async () => Number(await screenCanvas.getAttribute('data-camera-scale')))
    .toBeCloseTo(beforeScale * dialogZoom, 1);
  const viewerBox = await viewer.boundingBox();
  await page.mouse.move(
    (viewerBox?.x ?? 0) + (viewerBox?.width ?? 0) / 2,
    (viewerBox?.y ?? 0) + (viewerBox?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    (viewerBox?.x ?? 0) + (viewerBox?.width ?? 0) / 2 + 70,
    (viewerBox?.y ?? 0) + (viewerBox?.height ?? 0) / 2 + 40,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(async () => screenCanvas.getAttribute('data-camera-x'))
    .not.toBe(beforeCameraX);
  const zoomedScale = await screenCanvas.getAttribute('data-camera-scale');
  await page.getByRole('button', { name: 'Chiudi anteprima' }).click();

  await page.getByRole('button', { name: 'Manda in onda' }).click();
  await expect.poll(async () => screenCanvas.getAttribute('data-camera-scale'))
    .not.toBe(zoomedScale);

  await page.getByRole('button', { name: 'Blackout' }).click();
  await expect(screen).toHaveAttribute('data-blackout', 'true', { timeout: 10_000 });
  await expect(onAir).toHaveText('BLACKOUT');
  await expect(onAir).not.toHaveClass(/is-onair/);
  await page.getByRole('button', { name: 'Riacendi schermo' }).click();
  await expect(screen).toHaveAttribute('data-blackout', 'false', { timeout: 10_000 });
  await expect(onAir).toHaveText('ON AIR');
  await expect(onAir).toHaveClass(/is-onair/);

  const beforeToken = await screen.getAttribute('data-token-summary');
  await request.post(`/api/v1/campaigns/${fixture.campaignId}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase7-move',
      sceneId: fixture.sceneId,
      action: { type: 'token.move', tokenId: fixture.tokenId, x: 5, y: 4 },
    },
  });
  await expect.poll(async () => screen.getAttribute('data-token-summary'))
    .not.toBe(beforeToken);
  const scene = await snapshot(request, fixture.sceneId);
  expect(scene.state.tokens[0]?.x).toBe(5);
  await display.close();
  await expect(onAir).toHaveText('OFF AIR');
});

test('con più schermi Manda in onda chiede il target', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const fixture = await createSceneFixture(request);
  await page.goto(`/dm/campaigns/${fixture.campaignId}`);
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible({ timeout: 15_000 });

  const [first] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
  await first.waitForURL(/\/display\//);
  await first.waitForLoadState('domcontentloaded');
  const [second] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
  await second.waitForURL(/\/display\//);
  await second.waitForLoadState('domcontentloaded');
  const screenList = page.locator('#sidebar-screens');
  await expect(screenList.locator('.screen-row')).toHaveCount(2, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Manda in onda' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Manda in onda su…' })).toBeVisible();
  const rows = dialog.locator('.screen-row');
  await expect(rows).toHaveCount(2);
  const firstCode = new URL(first.url()).pathname.split('/').filter(Boolean).at(-1) ?? '';
  const firstVersion = await first.locator('.display').getAttribute('data-composition-version');
  const secondVersion = await second.locator('.display').getAttribute('data-composition-version');
  await rows.filter({ hasText: firstCode }).click();

  await expect(first.locator('.display .scene-canvas')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => first.locator('.display').getAttribute('data-composition-version'))
    .not.toBe(firstVersion);
  await expect(second.locator('.display')).toHaveAttribute('data-composition-version', secondVersion ?? '');

  await first.close();
  await second.close();
});

test('lo zoom resta relativo al fit anche con mappe a bassa risoluzione', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const fixture = await createSceneFixture(request, { width: 474, height: 276 });
  await page.goto(`/dm/campaigns/${fixture.campaignId}`);
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible({ timeout: 15_000 });

  const [display] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
  await display.waitForURL(/\/display\//);
  await display.waitForLoadState('domcontentloaded');
  const screen = display.locator('.display');
  await expect(screen).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Manda in onda' }).click();
  const canvas = screen.locator('.scene-canvas');
  await expect(canvas).toBeVisible({ timeout: 10_000 });

  // 100% coincide con il fit: la mappa piccola riempie lo schermo, senza il
  // vecchio tetto assoluto di scala che si esauriva subito.
  const fit = Math.min(1280 / 474, 720 / 276);
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-scale')))
    .toBeCloseTo(fit, 1);

  await page.locator('#sidebar-screens .screen-row').first().click();
  const viewer = page.getByRole('dialog').locator('.screen-viewer');
  await expect(viewer.locator('.scene-canvas')).toBeVisible({ timeout: 10_000 });
  await viewer.hover();
  for (let tick = 0; tick < 8; tick += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  const dialogZoom = Number(await viewer.getAttribute('data-zoom'));
  expect(dialogZoom).toBeGreaterThan(1.5);
  await expect.poll(async () => Number(await canvas.getAttribute('data-camera-scale')))
    .toBeCloseTo(fit * dialogZoom, 1);

  await display.close();
});

test('la scheda converte velocità, sensi e portata nella unità metrica', async ({ page, request }) => {
  const fixture = await createSceneFixture(request);
  await page.addInitScript(() => {
    localStorage.setItem('dnd-vtt.measurement-unit', 'metric');
  });
  await page.goto(`/dm/campaigns/${fixture.campaignId}/actors/${fixture.actorId}/sheet`);
  await expect(page.getByRole('heading', { level: 1, name: 'Goblin Palco' })).toBeVisible();
  await expect(page.locator('.stat-grid')).toContainText('9 m');
  await expect(page.locator('.stat-grid')).toContainText('Scurovisione 18 m');

  await page.getByRole('button', { name: 'Tratti e azioni' }).click();
  await expect(page.locator('.feature-row', { hasText: 'Scimitarra' }))
    .toContainText('reach 1,5 m.');
});
