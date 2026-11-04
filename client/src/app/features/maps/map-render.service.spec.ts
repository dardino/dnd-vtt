import { TestBed } from '@angular/core/testing';
import {
  emptyMapDocumentV2,
  type Asset,
  type Map,
  type MapDocument,
  type MapGraphic,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AssetService } from '../../core/services/asset.service';
import { textFontStack } from './map-text-fonts';
import { MapRenderService } from './map-render.service';

const MAP_ID = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444';
const THUMB_ID = '55555555-5555-4555-8555-555555555555';
const COMPOSITE_ID = '66666666-6666-4666-8666-666666666666';
const THUMB_MARKER = '640x320';
const COMPOSITE_MARKER = '4096x2048';

const asset: Asset = {
  id: THUMB_ID,
  hash: 'a'.repeat(64),
  mime: 'image/webp',
  bytes: 1024,
  width: 640,
  height: 320,
  url: '/uploads/webp/a.webp',
  previewUrl: '/uploads/previews/a.webp',
  thumbUrl: '/uploads/thumbs/a.webp',
  createdAt: '2026-11-04T00:00:00.000Z',
};

const mapFor = (doc: MapDocument): Map => ({
  ...doc,
  id: MAP_ID,
  campaignId: CAMPAIGN_ID,
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
});

const polygonGraphic = (
  overrides: Partial<Omit<PolygonGraphic, 'kind' | 'id'>> = {},
): PolygonGraphic => ({
  kind: 'polygon',
  id: 'poligono-1',
  points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 0,
  ...overrides,
});

const textGraphic = (
  overrides: Partial<Omit<TextGraphic, 'kind' | 'id'>> = {},
): TextGraphic => ({
  kind: 'text',
  id: 'testo-1',
  text: 'Sala',
  fontFamily: 'serif',
  fontSize: 32,
  color: '#ffcc00',
  x: 140,
  y: 210,
  opacity: 1,
  z: 0,
  ...overrides,
});

const docWithGraphics = (
  items: MapGraphic[],
  layerOpacity = 1,
): MapDocument => {
  const base = emptyMapDocumentV2('Mappa', null, 800, 600);
  const [background, graphics, constraints, elements] = base.layers;
  return {
    ...base,
    layers: [
      background,
      { ...graphics, opacity: layerOpacity, items },
      constraints,
      elements,
    ],
  };
};

const assetsWith = (items: MapGraphic[]): {
  background: null;
  graphics: Array<{ item: MapGraphic; image: null }>;
} => ({
  background: null,
  graphics: items.map((item) => ({ item, image: null })),
});

interface CanvasCapture {
  width: number;
  height: number;
  type: string;
}

/** Chiamata o assegnazione di proprietà sul contesto 2D, in ordine di esecuzione. */
export interface CanvasOp {
  type: 'call' | 'set';
  name: string;
  args?: unknown[];
  value?: unknown;
}

/**
 * jsdom non implementa canvas: sostituiamo getContext/toBlob alla radice.
 * Il contenuto del blob codifica le dimensioni, così l'upload può distinguere
 * thumbnail e composito senza dipendere dall'ordine o dal nome del file.
 * `ops` conserva anche gli argomenti e le assegnazioni (`font`, `globalAlpha`)
 * necessari a verificare i comandi grafici, non solo i nomi dei metodi.
 */
const installCanvas = (): {
  captures: CanvasCapture[];
  calls: string[];
  ops: CanvasOp[];
} => {
  const captures: CanvasCapture[] = [];
  const calls: string[] = [];
  const ops: CanvasOp[] = [];
  const context = new Proxy<Record<PropertyKey, unknown>>({}, {
    get(target, property) {
      const existing = target[property];
      if (existing !== undefined) {
        return existing;
      }
      const method = (...args: unknown[]): void => {
        calls.push(String(property));
        ops.push({ type: 'call', name: String(property), args });
      };
      target[property] = method;
      return method;
    },
    set(target, property, value) {
      ops.push({ type: 'set', name: String(property), value });
      target[property] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
  ): void {
    const resolved = type ?? 'image/png';
    captures.push({ width: this.width, height: this.height, type: resolved });
    callback(new Blob([`${this.width}x${this.height}`], { type: resolved }));
  });
  return { captures, calls, ops };
};

const callIndex = (ops: readonly CanvasOp[], name: string, from = 0): number =>
  ops.findIndex((op, index) => index >= from && op.type === 'call' && op.name === name);

const callArgs = (ops: readonly CanvasOp[], name: string): unknown[][] =>
  ops.filter((op) => op.type === 'call' && op.name === name).map((op) => op.args ?? []);

/** `save` attivi prima dell'operazione: un comando con save proprio sta a 2. */
const depthAt = (ops: readonly CanvasOp[], index: number): number =>
  ops.slice(0, index).reduce((depth, op) => {
    if (op.type !== 'call') {
      return depth;
    }
    return depth + (op.name === 'save' ? 1 : 0) - (op.name === 'restore' ? 1 : 0);
  }, 0);

/** Indice del `save` che racchiude l'operazione indicata, `-1` se assente. */
const enclosingSave = (ops: readonly CanvasOp[], index: number): number => {
  const target = depthAt(ops, index) - 1;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const op = ops[cursor];
    if (op?.type === 'call' && op.name === 'save' && depthAt(ops, cursor) === target) {
      return cursor;
    }
  }
  return -1;
};

const lastSetBetween = (
  ops: readonly CanvasOp[],
  from: number,
  to: number,
  name: string,
): unknown => {
  for (let cursor = to - 1; cursor > from; cursor -= 1) {
    const op = ops[cursor];
    if (op?.type === 'set' && op.name === name) return op.value;
  }
  return undefined;
};

describe('MapRenderService', () => {
  let service: MapRenderService;
  let captures: CanvasCapture[];
  let calls: string[];
  let ops: CanvasOp[];
  let failMarker: string | null = null;
  let upload: Mock<(file: File) => Promise<Asset>>;

  beforeEach(() => {
    failMarker = null;
    ({ captures, calls, ops } = installCanvas());
    upload = vi.fn(async (file: File): Promise<Asset> => {
      const marker = await file.text();
      if (failMarker === 'all' || marker === failMarker) {
        throw new Error(`upload ${marker} fallito`);
      }
      return { ...asset, id: marker === THUMB_MARKER ? THUMB_ID : COMPOSITE_ID };
    });
    TestBed.configureTestingModule({
      providers: [
        MapRenderService,
        { provide: AssetService, useValue: { upload } },
      ],
    });
    service = TestBed.inject(MapRenderService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('genera composito 4096 e thumbnail 640 in WebP e restituisce gli id', async () => {
    const doc = emptyMapDocumentV2('Mappa', null, 8000, 4000);

    const result = await service.renderAndUpload(mapFor(doc), doc, {
      background: null,
      graphics: [],
    });

    expect(captures).toHaveLength(2);
    expect(captures).toEqual(expect.arrayContaining([
      { width: 4096, height: 2048, type: 'image/webp' },
      { width: 640, height: 320, type: 'image/webp' },
    ]));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(calls).toContain('fillRect');
    const files = upload.mock.calls.map(([file]) => file);
    expect(files.every((file) => file.type === 'image/webp')).toBe(true);
    expect(result).toEqual({
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
      warnings: [],
    });
  });

  it('restituisce il composito quando fallisce solo il caricamento della thumbnail', async () => {
    const doc = emptyMapDocumentV2('Mappa', null, 8000, 4000);
    failMarker = THUMB_MARKER;

    const result = await service.renderAndUpload(mapFor(doc), doc, {
      background: null,
      graphics: [],
    });

    expect(result.thumbAssetId).toBeNull();
    expect(result.compositeAssetId).toBe(COMPOSITE_ID);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/thumb/i);
  });

  it('restituisce la thumbnail quando fallisce solo il composito', async () => {
    const doc = emptyMapDocumentV2('Mappa', null, 8000, 4000);
    failMarker = COMPOSITE_MARKER;

    const result = await service.renderAndUpload(mapFor(doc), doc, {
      background: null,
      graphics: [],
    });

    expect(result.thumbAssetId).toBe(THUMB_ID);
    expect(result.compositeAssetId).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/composi/i);
  });

  it('restituisce entrambi null e due warning quando falliscono i due upload', async () => {
    const doc = emptyMapDocumentV2('Mappa', null, 8000, 4000);
    failMarker = 'all';

    const result = await service.renderAndUpload(mapFor(doc), doc, {
      background: null,
      graphics: [],
    });

    expect(result).toEqual({
      thumbAssetId: null,
      compositeAssetId: null,
      warnings: [expect.stringMatching(/thumb/i), expect.stringMatching(/composi/i)],
    });
  });

  it('non lancia e non carica nulla se il contesto canvas non è disponibile', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const doc = emptyMapDocumentV2('Mappa', null, 800, 600);

    const result = await service.renderAndUpload(mapFor(doc), doc, {
      background: null,
      graphics: [],
    });

    expect(result.thumbAssetId).toBeNull();
    expect(result.compositeAssetId).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(upload).not.toHaveBeenCalled();
    expect(captures).toEqual([]);
  });

  it('disegna i poligoni con path, stile e opacità dentro save/restore', async () => {
    const item = polygonGraphic({
      points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
      fill: '#4ea1ff',
      opacity: 0.4,
    });
    const doc = docWithGraphics([item], 0.5);

    await service.renderAndUpload(mapFor(doc), doc, assetsWith([item]));

    const fillIndex = callIndex(ops, 'fill');
    expect(fillIndex).toBeGreaterThan(-1);
    expect(callIndex(ops, 'beginPath')).toBeLessThan(fillIndex);
    expect(callIndex(ops, 'moveTo')).toBeLessThan(fillIndex);
    expect(callIndex(ops, 'closePath')).toBeLessThan(fillIndex);
    expect(callIndex(ops, 'stroke')).toBeGreaterThan(fillIndex);

    expect(callArgs(ops, 'moveTo')[0]).toEqual([70, 70]);
    expect(callArgs(ops, 'lineTo').slice(0, 2)).toEqual([[210, 70], [210, 140]]);

    // Il comando ha un save proprio: disegna a profondità 2, non a 1.
    expect(depthAt(ops, fillIndex)).toBe(2);
    const saveIndex = enclosingSave(ops, fillIndex);
    expect(saveIndex).toBeGreaterThan(0);
    expect(lastSetBetween(ops, saveIndex, fillIndex, 'globalAlpha')).toBeCloseTo(0.2);
    expect(lastSetBetween(ops, saveIndex, fillIndex, 'fillStyle')).toBe('#4ea1ff');
    expect(lastSetBetween(ops, saveIndex, fillIndex, 'strokeStyle'))
      .toEqual(expect.any(String));
    expect(
      ops.slice(saveIndex + 1, fillIndex)
        .filter((op) => op.type === 'call')
        .map((op) => op.name),
    ).toEqual(expect.arrayContaining(['beginPath', 'moveTo', 'lineTo', 'closePath']));

    const saves = ops.filter((op) => op.type === 'call' && op.name === 'save');
    const restores = ops.filter((op) => op.type === 'call' && op.name === 'restore');
    expect(restores).toHaveLength(saves.length);
  });

  it('disegna i testi con font, baseline top e angolo in alto a sinistra', async () => {
    const item = textGraphic({
      text: 'Sala',
      fontFamily: 'serif',
      fontSize: 32,
      color: '#ffcc00',
      x: 140,
      y: 210,
      opacity: 0.5,
    });
    const doc = docWithGraphics([item], 0.5);

    await service.renderAndUpload(mapFor(doc), doc, assetsWith([item]));

    const textIndex = callIndex(ops, 'fillText');
    expect(textIndex).toBeGreaterThan(-1);
    expect(callArgs(ops, 'fillText')[0]).toEqual(['Sala', 140, 210]);

    expect(depthAt(ops, textIndex)).toBe(2);
    const saveIndex = enclosingSave(ops, textIndex);
    expect(saveIndex).toBeGreaterThan(0);
    expect(lastSetBetween(ops, saveIndex, textIndex, 'font'))
      .toBe(`32px ${textFontStack('serif')}`);
    expect(lastSetBetween(ops, saveIndex, textIndex, 'textBaseline')).toBe('top');
    expect(lastSetBetween(ops, saveIndex, textIndex, 'fillStyle')).toBe('#ffcc00');
    expect(lastSetBetween(ops, saveIndex, textIndex, 'globalAlpha')).toBeCloseTo(0.25);
  });

  it('rispetta l’ordine z fra poligono e testo', async () => {
    const polygonItem = polygonGraphic({ z: 0 });
    const textItem = textGraphic({ z: 1, text: 'Dopo' });
    const doc = docWithGraphics([textItem, polygonItem]);

    await service.renderAndUpload(mapFor(doc), doc, assetsWith([textItem, polygonItem]));

    const fillIndex = callIndex(ops, 'fill');
    const textIndex = callIndex(ops, 'fillText');
    expect(fillIndex).toBeGreaterThan(-1);
    expect(textIndex).toBeGreaterThan(fillIndex);
  });

  it('non disegna l’immagine mancante ma completa poligono e testo', async () => {
    const missingImage: MapGraphic = {
      kind: 'image',
      id: 'immagine-1',
      assetId: '99999999-9999-4999-8999-999999999999',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      z: 0,
    };
    const polygonItem = polygonGraphic({ z: 1 });
    const textItem = textGraphic({ z: 2 });
    const doc = docWithGraphics([missingImage, polygonItem, textItem]);

    await service.renderAndUpload(
      mapFor(doc),
      doc,
      assetsWith([missingImage, polygonItem, textItem]),
    );

    expect(callIndex(ops, 'drawImage')).toBe(-1);
    expect(callIndex(ops, 'fill')).toBeGreaterThan(-1);
    expect(callIndex(ops, 'fillText')).toBeGreaterThan(-1);
  });
});
