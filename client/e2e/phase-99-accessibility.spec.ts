import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { campaignId, ensureScene } from './fixtures.js';
import {
  clickCell,
  createMapFixture,
  openMapEditor,
  selectTool,
} from './map-editor-helpers.js';

const CAMPAIGN_NAME = 'E2E Accessibilità';

/**
 * WCAG 2.x livelli A e AA. `wcag22aa` include anche 2.0/2.1, ma i tag restano
 * espliciti per rendere leggibile quali criteri vengono controllati.
 * `wcag22a` non è esposto da axe-core 4.14: i criteri 2.2 A arrivano da `wcag22aa`.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface AuditOptions {
  /** Limita l'analisi a un sottoalbero: utile per pannelli e dialog. */
  include?: string;
}

const audit = async (
  page: Page,
  route: string,
  options: AuditOptions = {},
): Promise<void> => {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (options.include !== undefined) {
    builder = builder.include(options.include);
  }
  const { violations } = await builder.analyze();
  const blocking = violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const details = blocking.map((violation) => {
    const targets = violation.nodes
      .map((node) => `${node.target.join(' ')} → ${node.failureSummary ?? ''}`)
      .join('\n  ');
    return `${violation.id} (${violation.impact}): ${violation.help}\n  ${targets}`;
  });
  expect(details, `${route}: violazioni a11y serious/critical\n${details.join('\n')}`).toEqual([]);
};

const accessCampaign = async (request: APIRequestContext): Promise<string> => {
  const id = await campaignId(request, {
    name: CAMPAIGN_NAME,
    description: 'Fixture accessibilità',
  });
  await ensureScene(request, id, { name: 'Arena accessibile' });
  return id;
};

test.describe.configure({ mode: 'serial' });

test('la console DM non ha violazioni serious o critical', async ({ page, request }) => {
  test.setTimeout(60_000);
  const id = await accessCampaign(request);
  await page.goto(`/dm/campaigns/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: CAMPAIGN_NAME })).toBeVisible();
  await expect(page.locator('.scene-canvas')).toBeVisible();

  await audit(page, '/dm');
});

test('la scelta campagna non ha violazioni serious o critical', async ({ page, request }) => {
  test.setTimeout(60_000);
  await accessCampaign(request);
  await page.goto('/dm');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Scegli campagna' })).toBeVisible();

  await audit(page, '/dm (Scegli campagna)');
});

test("l'elenco mappe non ha violazioni serious o critical", async ({ page, request }) => {
  test.setTimeout(60_000);
  const id = await accessCampaign(request);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['dnd-vtt.lastCampaignId', id] as const,
  );
  await page.goto('/maps');
  await expect(page.getByRole('heading', { level: 1, name: 'Mappe' })).toBeVisible();
  await expect(page.getByText('Caricamento mappe.')).toBeHidden();

  await audit(page, '/maps');
});

test('lo schermo display non ha violazioni serious o critical', async ({ page, request }) => {
  test.setTimeout(60_000);
  const id = await accessCampaign(request);
  const created = await request.post(`/api/v1/campaigns/${id}/displays`, {
    data: { label: 'Display accessibile' },
  });
  expect(created.status()).toBe(201);
  const display = await created.json() as { code: string };

  await page.goto(`/display/${display.code}`);
  await expect(page.locator('.display__stage')).toBeVisible({ timeout: 15_000 });

  await audit(page, '/display/:code');
});

test('il pannello layer e il dialog loot non hanno violazioni serious o critical', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const id = await accessCampaign(request);
  const map = await createMapFixture(request, id, {
    name: 'Mappa accessibile',
    preset: '720p',
  });

  await openMapEditor(page, map.id);
  await audit(page, '/maps/:id (pannello layer)', { include: '.layer-panel' });

  await page.locator('.layer-panel__row[data-kind="elements"] .layer-panel__activate').click();
  await selectTool(page, 'Oggetti', 'loot');
  await clickCell(page, { x: 2, y: 2 });
  await expect(page.locator('.loot-dialog')).toBeVisible();

  await audit(page, '/maps/:id (dialog loot)', { include: '.loot-dialog' });
});
