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

const createSceneFixture = async (request: APIRequestContext): Promise<{
  campaignId: string;
  sceneId: string;
  tokenId: string;
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
      widthPx: 1000,
      heightPx: 800,
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
        senses: {},
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
        actions: [],
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
  return { campaignId, sceneId, tokenId };
};

const snapshot = async (request: APIRequestContext, sceneId: string): Promise<SceneSnapshot> => {
  const response = await request.get(`/api/v1/scenes/${sceneId}`);
  return response.json() as Promise<SceneSnapshot>;
};

test('TAKE, blackout e token aggiornano lo schermo via WebSocket', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const fixture = await createSceneFixture(request);
  await page.goto(`/dm/campaigns/${fixture.campaignId}`);
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible();
  const onAir = page.locator('.dm-topbar__onair');
  await expect(onAir).toHaveText('OFF AIR');

  const [display] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
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

  await page.getByRole('button', { name: 'Manda in onda' }).click();
  await expect(screen.locator('.scene-canvas')).toBeVisible({ timeout: 10_000 });
  await expect(screen).toHaveAttribute('data-token-portraits', '1');

  await screenList.locator('.screen-row').first().click();
  const viewer = page.getByRole('dialog').locator('.screen-viewer');
  await expect(viewer.locator('app-screen-preview')).toBeVisible({ timeout: 10_000 });
  await expect(viewer.locator('.scene-canvas')).toBeVisible();
  const screenCanvas = screen.locator('.scene-canvas');
  const beforeScale = await screenCanvas.getAttribute('data-camera-scale');
  const beforeCameraX = await screenCanvas.getAttribute('data-camera-x');
  const zoomLabel = page.getByRole('dialog').locator('.inline-controls .muted');
  await viewer.hover();
  await page.mouse.wheel(0, -120);
  await expect(zoomLabel).not.toHaveText('Zoom 100%');
  await expect.poll(async () => screenCanvas.getAttribute('data-camera-scale'))
    .not.toBe(beforeScale);
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
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible();

  const [first] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
  await first.waitForLoadState('domcontentloaded');
  const [second] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Apri schermo' }).click(),
  ]);
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
  await rows.filter({ hasText: firstCode }).click();

  await expect(first.locator('.display .scene-canvas')).toBeVisible({ timeout: 10_000 });
  const secondScale = await second.locator('.display .scene-canvas').getAttribute('data-camera-scale');
  expect(secondScale).toBe('1');
  await expect.poll(async () => first.locator('.display .scene-canvas').getAttribute('data-camera-scale'))
    .not.toBe(secondScale);

  await first.close();
  await second.close();
});
