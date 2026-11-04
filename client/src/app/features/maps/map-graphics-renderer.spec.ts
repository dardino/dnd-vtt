import type { MapGraphic } from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import { graphicNodeGeometry, sortedGraphics } from './map-graphics-renderer';

const ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const graphic = (
  id: string,
  overrides: Partial<Omit<MapGraphic, 'id'>> = {},
): MapGraphic => ({
  id,
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
