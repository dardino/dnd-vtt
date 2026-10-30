import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { PcBuild } from '@dnd-vtt/shared';

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
    data: { name: CAMPAIGN_NAME, description: 'Fase 8', advancementMode: 'milestone' },
  });
  return (await created.json() as { id: string }).id;
};

const ensurePc = async (request: APIRequestContext, id: string): Promise<string> => {
  const actorsResponse = await request.get(`/api/v1/actors?campaignId=${id}&limit=200`);
  const existing = (await actorsResponse.json() as { items: { id: string; kind: string; name: string }[] }).items
    .find((actor) => actor.kind === 'pc' && actor.name === 'E2E Giocatore');
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
    data: { name: 'E2E Giocatore', build },
  });
  expect(created.status()).toBe(201);
  return (await created.json() as { id: string }).id;
};

test.describe.configure({ mode: 'serial' });

test('condivide la scheda, modifica note e HP e rispetta la matita', async ({ page, request }) => {
  const id = await campaignId(request);
  const actorId = await ensurePc(request, id);
  await page.goto(`/dm/campaigns/${id}/actors/${actorId}/sheet`);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Giocatore' })).toBeVisible();

  await page.getByRole('button', { name: 'Condividi scheda' }).click();
  const urlInput = page.getByLabel('URL scheda giocatore');
  await expect(urlInput).toBeVisible();
  const url = await urlInput.inputValue();
  expect(url).toContain('/play/');

  const player = await page.context().newPage();
  await player.goto(url);
  await expect(player.getByRole('heading', { level: 1, name: 'E2E Giocatore' })).toBeVisible();
  await player.getByRole('button', { name: 'Note' }).click();
  await player.locator('textarea').fill('Nota privata del giocatore');
  await player.getByRole('button', { name: 'Salva note' }).click();
  await player.reload();
  await player.getByRole('button', { name: 'Note' }).click();
  await expect(player.locator('textarea')).toHaveValue('Nota privata del giocatore');

  await player.getByRole('button', { name: 'Combattimento' }).click();
  const hpBefore = await player.locator('.player__badges .badge').first().textContent();
  await player.getByRole('button', { name: 'Subisci' }).click();
  await expect(player.locator('.player__badges .badge').first()).not.toHaveText(hpBefore ?? '');

  await request.patch(`/api/v1/actors/${actorId}/player-link`, {
    data: { editingEnabled: false },
  });
  await player.reload();
  await expect(player.getByText('sola lettura')).toBeVisible();
  await expect(player.getByRole('button', { name: 'Subisci' })).toBeDisabled();
  await player.close();
});

test('avvia e chiude una sessione e fa export/import della campagna', async ({ page, request }) => {
  await campaignId(request);
  await openCampaign(page);
  await page.locator('.session-card').getByRole('button', { name: 'Avvia sessione' }).click();
  await expect(page.locator('.session-card')).toContainText('in corso');
  await page.locator('.session-card').getByRole('button', { name: 'Termina' }).click();
  await expect(page.locator('.session-card')).not.toContainText('in corso');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta campagna' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  await page.locator('#import-campaign-file').setInputFiles(path ?? '');
  await expect(page.getByRole('heading', { level: 1, name: /import/ })).toBeVisible({ timeout: 20_000 });
});
