import type {
  GridConfig,
  ImageGraphic,
  MapGraphic,
  PolygonGraphic,
  TextGraphic,
} from '@dnd-vtt/shared';
import { defaultGridConfig } from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import { graphicNodeGeometry, sortedGraphics } from './map-graphics-renderer';
import * as renderer from './map-graphics-renderer';

interface PolygonPointHelper {
  (item: PolygonGraphic, grid: GridConfig): number[];
}

interface TextMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextMetricsHelper {
  (item: TextGraphic): TextMetrics;
}

interface ShapeHelpers {
  graphicPolygonPoints?: PolygonPointHelper;
  graphicTextMetrics?: TextMetricsHelper;
}

const helpers = renderer as unknown as ShapeHelpers;

const polygonPoints = (item: PolygonGraphic, grid: GridConfig): number[] => {
  const helper = helpers.graphicPolygonPoints;
  if (typeof helper !== 'function') {
    throw new Error('graphicPolygonPoints non esportato');
  }
  return helper(item, grid);
};

const textMetrics = (item: TextGraphic): TextMetrics => {
  const helper = helpers.graphicTextMetrics;
  if (typeof helper !== 'function') {
    throw new Error('graphicTextMetrics non esportato');
  }
  return helper(item);
};

const ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const graphic = (
  id: string,
  overrides: Partial<Omit<ImageGraphic, 'id'>> = {},
): ImageGraphic => ({
  id,
  kind: 'image',
  assetId: ASSET_ID,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
  ...overrides,
});

const NATURAL = { width: 200, height: 80 };

const polygonGraphic = (
  overrides: Partial<PolygonGraphic> = {},
): PolygonGraphic => ({
  kind: 'polygon',
  id: 'polygon-1',
  points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 0,
  ...overrides,
});

const textGraphic = (overrides: Partial<TextGraphic> = {}): TextGraphic => ({
  kind: 'text',
  id: 'text-1',
  text: 'Ciao',
  fontFamily: 'sans',
  fontSize: 24,
  color: '#ffffff',
  x: 100,
  y: 50,
  opacity: 1,
  z: 0,
  ...overrides,
});

describe('sortedGraphics', () => {
  it('ordina per z crescente senza mutare l’array di input', () => {
    const items = [graphic('c', { z: 2 }), graphic('a', { z: 0 }), graphic('b', { z: 1 })];

    const sorted: MapGraphic[] = sortedGraphics(items);

    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(items.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(sorted).not.toBe(items);
    expect(sorted[0]).toBe(items[1]);
  });

  it('a parità di z ordina per id crescente', () => {
    const items = [graphic('z', { z: 1 }), graphic('b', { z: 1 }), graphic('a', { z: 1 })];

    const sorted: MapGraphic[] = sortedGraphics(items);

    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'z']);
  });

  it('restituisce un array vuoto per un input vuoto', () => {
    expect(sortedGraphics([])).toEqual([]);
  });

  it('mantiene l’ordine già corretto senza clonare gli elementi', () => {
    const items = [graphic('a', { z: 0 }), graphic('b', { z: 5 })];

    const sorted = sortedGraphics(items);

    expect(sorted).toEqual(items);
    expect(sorted[0]).toBe(items[0]);
    expect(sorted[1]).toBe(items[1]);
  });
});

describe('graphicNodeGeometry', () => {
  it('usa le dimensioni naturali, offset al centro e scala positiva', () => {
    const item = graphic('g1', { x: 30, y: 40, scale: 2, rotation: 30, opacity: 0.4, z: 6 });

    const geometry = graphicNodeGeometry(item, NATURAL);

    expect(geometry).toEqual({
      x: 30,
      y: 40,
      width: 200,
      height: 80,
      offsetX: 100,
      offsetY: 40,
      scaleX: 2,
      scaleY: 2,
      rotation: 30,
      opacity: 0.4,
      zIndex: 6,
    });
  });

  it('inverte scaleX con flip orizzontale', () => {
    const geometry = graphicNodeGeometry(graphic('g', { scale: 1.5, flipH: true }), NATURAL);

    expect(geometry.scaleX).toBe(-1.5);
    expect(geometry.scaleY).toBe(1.5);
  });

  it('inverte scaleY con flip verticale', () => {
    const geometry = graphicNodeGeometry(graphic('g', { scale: 3, flipV: true }), NATURAL);

    expect(geometry.scaleX).toBe(3);
    expect(geometry.scaleY).toBe(-3);
  });

  it('inverte entrambi gli assi con flipH e flipV insieme', () => {
    const geometry = graphicNodeGeometry(
      graphic('g', { scale: 0.5, flipH: true, flipV: true }),
      NATURAL,
    );

    expect(geometry.scaleX).toBe(-0.5);
    expect(geometry.scaleY).toBe(-0.5);
  });

  it('azzera l’offset quando le dimensioni naturali sono nulle', () => {
    const geometry = graphicNodeGeometry(graphic('g'), { width: 0, height: 0 });

    expect(geometry.width).toBe(0);
    expect(geometry.height).toBe(0);
    expect(geometry.offsetX).toBe(0);
    expect(geometry.offsetY).toBe(0);
  });

  it('espone z come zIndex: la firma riceve un solo item, non l’array ordinato', () => {
    // `zIndex` è un campo descrittivo/logico, non applicato a Konva: l'ordine
    // visivo lo garantisce l'ordine dei figli prodotto da `sortedGraphics`
    // (vedi map-editor-canvas.layers.spec.ts). Con questa firma l'unico valore
    // disponibile per il campo è `item.z`.
    expect(graphicNodeGeometry(graphic('g', { z: 42 }), NATURAL).zIndex).toBe(42);
    expect(graphicNodeGeometry(graphic('g', { z: 0 }), NATURAL).zIndex).toBe(0);
  });
});

describe('sortedGraphics con tipi misti', () => {
  it('ordina immagini, poligoni e testi in un unico stack z', () => {
    const items: MapGraphic[] = [
      textGraphic({ id: 'text', z: 2 }),
      polygonGraphic({ id: 'polygon', z: 1 }),
      graphic('image', { z: 0 }),
    ];

    expect(sortedGraphics(items).map((item) => item.id)).toEqual(['image', 'polygon', 'text']);
  });

  it('a parità di z usa l’id come spareggio tra tipi diversi', () => {
    const items: MapGraphic[] = [
      textGraphic({ id: 'z-text', z: 1 }),
      polygonGraphic({ id: 'a-polygon', z: 1 }),
      graphic('m-image', { z: 1 }),
    ];

    expect(sortedGraphics(items).map((item) => item.id))
      .toEqual(['a-polygon', 'm-image', 'z-text']);
  });
});

describe('graphicPolygonPoints', () => {
  it('converte i vertici da celle a pixel usando cella e offset della griglia', () => {
    const grid: GridConfig = {
      ...defaultGridConfig,
      cellSizePx: 10,
      offsetX: 5,
      offsetY: 7,
    };

    expect(polygonPoints(polygonGraphic(), grid)).toEqual([5, 7, 25, 7, 25, 17]);
  });

  it('usa la griglia di default senza arrotondamenti sui vertici interi', () => {
    const item = polygonGraphic({
      points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
    });

    expect(polygonPoints(item, defaultGridConfig)).toEqual([0, 0, 140, 0, 140, 70]);
  });

  it('non muta i vertici originali', () => {
    const item = polygonGraphic();
    const before = structuredClone(item);

    polygonPoints(item, defaultGridConfig);

    expect(item).toEqual(before);
  });
});

describe('graphicTextMetrics', () => {
  it('colloca il bounding box stimato sull’angolo in alto a sinistra del testo', () => {
    const metrics = textMetrics(textGraphic({ x: 123, y: 45 }));

    expect(metrics.x).toBe(123);
    expect(metrics.y).toBe(45);
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.height).toBeGreaterThanOrEqual(24);
  });

  it('allarga il bounding box con testi più lunghi', () => {
    const short = textMetrics(textGraphic({ text: 'Ciao' }));
    const long = textMetrics(textGraphic({ text: 'Ciao a tutti' }));

    expect(long.width).toBeGreaterThan(short.width);
    expect(long.height).toBe(short.height);
  });

  it('ingrandisce il bounding box con fontSize maggiore', () => {
    const small = textMetrics(textGraphic({ fontSize: 12 }));
    const large = textMetrics(textGraphic({ fontSize: 48 }));

    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });

  it('è deterministico e non muta il graphic', () => {
    const item = textGraphic();
    const before = structuredClone(item);

    expect(textMetrics(item)).toEqual(textMetrics(item));
    expect(item).toEqual(before);
  });
});
