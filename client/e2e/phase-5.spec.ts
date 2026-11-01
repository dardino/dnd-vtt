import { expect, test } from '@playwright/test';
import {
  campaignId,
  createGoblin,
  ensureScene,
  openCampaign,
} from './fixtures.js';

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
  const id = await campaignId(request, { description: 'Fase 5' });
  await ensureScene(request, id, { name: 'Arena Fase 5' });
  await createGoblin(request, id, { name: 'Goblin Fase 5' });
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
  const tokenCount = await page.locator('.token-row').count();
  await expect(page.locator('.initiative__row')).toHaveCount(tokenCount);
  for (let index = 0; index < tokenCount; index += 1) {
    await page.getByRole('button', { name: 'Prossimo turno' }).click();
  }
  await expect(page.locator('.dock__hint')).toContainText('Round 2');

  await page.getByRole('button', { name: 'Danneggia Goblin Fase 5 di 5' }).first().click();
  await expect(page.locator('.token-row', { hasText: '2/7' })).toHaveCount(1);

  await page.getByRole('button', { name: /Azioni \(/ }).click();
  const damageRow = page.locator('.action-history li', { hasText: 'PF -5' }).first();
  await damageRow.getByRole('button', { name: 'Annulla fino a qui' }).click();
  await expect(page.locator('.token-row', { hasText: '2/7' })).toHaveCount(0);
  await expect(page.locator('.token-row', { hasText: '7/7' })).toHaveCount(tokenCount);
});
