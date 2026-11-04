import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { Map, ResolutionPreset } from '@dnd-vtt/shared';
import sharp from 'sharp';

/** Cella di griglia di default (`defaultGridConfig.cellSizePx`). */
export const CELL = 70;

export interface PngFixtureOptions {
  width?: number;
  height?: number;
  color?: string;
  name?: string;
}

export interface MapFixtureOptions {
  name: string;
  preset?: ResolutionPreset;
  widthPx?: number;
  heightPx?: number;
  imageAssetId?: string | null;
}

/**
 * PNG sintetico con dimensioni e colore noti: serve sia come sfondo sia come
 * grafica, senza dipendere da asset esterni.
 */
export const pngFile = async (
  options: PngFixtureOptions = {},
): Promise<{ name: string; mimeType: string; buffer: Buffer }> => {
  const buffer = await sharp({
    create: {
      width: options.width ?? 640,
      height: options.height ?? 640,
      channels: 3,
      background: options.color ?? '#2e4a6b',
    },
  }).png().toBuffer();
  return { name: options.name ?? 'immagine.png', mimeType: 'image/png', buffer };
};

export const uploadPng = async (
  request: APIRequestContext,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<string> => {
  const response = await request.post('/api/v1/assets', { multipart: { file } });
  expect(response.status()).toBe(201);
  return (await response.json() as { id: string }).id;
};

/** Crea una mappa via API: l'editor viene testato sui contenuti, non sulla creazione. */
export const createMapFixture = async (
  request: APIRequestContext,
  campaign: string,
  options: MapFixtureOptions,
): Promise<Map> => {
  const response = await request.post(`/api/v1/campaigns/${campaign}/maps`, {
    data: {
      name: options.name,
      ...(options.preset === undefined ? {} : { preset: options.preset }),
      ...(options.widthPx === undefined ? {} : { widthPx: options.widthPx }),
      ...(options.heightPx === undefined ? {} : { heightPx: options.heightPx }),
      ...(options.imageAssetId === undefined ? {} : { imageAssetId: options.imageAssetId }),
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<Map>;
};

/** Apre l'editor e attende che il canvas Konva abbia una camera e una griglia. */
export const openMapEditor = async (page: Page, mapId: string): Promise<void> => {
  await page.goto(`/maps/${mapId}`);
  await expect(page.locator('.editor')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.layer-panel')).toBeVisible();
  const canvas = page.locator('.map-editor-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(
    async () => Number(await canvas.getAttribute('data-grid-lines')),
    { timeout: 15_000 },
  ).toBeGreaterThan(0);
};

interface EditorCamera {
  left: number;
  top: number;
  scale: number;
  x: number;
  y: number;
}

const camera = async (page: Page): Promise<EditorCamera> => {
  return page.locator('.map-editor-canvas').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      scale: Number(element.getAttribute('data-camera-scale')),
      x: Number(element.getAttribute('data-camera-x')),
      y: Number(element.getAttribute('data-camera-y')),
    };
  });
};

const screenPoint = async (
  page: Page,
  world: { x: number; y: number },
): Promise<{ x: number; y: number }> => {
  const view = await camera(page);
  return {
    x: view.left + view.x + world.x * view.scale,
    y: view.top + view.y + world.y * view.scale,
  };
};

/** Punto di un vertice di griglia (multipli di `CELL`). */
export const latticePoint = async (
  page: Page,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> => screenPoint(page, {
  x: point.x * CELL,
  y: point.y * CELL,
});

/** Centro di una cella: usato dagli strumenti che leggono la cella sotto il mouse. */
export const cellPoint = async (
  page: Page,
  cell: { x: number; y: number },
): Promise<{ x: number; y: number }> => screenPoint(page, {
  x: (cell.x + 0.5) * CELL,
  y: (cell.y + 0.5) * CELL,
});

/**
 * Attiva uno strumento e attende che il canvas figlio riceva il nuovo tool.
 * Il click sulla toolbar aggiorna subito lo stato della pagina, ma il binding
 * verso `app-map-editor-canvas` arriva al ciclo di change detection successivo:
 * senza questa attesa il primo click sul canvas userebbe lo strumento vecchio.
 */
export const selectTool = async (
  page: Page,
  label: string,
  tool: string,
): Promise<void> => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.map-editor-canvas')).toHaveAttribute('data-tool', tool);
};

export const clickCell = async (page: Page, cell: { x: number; y: number }): Promise<void> => {
  const point = await cellPoint(page, cell);
  await page.mouse.click(point.x, point.y);
};

/** Trascina fra due vertici di griglia (muri e aree rettangolari). */
export const dragLattice = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> => {
  const start = await latticePoint(page, from);
  const end = await latticePoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
};

/**
 * Scrive un valore e notifica il binding `(change)` di Angular. Il solo `fill`
 * emette `input`, che i campi numerici dell'editor non ascoltano.
 */
export const commitField = async (
  locator: Locator,
  value: string | number,
): Promise<void> => {
  await locator.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
};
