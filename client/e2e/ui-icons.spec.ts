import { expect, test } from '@playwright/test';
import { campaignId, ensureScene, openCampaign } from './fixtures.js';

/** Glifi tipografici o emoji che non devono più comparire come icone. */
const LEGACY_GLYPHS = [
  '↖', '⌁', '◐', '◑', '▭', '⬠', '✎', '⭳', '↶', '↷',
  '🖱', '📏', '🔲', '➕', '➖', '🖼', '👁', '🌫', '⬜', '🎯', '✏', '📤', '↩', '↪', '⚙',
];

test('la console DM usa Material Symbols', async ({ page, request }) => {
  const id = await campaignId(request);
  await ensureScene(request, id);
  await openCampaign(page, { createIfMissing: false });

  const tools = page.locator('.scene-toolbar .tool');
  await expect(tools.first()).toBeVisible();
  const toolCount = await tools.count();
  expect(toolCount).toBeGreaterThan(0);
  for (let index = 0; index < toolCount; index += 1) {
    const icon = tools.nth(index).locator('.material-symbols-outlined');
    await expect(icon).toHaveCount(1);
    const text = (await icon.textContent())?.trim() ?? '';
    expect(text).not.toBe('');
    for (const glyph of LEGACY_GLYPHS) {
      expect(text).not.toContain(glyph);
    }
  }

  await expect(
    tools.first().locator('.material-symbols-outlined'),
  ).toHaveCSS('font-family', /Material Symbols/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(
    () => document.fonts.check('24px "Material Symbols Outlined"'),
  )).toBe(true);

  const measure = page.getByRole('button', { name: 'Misura distanza' });
  await expect(measure).toBeVisible();
  await expect(measure).toHaveAttribute('title', 'Misura distanza');
  await expect(measure.locator('.material-symbols-outlined')).toHaveText('straighten');

  const chevrons = page.locator('.accordion__chevron');
  const chevronCount = await chevrons.count();
  expect(chevronCount).toBeGreaterThan(0);
  for (let index = 0; index < chevronCount; index += 1) {
    const chevron = chevrons.nth(index);
    await expect(chevron).toHaveClass(/material-symbols-outlined/);
    await expect(chevron).toHaveCSS('font-family', /Material Symbols/);
    await expect(chevron).toHaveText(/keyboard_arrow_down|chevron_right/);
  }

  await expect(page.getByRole('button', { name: /Tema:/ }))
    .toContainText(/dark_mode|light_mode/);

  // Dopo lo split R1 "Crea scena" crea direttamente senza dialog: si usa il
  // dialog impostazioni della toolbar per verificare la chiusura con icona.
  await page.getByRole('button', { name: 'Impostazioni mappa' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('app-map-settings-dialog .dialog__close'))
    .toContainText('close');
});
