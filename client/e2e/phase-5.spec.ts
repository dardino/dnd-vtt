import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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
    data: { name: CAMPAIGN_NAME, description: 'Fase 5', advancementMode: 'milestone' },
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
    data: { name: 'Arena Fase 5', widthPx: 1024, heightPx: 768 },
  });
  const sceneId = (await created.json() as { id: string }).id;
  await request.patch(`/api/v1/campaigns/${id}`, { data: { activeSceneId: sceneId } });
  return sceneId;
};

const createGoblin = async (request: APIRequestContext, id: string): Promise<void> => {
  await request.post('/api/v1/actors', {
    data: {
      campaignId: id,
      kind: 'monster',
      name: 'Goblin Fase 5',
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
};

test.describe.configure({ mode: 'serial' });

test('porta un PG dal livello 4 al 5 e applica un riposo lungo', async ({ page }) => {
  await openCampaign(page);
  await page.getByRole('link', { name: 'Crea personaggio' }).click();
  await expect(page.locator('.wizard')).toBeVisible();

  await page.getByLabel('Nome del personaggio').fill('E2E Fase 5');
  await page.getByLabel('Classe').selectOption('fighter');
  await page.getByLabel('Specie').selectOption('human');
  await page.getByLabel('Background').selectOption('soldier');
  await page.getByLabel('Livello iniziale').fill('4');
  await page.getByLabel('Livello iniziale').press('Tab');
  await expect(page.getByLabel('Sottoclasse')).toBeVisible();
  await page.getByLabel('Sottoclasse').selectOption('champion');

  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByLabel('Metodo').selectOption('standardArray');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Equipaggia automaticamente' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Crea personaggio' }).first().click();

  await expect(page.getByRole('heading', { level: 1, name: 'E2E Fase 5' })).toBeVisible();
  await expect(page.locator('.sheet__header')).toContainText('livello 4');

  await page.getByRole('button', { name: 'Sali di livello' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Livello 4');
  await dialog.getByRole('button', { name: 'Conferma level-up' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.sheet__header')).toContainText('livello 5');

  const hpBadge = page.locator('.sheet__badges .badge').first();
  const before = await hpBadge.textContent();
  await page.getByLabel('Danno').fill('5');
  await page.getByRole('button', { name: 'Subisci' }).click();
  await expect(hpBadge).not.toHaveText(before ?? '');
  await page.getByRole('button', { name: 'Riposo lungo' }).click();
  await expect(hpBadge).toHaveText(/HP (\d+)\/\1/);
});

test('tira dadi, gestisce iniziativa e annulla un danno', async ({ page, request }) => {
  const id = await campaignId(request);
  await ensureScene(request, id);
  await createGoblin(request, id);
  await openCampaign(page);

  await page.getByRole('button', { name: 'Tira dadi' }).click();
  const diceDialog = page.getByRole('dialog');
  await expect(diceDialog).toBeVisible();
  await diceDialog.getByLabel('Formula').fill('1d20+5');
  await diceDialog.getByRole('button', { name: 'Tira', exact: true }).click();
  await expect(diceDialog.locator('.dice__total')).toBeVisible();
  await diceDialog.getByRole('button', { name: 'Chiudi' }).click();

  await page.getByRole('button', { name: 'Log dadi' }).click();
  await expect(page.locator('.dice-log')).toContainText('1d20+5');

  const add = page.getByRole('button', { name: 'Aggiungi Goblin Fase 5 alla mappa' });
  await add.click();
  await add.click();
  await expect(page.locator('.token-row', { hasText: 'Goblin Fase 5' })).toHaveCount(2);

  await page.getByRole('button', { name: 'Iniziativa' }).click();
  await page.getByRole('button', { name: 'Tira iniziativa' }).click();
  await expect(page.locator('.initiative__row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Prossimo turno' }).click();
  await page.getByRole('button', { name: 'Prossimo turno' }).click();
  await expect(page.locator('.dock__hint')).toContainText('Round 2');

  await page.getByRole('button', { name: 'Danneggia Goblin Fase 5 di 5' }).first().click();
  await expect(page.locator('.token-row', { hasText: '2/7' })).toHaveCount(1);

  await page.getByRole('button', { name: /Azioni \(/ }).click();
  const damageRow = page.locator('.action-history li', { hasText: 'PF -5' }).first();
  await damageRow.getByRole('button', { name: 'Annulla fino a qui' }).click();
  await expect(page.locator('.token-row', { hasText: '2/7' })).toHaveCount(0);
  await expect(page.locator('.token-row', { hasText: '7/7' })).toHaveCount(2);
});
