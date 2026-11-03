import { expect, test } from '@playwright/test';
import { campaignId, ensureScene, openCampaign } from './fixtures.js';

/** Glifi tipografici sostituiti dalle emoji nella console DM. */
const LEGACY_GLYPHS = ['↖', '⌁', '◐', '◑', '▭', '⬠', '✎', '⭳', '↶', '↷'];
const EMOJI = /\p{Extended_Pictographic}/u;

test('la console DM usa emoji al posto dei glifi tipografici', async ({ page, request }) => {
  const id = await campaignId(request);
  await ensureScene(request, id);
  await openCampaign(page, { createIfMissing: false });

  const tools = page.locator('.scene-toolbar .tool');
  await expect(tools.first()).toBeVisible();
  const toolTexts = await tools.allTextContents();
  expect(toolTexts.length).toBeGreaterThan(0);
  for (const text of toolTexts) {
    expect(text.trim()).not.toBe('');
    expect(text).toMatch(EMOJI);
    for (const glyph of LEGACY_GLYPHS) {
      expect(text, `glifo ${glyph} ancora presente`).not.toContain(glyph);
    }
  }

  const measure = page.getByRole('button', { name: 'Misura distanza' });
  await expect(measure).toBeVisible();
  await expect(measure).toHaveAttribute('title', 'Misura distanza');

  const chevrons = page.locator('.accordion__chevron');
  const chevronTexts = await chevrons.allTextContents();
  expect(chevronTexts.length).toBeGreaterThan(0);
  for (const text of chevronTexts) {
    expect(text).toMatch(/^[▾▸]$/);
    expect(text).not.toMatch(EMOJI);
  }

  await expect(page.getByRole('button', { name: /Tema:/ })).toContainText(/🌙|☀️/);

  // Dopo lo split R1 "Crea scena" crea direttamente senza dialog: si usa il
  // dialog impostazioni della toolbar per verificare la chiusura emoji.
  await page.getByRole('button', { name: 'Impostazioni mappa' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('app-map-settings-dialog .dialog__close')).toContainText('✖️');
});
