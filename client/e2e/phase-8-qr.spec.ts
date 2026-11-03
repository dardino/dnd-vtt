import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { createCampaign, ensurePc } from './fixtures.js';

test.describe.configure({ mode: 'serial' });

const WARNING_TEXT = 'Il link usa PUBLIC_URL e il telefono potrebbe non raggiungerlo';

/**
 * Apre la scheda del PC su una campagna dedicata, così i test non condividono
 * link attivi (che sono per attore) e restano indipendenti dall'ordine.
 */
const openSheet = async (
  page: Page,
  request: APIRequestContext,
  campaignName: string,
  actorName: string,
): Promise<string> => {
  const campaignId = await createCampaign(request, {
    name: campaignName,
    description: 'QR scheda giocatore',
  });
  const actorId = await ensurePc(request, campaignId, actorName);
  await page.goto(`/dm/campaigns/${campaignId}/actors/${actorId}/sheet`);
  await expect(page.getByRole('heading', { level: 1, name: actorName })).toBeVisible();
  return actorId;
};

/**
 * Crea il link oppure rigenera quello già attivo (unica azione possibile
 * quando il token non è più in memoria dopo un reload).
 */
const shareOrRegenerate = async (page: Page): Promise<string> => {
  const shareButton = page.getByRole('button', { name: 'Condividi scheda' });
  if (await shareButton.isVisible()) {
    await shareButton.click();
  } else {
    await page.getByRole('button', { name: 'Rigenera link e QR' }).click();
    await page.getByRole('button', { name: 'Conferma' }).click();
  }
  const urlInput = page.getByLabel('URL scheda giocatore');
  await expect(urlInput).toBeVisible();
  return urlInput.inputValue();
};

test('mostra il QR della scheda condivisa', async ({ page, request }) => {
  await openSheet(page, request, 'E2E QR condivisione', 'E2E QR Giocatore');

  await page.getByRole('button', { name: 'Condividi scheda' }).click();
  const urlInput = page.getByLabel('URL scheda giocatore');
  await expect(urlInput).toBeVisible();
  const url = await urlInput.inputValue();
  expect(url).toContain('/play/');

  await expect(page.locator('app-qr-code svg[role="img"]')).toBeVisible();

  const player = await page.context().newPage();
  await player.goto(url);
  await expect(player.getByRole('heading', { level: 1, name: 'E2E QR Giocatore' })).toBeVisible();
  await player.close();
});

test('la rigenerazione invalida il link precedente', async ({ page, request }) => {
  await openSheet(page, request, 'E2E QR rotazione', 'E2E QR Rotazione');

  const previous = await shareOrRegenerate(page);
  await page.getByRole('button', { name: 'Rigenera link e QR' }).click();
  await page.getByRole('button', { name: 'Conferma' }).click();

  const urlInput = page.getByLabel('URL scheda giocatore');
  await expect(urlInput).not.toHaveValue(previous);
  const current = await urlInput.inputValue();
  expect(current).not.toBe(previous);

  await page.goto(previous);
  await expect(page.getByText('Questo link non è più valido.')).toBeVisible();
});

test('avvisa quando PUBLIC_URL è loopback', async ({ page, request }) => {
  await openSheet(page, request, 'E2E QR loopback', 'E2E QR Loopback');

  await page.getByRole('button', { name: 'Condividi scheda' }).click();
  await expect(page.getByLabel('URL scheda giocatore')).toBeVisible();
  await expect(page.getByText(WARNING_TEXT)).toBeVisible();
});
