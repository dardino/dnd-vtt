import type { BlockedArea } from '@dnd-vtt/shared';
import { describe, expect, it } from 'vitest';
import { blockedAreaPoints, blockedAreaRect } from './map-constraints-renderer';

interface Point {
  x: number;
  y: number;
}

const rect = (
  a: Point,
  b: Point,
  id = 'rect-1',
): BlockedArea & { shape: 'rect' } => ({
  id,
  shape: 'rect',
  points: [a, b],
});

const polygon = (
  points: Point[],
  id = 'polygon-1',
): BlockedArea & { shape: 'polygon' } => ({
  id,
  shape: 'polygon',
  points,
});

describe('blockedAreaRect', () => {
  it('converte i due angoli in pixel con cella e offset della griglia', () => {
    const result = blockedAreaRect(rect({ x: 2, y: 3 }, { x: 5, y: 7 }), 50, 10, 20);

    expect(result).toEqual({ x: 110, y: 170, width: 150, height: 200 });
  });

  it('normalizza gli angoli quando il drag è avvenuto in direzione opposta', () => {
    const forward = blockedAreaRect(rect({ x: 2, y: 3 }, { x: 5, y: 7 }), 50, 10, 20);
    const reversed = blockedAreaRect(rect({ x: 5, y: 7 }, { x: 2, y: 3 }), 50, 10, 20);

    expect(reversed).toEqual(forward);
    expect(reversed.width).toBeGreaterThan(0);
    expect(reversed.height).toBeGreaterThan(0);
  });

  it('normalizza i due assi in modo indipendente', () => {
    const result = blockedAreaRect(rect({ x: 5, y: 3 }, { x: 2, y: 7 }), 10, 0, 0);

    expect(result).toEqual({ x: 20, y: 30, width: 30, height: 40 });
  });

  it('accetta un rettangolo di una sola cella', () => {
    const result = blockedAreaRect(rect({ x: 4, y: 4 }, { x: 5, y: 5 }), 70, 0, 0);

    expect(result).toEqual({ x: 280, y: 280, width: 70, height: 70 });
  });

  it('produce dimensioni nulle per due angoli coincidenti', () => {
    const result = blockedAreaRect(rect({ x: 3, y: 3 }, { x: 3, y: 3 }), 20, 5, 5);

    expect(result).toEqual({ x: 65, y: 65, width: 0, height: 0 });
  });

  it('converte coordinate di reticolo negative senza introdurre clamp', () => {
    const result = blockedAreaRect(rect({ x: -2, y: -1 }, { x: 1, y: 2 }), 10, 5, 5);

    expect(result).toEqual({ x: -15, y: -5, width: 30, height: 30 });
  });
});

describe('blockedAreaPoints', () => {
  it('appiattisce i vertici in coppie x,y nell’ordine dato', () => {
    const result = blockedAreaPoints(
      polygon([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }]),
      20,
      3,
      4,
    );

    expect(result).toEqual([3, 4, 43, 4, 43, 24, 3, 24]);
  });

  it('mantiene l’ordine dei vertici senza riordinarli né chiudere il poligono', () => {
    const result = blockedAreaPoints(
      polygon([{ x: 2, y: 2 }, { x: 0, y: 0 }, { x: 2, y: 0 }]),
      10,
      0,
      0,
    );

    expect(result).toEqual([20, 20, 0, 0, 20, 0]);
  });

  it('converte coordinate di reticolo negative senza introdurre clamp', () => {
    const result = blockedAreaPoints(polygon([{ x: -1, y: -2 }, { x: 1, y: 0 }]), 10, 5, 5);

    expect(result).toEqual([-5, -15, 15, 5]);
  });

  it('non muta i punti dell’area', () => {
    const area = polygon([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }]);
    const before = structuredClone(area);

    blockedAreaPoints(area, 70, 0, 0);

    expect(area).toEqual(before);
  });
});
