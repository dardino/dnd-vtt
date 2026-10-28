import { expect, test, type Page } from '@playwright/test';

const openCampaign = async (page: Page): Promise<void> => {
  await page.goto('/dm');
  const dialog = page.getByRole('dialog');
  const heading = page.getByRole('heading', { level: 1, name: 'E2E Campagna' });
  await expect(dialog.or(heading)).toBeVisible();
  if (await dialog.isVisible()) {
    if (await dialog.getByRole('heading', { name: 'Crea campagna' }).isVisible()) {
      await dialog.getByLabel('Nome').fill('E2E Campagna');
      await dialog.getByRole('button', { name: 'Crea campagna' }).click();
    } else {
      await dialog.getByRole('button', { name: /E2E Campagna/ }).first().click();
    }
  }
  await expect(heading).toBeVisible();
};

test.describe.configure({ mode: 'serial' });

test('crea un combattente di livello 5 e apre la scheda', async ({ page }) => {
  await openCampaign(page);
  await page.getByRole('link', { name: 'Crea personaggio' }).click();
  await expect(page.locator('.wizard')).toBeVisible();

  await page.getByLabel('Nome del personaggio').fill('E2E Eroe');
  await page.getByLabel('Classe').selectOption('fighter');
  await page.getByLabel('Specie').selectOption('human');
  await page.getByLabel('Background').selectOption('soldier');
  await page.getByLabel('Livello iniziale').fill('5');
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

  await expect(page.getByRole('button', { name: 'Crea personaggio' }).first()).toBeEnabled();
  await page.getByRole('button', { name: 'Crea personaggio' }).first().click();

  await expect(page).toHaveURL(/\/dm\/campaigns\/[0-9a-f-]+\/actors\/[0-9a-f-]+\/sheet$/);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Eroe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Combattimento' })).toBeVisible();

  const combat = page.locator('.stat-grid');
  await expect(combat).toContainText('Classe armatura');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Eroe' })).toBeVisible();
  await page.getByRole('button', { name: 'Equipaggiamento' }).click();
  await expect(page.locator('.plain-list')).toContainText('Chain Mail');
});

test('crea un mostro importato dal catalogo SRD', async ({ page }) => {
  await openCampaign(page);
  await page.getByRole('link', { name: 'Crea mostro' }).click();
  await expect(page.locator('.actor-wizard')).toBeVisible();

  await page.getByLabel('Nome').fill('Goblin di prova');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByPlaceholder('Cerca un mostro…').fill('Goblin');
  await page.getByRole('button', { name: 'Importa' }).first().click();

  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('button', { name: 'Avanti' }).click();
  }
  await page.getByRole('button', { name: 'Crea attore' }).first().click();

  await expect(page).toHaveURL(/\/dm\/campaigns\/[0-9a-f-]+\/actors\/[0-9a-f-]+\/sheet$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Goblin' })).toBeVisible();
});

test('la console tiene i PG negli slot e i mostri fuori mappa', async ({ page }) => {
  await openCampaign(page);
  await expect(page.locator('.slot', { hasText: 'E2E Eroe' })).toBeVisible();
  await expect(page.locator('.slot', { hasText: 'Goblin' })).toHaveCount(0);
  await expect(page.locator('.available-actor', { hasText: 'Goblin' })).toBeVisible();
  await expect(page.locator('.slots')).not.toContainText('Goblin');
});
