import { expect, test } from '@playwright/test';
import { campaignId, ensurePc, openCampaign } from './fixtures.js';

test.describe.configure({ mode: 'serial' });

test('condivide la scheda, modifica note e HP e rispetta la matita', async ({ page, request }) => {
  const id = await campaignId(request, { description: 'Fase 8' });
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
  await campaignId(request, { description: 'Fase 8' });
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
