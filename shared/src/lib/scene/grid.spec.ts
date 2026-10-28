import { describe, expect, it } from 'vitest';
import type { GridConfig } from '../../schemas/scene.js';
import {
  cellCenterPx,
  cubeToOffset,
  distanceFeet,
  hexDistance,
  measureDistance,
  offsetToCube,
  pixelToCell,
  snapTokenCell,
} from './grid.js';

const square: GridConfig = {
  type: 'square',
  cellSizePx: 70,
  offsetX: 12,
  offsetY: 8,
  feetPerCell: 5,
  diagonalRule: '5-5-5',
  hexOffset: 'odd-r',
};

const squareAlternate: GridConfig = { ...square, diagonalRule: '5-10-5' };

const hex: GridConfig = { ...square, type: 'hex', offsetX: 0, offsetY: 0 };

describe('geometria della griglia', () => {
  it('calcola la distanza quadrata con Chebyshev e le due regole diagonali', () => {
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 3 }, square)).toBe(15);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 3 }, squareAlternate)).toBe(20);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 1 }, squareAlternate)).toBe(15);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 1 }, square)).toBe(15);
  });

  it('converte offset odd-r in cubiche e misura gli esagoni', () => {
    expect(offsetToCube({ x: 0, y: 1 })).toEqual({ q: 0, r: 1, s: -1 });
    expect(cubeToOffset({ q: 0, r: 1 })).toEqual({ x: 0, y: 1 });
    expect(hexDistance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
    expect(hexDistance({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(1);
    expect(hexDistance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(2);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 1, y: 1 }, hex)).toBe(10);
  });

  it('fa round-trip tra centro cella e coordinate pixel', () => {
    for (const grid of [square, hex]) {
      for (const cell of [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 7, y: 6 }]) {
        expect(pixelToCell(grid, cellCenterPx(grid, cell))).toEqual(cell);
      }
    }
  });

  it('snappa il centro del token alla cella più vicina', () => {
    expect(snapTokenCell(square, { x: 12 + 70 + 30, y: 8 + 70 + 30 }, 1)).toEqual({ x: 1, y: 1 });
    expect(snapTokenCell(square, { x: 12 + 140 + 20, y: 8 + 70 + 40 }, 1)).toEqual({ x: 2, y: 1 });
    expect(snapTokenCell(square, { x: 12 + 140, y: 8 + 140 }, 2)).toEqual({ x: 1, y: 1 });
    const center = cellCenterPx(hex, { x: 3, y: 2 });
    expect(snapTokenCell(hex, { x: center.x + 4, y: center.y - 3 })).toEqual({ x: 3, y: 2 });
  });

  it('espone la misura con celle e piedi coerenti', () => {
    expect(measureDistance({ x: 0, y: 0 }, { x: 2, y: 1 }, square)).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 2, y: 1 },
      cells: 2,
      feet: 10,
    });
  });
});
