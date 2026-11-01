import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const openCampaign = async (page: Page): Promise<void> => {
  await page.goto('/dm');
  const chooser = page.getByRole('dialog');
  const heading = page.getByRole('heading', { level: 1, name: 'E2E Campagna' });
  await expect(chooser.or(heading)).toBeVisible();
  if (await chooser.isVisible()) {
    await chooser.getByRole('button', { name: /E2E Campagna/ }).first().click();
  }
  await expect(heading).toBeVisible();
};

test('apre la console, crea la prima campagna e la ricorda al reload', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dm$/);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Crea campagna' })).toBeVisible();

  await dialog.getByLabel('Nome').fill('E2E Campagna');
  await dialog.getByLabel('Ambientazione').fill('Una cava sotto la città.');
  await dialog.getByRole('button', { name: 'Crea campagna' }).click();

  await expect(page).toHaveURL(/\/dm\/campaigns\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Campagna' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Campagna' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('senza lastCampaignId sceglie da una campagna esistente', async ({ page }) => {
  await page.goto('/dm');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Scegli campagna' })).toBeVisible();
  await dialog.getByRole('button', { name: /E2E Campagna/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Campagna' })).toBeVisible();
});

test('crea una scena e la mostra come attiva', async ({ page }) => {
  await openCampaign(page);
  await page.getByRole('button', { name: 'Crea scena' }).click();
  const scene = page.locator('.scene-list__item', { hasText: 'Scena 1' });
  await expect(scene).toBeVisible();
  await expect(scene.getByText('attiva')).toBeVisible();
});

test('commuta i tre temi e li applica al documento', async ({ page }) => {
  await openCampaign(page);
  const toggle = page.getByRole('button', { name: /Tema:/ });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await toggle.click();
  const theme = await page.locator('html').getAttribute('data-theme');
  expect(['light', 'dark']).toContain(theme);
});

test('la pagina è servita con nonce CSP e nessuna violazione', async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber} ${event.sample}`,
      );
    });
    Object.assign(window, { __cspViolations: violations });
  });

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  const nonce = await page.locator('meta[name="ngCspNonce"]').getAttribute('content');
  expect(nonce).toBeTruthy();
  expect(nonce).not.toBe('__CSP_NONCE__');
  await page.waitForLoadState('networkidle');
  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
  expect(violations).toEqual([]);
});

test('cambia campagna e riapre la scelta', async ({ page }) => {
  await openCampaign(page);
  await page.getByRole('button', { name: 'Cambia campagna' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /E2E Campagna/ }).first()).toBeVisible();
  await dialog.getByRole('button', { name: /E2E Campagna/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Campagna' })).toBeVisible();
});

test('la console usa un layout a tre colonne e riempie l altezza', async ({ page }) => {
  await openCampaign(page);
  const layout = page.locator('.dm-layout');
  await expect.poll(async () => layout.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns
      .split(' ')
      .filter((entry) => entry !== '').length)).toBe(3);
  const metrics = await layout.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.split(' ').filter((entry) => entry !== '').length,
      bottom: rect.bottom,
      viewport: window.innerHeight,
    };
  });
  expect(metrics.columns).toBe(3);
  expect(metrics.bottom).toBeGreaterThanOrEqual(metrics.viewport - 80);

  const slotsWidth = await page.locator('.slots').evaluate((element) =>
    element.getBoundingClientRect().width);
  const layoutWidth = await layout.evaluate((element) => element.getBoundingClientRect().width);
  expect(slotsWidth).toBeGreaterThan(layoutWidth - 2);

  await page.getByRole('button', { name: 'Riduci pannello campagna' }).click();
  await expect(page.locator('.dm-panel--left .panel-label'))
    .toHaveCSS('writing-mode', 'vertical-rl');
  await page.getByRole('button', { name: 'Apri pannello campagna' }).click();
});

test('il wizard non si ferma a 1440 px su schermi larghi', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCampaign(page);
  const campaignId = page.url().split('/').at(-1) ?? '';
  await page.goto(`/dm/campaigns/${campaignId}/actors/new/pc`);
  const metrics = await page.locator('.wizard').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    maxWidth: getComputedStyle(element).maxWidth,
    viewport: window.innerWidth,
  }));
  expect(metrics.maxWidth).toBe('none');
  expect(metrics.width).toBeGreaterThan(1440);
  expect(metrics.width).toBeGreaterThanOrEqual(metrics.viewport - 80);
});

test('apre il wizard dalla console', async ({ page }) => {
  await openCampaign(page);
  await page.getByRole('link', { name: 'Crea personaggio' }).click();
  await expect(page).toHaveURL(/\/dm\/campaigns\/[0-9a-f-]+\/actors\/new\/pc$/);
  await expect(page.locator('.wizard')).toBeVisible();
});
