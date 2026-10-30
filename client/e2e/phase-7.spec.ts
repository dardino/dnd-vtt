import { expect, test, type APIRequestContext } from '@playwright/test';
import type { SceneSnapshot } from '@dnd-vtt/shared';

const CAMPAIGN_NAME = 'E2E Regia';

const createSceneFixture = async (request: APIRequestContext): Promise<{
  campaignId: string;
  sceneId: string;
  tokenId: string;
}> => {
  const campaignResponse = await request.post('/api/v1/campaigns', {
    data: { name: CAMPAIGN_NAME, description: 'Doppio schermo' },
  });
  const campaignId = (await campaignResponse.json() as { id: string }).id;
  const sceneResponse = await request.post(`/api/v1/campaigns/${campaignId}/scenes`, {
    data: { name: 'Palco', widthPx: 1000, heightPx: 800, fogBase: 'revealed' },
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

  const beforeProgram = await screen.getAttribute('data-program-updated');
  await page.getByRole('button', { name: 'Manda in onda' }).click();
  await expect.poll(async () => screen.getAttribute('data-program-updated'))
    .not.toBe(beforeProgram);

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
