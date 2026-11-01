import { expect, test, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import {
  emptyMapDocument,
  type MapDocument,
  type PcBuild,
} from '@dnd-vtt/shared';
import { campaignId } from './fixtures.js';

const CAMPAIGN_NAME = 'E2E Mappe e visione';
const CELL = 70;

const campaignFixture = { name: CAMPAIGN_NAME, description: 'Mappe e visione' } as const;

const ensurePc = async (request: APIRequestContext, id: string): Promise<string> => {
  const actorsResponse = await request.get(`/api/v1/actors?campaignId=${id}&limit=200`);
  const existing = (await actorsResponse.json() as { items: { id: string; kind: string; name: string }[] }).items
    .find((actor) => actor.kind === 'pc' && actor.name === 'E2E Esploratore');
  if (existing !== undefined) {
    return existing.id;
  }
  const classes = await request.get('/api/v1/srd/srd-5.2.0/classes');
  const items = await request.get('/api/v1/srd/srd-5.2.0/items');
  const fighter = (await classes.json() as { id: string; weaponMasteryCount: number[] }[])
    .find((entry) => entry.id === 'fighter');
  const weapons = (await items.json() as { id: string; category: string }[])
    .filter((item) => item.category === 'weapon')
    .slice(0, fighter?.weaponMasteryCount[4] ?? 0)
    .map((item) => item.id);
  const build: PcBuild = {
    rulesVersion: 'srd-5.2.0',
    level: 5,
    classId: 'fighter',
    subclassId: 'champion',
    speciesId: 'human',
    backgroundId: 'soldier',
    abilityGeneration: {
      method: 'pointBuy',
      base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
    },
    backgroundIncreases: [
      { source: 'background', ability: 'str', amount: 2 },
      { source: 'background', ability: 'con', amount: 1 },
    ],
    feats: [{ id: 'savage-attacker' }],
    proficiencies: {
      classSkills: ['athletics', 'perception'],
      speciesSkills: ['insight'],
      expertise: [],
      tools: [],
      languages: ['elvish', 'dwarvish'],
    },
    asiChoices: [
      { level: 4, type: 'asi', increases: [{ source: 'asi', ability: 'str', amount: 2 }] },
    ],
    weaponMasteries: weapons,
    equipment: [
      { itemId: 'longsword', quantity: 1 },
      { itemId: 'chain-mail', quantity: 1 },
      { itemId: 'shield', quantity: 1 },
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
    budgetGp: 155,
    spells: { cantrips: [], known: [], prepared: [], spellbook: [] },
    hpRolls: [7, 8, 6, 9],
  };
  const created = await request.post(`/api/v1/campaigns/${id}/actors`, {
    data: { name: 'E2E Esploratore', build },
  });
  expect(created.status()).toBe(201);
  return (await created.json() as { id: string }).id;
};

const createMap = async (
  request: APIRequestContext,
  campaign: string,
  pc: string,
): Promise<{ mapId: string; sceneId: string }> => {
  const png = await sharp({
    create: { width: 1400, height: 1400, channels: 3, background: '#242424' },
  }).png().toBuffer();
  const assetResponse = await request.post('/api/v1/assets', {
    multipart: { file: { name: 'visione.png', mimeType: 'image/png', buffer: png } },
  });
  expect(assetResponse.status()).toBe(201);
  const asset = await assetResponse.json() as { id: string };
  const mapResponse = await request.post(`/api/v1/campaigns/${campaign}/maps`, {
    data: { name: 'Mappa visione', imageAssetId: asset.id },
  });
  expect(mapResponse.status()).toBe(201);
  const map = await mapResponse.json() as { id: string; version: number };
  const document: MapDocument = emptyMapDocument('Mappa visione', asset.id, 1400, 1400);
  document.grid = {
    type: 'square',
    cellSizePx: CELL,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    diagonalRule: '5-5-5',
    hexOffset: 'odd-r',
  };
  const walls = [
    { id: 'wall-north', kind: 'wall' as const, a: { x: 5, y: 0 }, b: { x: 5, y: 2 } },
    { id: 'door-crypt', kind: 'door' as const, door: 'closed' as const, a: { x: 5, y: 2 }, b: { x: 5, y: 3 } },
    { id: 'wall-south', kind: 'wall' as const, a: { x: 5, y: 3 }, b: { x: 5, y: 9 } },
  ];
  document.terrain = {
    ambientLight: 'dark',
    visionLimitFeet: 120,
    visionEnabled: true,
    walls,
    lights: [{
      id: 'torch-pc',
      x: 2,
      y: 2,
      brightFeet: 20,
      dimFeet: 40,
      color: '#ffcc80',
      enabled: true,
      shape: 'circle',
      angle: 60,
    }],
  };
  document.spawns = [{
    id: 'goblin-hidden',
    kind: 'monster',
    x: 8,
    y: 2,
    source: { type: 'srd', monsterId: 'goblin-warrior' },
    label: 'Goblin dietro la porta',
    size: 1,
    hidden: false,
    quantity: 1,
  }];
  document.playerStarts = [{ id: 'start-1', x: 2, y: 2, label: 'PG 1' }];
  document.startView = { x: 3 * CELL, y: 3 * CELL, zoom: 1 };
  const saved = await request.put(`/api/v1/maps/${map.id}`, {
    data: { version: map.version, document },
  });
  expect(saved.status()).toBe(200);

  const scene = await request.post(`/api/v1/campaigns/${campaign}/scenes/from-map`, {
    data: {
      mapId: map.id,
      name: 'Scena visione',
      playerAssignments: [{ actorId: pc, startId: 'start-1' }],
    },
  });
  expect(scene.status()).toBe(201);
  return {
    mapId: map.id,
    sceneId: (await scene.json() as { sceneId: string }).sceneId,
  };
};

test.describe.configure({ mode: 'serial' });

test('la mappa si apre nell’editor con muri, luci e spawn', async ({ page, request }) => {
  test.setTimeout(60_000);
  const campaign = await campaignId(request, campaignFixture);
  const pc = await ensurePc(request, campaign);
  const { mapId } = await createMap(request, campaign, pc);

  await page.goto(`/maps/${mapId}`);
  await expect(page.locator('.editor')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.editor__title input')).toHaveValue('Mappa visione');
  await expect(page.locator('.editor__status')).toContainText('3 muri');
  await expect(page.locator('.editor__status')).toContainText('1 luci');
  await expect(page.locator('.editor__status')).toContainText('1 spawn');
  await expect(page.locator('.editor__status')).toContainText('1 partenze');

  await page.getByRole('button', { name: 'Muro', exact: true }).click();
  const canvas = page.locator('.map-editor-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute('data-grid-lines')))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Griglia', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-grid-lines', '0');
  await page.getByRole('button', { name: 'Griglia', exact: true }).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-grid-lines')))
    .toBeGreaterThan(0);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const camera = await canvas.evaluate((element) => ({
    scale: Number(element.getAttribute('data-camera-scale')),
    x: Number(element.getAttribute('data-camera-x')),
    y: Number(element.getAttribute('data-camera-y')),
  }));
  const worldStart = { x: 9 * CELL, y: 9 * CELL };
  const worldEnd = { x: 12 * CELL, y: 9 * CELL };
  const screenStart = {
    x: (box?.x ?? 0) + camera.x + worldStart.x * camera.scale,
    y: (box?.y ?? 0) + camera.y + worldStart.y * camera.scale,
  };
  const screenEnd = {
    x: (box?.x ?? 0) + camera.x + worldEnd.x * camera.scale,
    y: (box?.y ?? 0) + camera.y + worldEnd.y * camera.scale,
  };
  await page.mouse.move(screenStart.x, screenStart.y);
  await page.mouse.down();
  await page.mouse.move(screenEnd.x, screenEnd.y, { steps: 6 });
  await expect(page.locator('.editor__status')).toContainText('3 muri');
  await page.mouse.up();
  await expect(page.locator('.editor__status')).toContainText('4 muri');

  const diagonalStart = {
    x: (box?.x ?? 0) + camera.x + 14 * CELL * camera.scale,
    y: (box?.y ?? 0) + camera.y + 11 * CELL * camera.scale,
  };
  const diagonalEnd = {
    x: (box?.x ?? 0) + camera.x + 16 * CELL * camera.scale,
    y: (box?.y ?? 0) + camera.y + 13 * CELL * camera.scale,
  };
  await page.mouse.move(diagonalStart.x, diagonalStart.y);
  await page.mouse.down();
  await page.mouse.move(diagonalEnd.x, diagonalEnd.y, { steps: 6 });
  await expect(page.locator('.editor__status')).toContainText('4 muri');
  await page.mouse.up();

  await expect(page.locator('.editor__status')).toContainText('5 muri');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('.editor__title .badge')).toHaveText('salvata', { timeout: 10_000 });
  const saved = await request.get(`/api/v1/maps/${mapId}`);
  const savedMap = await saved.json() as {
    terrain: { walls: { a: { x: number; y: number }; b: { x: number; y: number } }[] };
  };
  expect(savedMap.terrain.walls).toHaveLength(5);
  expect(savedMap.terrain.walls.some((wall) =>
    wall.a.x === 9 && wall.a.y === 9 && wall.b.x === 12 && wall.b.y === 9)).toBe(true);
  expect(savedMap.terrain.walls.some((wall) =>
    wall.a.x === 14 && wall.a.y === 11 && wall.b.x === 16 && wall.b.y === 13)).toBe(true);
});

test('la visione filtra i token, la porta li rivela e la fog manuale li nasconde', async ({ page, request }) => {
  test.setTimeout(60_000);
  const campaign = await campaignId(request, campaignFixture);
  const pc = await ensurePc(request, campaign);
  const { mapId } = await createMap(request, campaign, pc);
  const campaignResponse = await request.get(`/api/v1/campaigns/${campaign}`);
  const activeSceneId = (await campaignResponse.json() as { activeSceneId: string }).activeSceneId;
  expect(activeSceneId).toBeTruthy();

  const displayResponse = await request.post(`/api/v1/campaigns/${campaign}/displays`, {
    data: { label: 'Display visione' },
  });
  expect(displayResponse.status()).toBe(201);
  const display = await displayResponse.json() as { code: string };

  await page.goto(`/display/${display.code}`);
  const screen = page.locator('.display');
  await expect(screen).toHaveAttribute('data-token-count', '1', { timeout: 15_000 });
  await expect(screen).toHaveAttribute('data-token-summary', /.+/);

  await request.post(`/api/v1/campaigns/${campaign}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase9-door',
      sceneId: activeSceneId,
      action: { type: 'terrain.door', wallId: 'door-crypt', state: 'open' },
    },
  });
  await expect(screen).toHaveAttribute('data-token-count', '2', { timeout: 15_000 });

  await request.post(`/api/v1/campaigns/${campaign}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase9-fog',
      sceneId: activeSceneId,
      action: {
        type: 'fog.apply',
        op: {
          id: crypto.randomUUID(),
          op: 'hide',
          shape: { type: 'cells', cells: [{ x: 8, y: 2 }] },
        },
      },
    },
  });
  await expect(screen).toHaveAttribute('data-token-count', '1', { timeout: 15_000 });

  await request.post(`/api/v1/campaigns/${campaign}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase9-override',
      sceneId: activeSceneId,
      action: { type: 'fog.override', override: 'reveal' },
    },
  });
  await expect(screen).toHaveAttribute('data-token-count', '2', { timeout: 15_000 });
  await request.post(`/api/v1/campaigns/${campaign}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase9-override-none',
      sceneId: activeSceneId,
      action: { type: 'fog.override', override: 'none' },
    },
  });
  await expect(screen).toHaveAttribute('data-token-count', '1', { timeout: 15_000 });
  expect(mapId).toBeTruthy();
});

test('la console avvia una scena da una mappa e assegna i PG', async ({ page, request }) => {
  test.setTimeout(60_000);
  const campaign = await campaignId(request, campaignFixture);
  const pc = await ensurePc(request, campaign);
  await createMap(request, campaign, pc);

  await page.goto(`/dm/campaigns/${campaign}`);
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Avvia da mappa' }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('heading', { name: 'Avvia da mappa' })).toBeVisible();
  await picker.locator('.screen-row', { hasText: 'Mappa visione' }).first().click();

  const prepare = page.getByRole('dialog');
  await expect(prepare.getByRole('heading', { name: 'Prepara scena' })).toBeVisible();
  await expect(prepare.getByText('E2E Esploratore')).toBeVisible();
  await prepare.getByRole('button', { name: 'Avvia scena' }).click();

  await expect(page.locator('.statusbar')).toContainText('Scena avviata', { timeout: 15_000 });
  await expect(page.locator('.scene-list__item.is-active')).toContainText('Mappa visione');
  const campaignResponse = await request.get(`/api/v1/campaigns/${campaign}`);
  const { activeSceneId } = await campaignResponse.json() as { activeSceneId: string };
  const snapshot = await request.get(`/api/v1/scenes/${activeSceneId}`);
  const state = (await snapshot.json() as {
    state: { tokens: { actorId?: string }[] };
  }).state;
  expect(state.tokens.some((token) => token.actorId === pc)).toBe(true);
});

test('un token non attraversa un muro se non forzato', async ({ request }) => {
  const campaign = await campaignId(request, campaignFixture);
  const pc = await ensurePc(request, campaign);
  const { sceneId } = await createMap(request, campaign, pc);
  const snapshot = await request.get(`/api/v1/scenes/${sceneId}`);
  const state = (await snapshot.json() as {
    state: { tokens: { id: string; actorId?: string; x: number; y: number }[] };
  }).state;
  const token = state.tokens.find((entry) => entry.actorId === pc);
  expect(token).toBeDefined();

  const blocked = await request.post(`/api/v1/campaigns/${campaign}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase9-blocked',
      sceneId,
      action: { type: 'token.move', tokenId: token?.id, x: 8, y: 2 },
    },
  });
  expect(blocked.status()).toBe(409);

  const forced = await request.post(`/api/v1/campaigns/${campaign}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase9-forced',
      sceneId,
      action: { type: 'token.move', tokenId: token?.id, x: 8, y: 2, force: true },
    },
  });
  expect(forced.status()).toBe(200);
});
