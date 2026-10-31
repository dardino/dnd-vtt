import { describe, expect, it } from 'vitest';
import {
  defaultTerrain,
  type Terrain,
  type WallEdge,
} from '../../schemas/scene.js';
import { computeVisionGrid, isCellVisible, isTokenVisible } from './vision.js';
import { lastReachableCell, rasterizeWallTrace } from './edges.js';

const grid = {
  type: 'square' as const,
  cellSizePx: 70,
  offsetX: 0,
  offsetY: 0,
  feetPerCell: 5,
  diagonalRule: '5-5-5' as const,
  hexOffset: 'odd-r' as const,
};

const wall = (x: number, y: number, dir: 'h' | 'v', extra: Partial<WallEdge> = {}): WallEdge => ({
  id: `edge-${dir}-${x}-${y}`,
  x,
  y,
  dir,
  kind: 'wall',
  ...extra,
});

const terrain = (overrides: Partial<Terrain> = {}): Terrain => ({
  ...defaultTerrain,
  visionEnabled: true,
  ambientLight: 'dark',
  walls: [],
  lights: [],
  ...overrides,
});

describe('visione a celle', () => {
  it('senza sorgenti non rivela nulla', () => {
    expect(computeVisionGrid({
      widthPx: 700,
      heightPx: 700,
      grid,
      terrain: terrain(),
      sources: [],
    })).toBeNull();
  });

  it('la scurovisione vede nel buio ma il muro blocca', () => {
    const walls = Array.from({ length: 10 }, (_, y) => wall(3, y, 'v'));
    const vision = computeVisionGrid({
      widthPx: 700,
      heightPx: 700,
      grid,
      terrain: terrain({ walls }),
      sources: [{ cell: { x: 1, y: 1 }, darkvision: 60 }],
    });
    expect(vision).not.toBeNull();
    expect(vision?.levels[1 * vision.cols + 2]).toBe(1);
    expect(vision?.levels[1 * vision.cols + 4]).toBe(0);
  });

  it('una porta chiusa blocca la luce, aperta la lascia passare', () => {
    const closed = terrain({
      walls: [wall(3, 1, 'v', { kind: 'door', door: 'closed' })],
      lights: [{
        id: 'torch',
        x: 1,
        y: 1,
        brightFeet: 20,
        dimFeet: 40,
        enabled: true,
        shape: 'circle',
        color: '#fff',
        angle: 60,
      }],
    });
    const source = [{ cell: { x: 1, y: 1 } }];
    expect(computeVisionGrid({
      widthPx: 700,
      heightPx: 700,
      grid: grid,
      terrain: closed,
      sources: source,
    })?.levels[1 * 10 + 4]).toBe(0);

    const open = terrain({
      ...closed,
      walls: [wall(3, 1, 'v', { kind: 'door', door: 'open' })],
    });
    expect(computeVisionGrid({
      widthPx: 700,
      heightPx: 700,
      grid,
      terrain: open,
      sources: source,
    })?.levels[1 * 10 + 4]).toBeGreaterThan(0);
  });

  it('la fog manuale nasconde una cella visibile e il token grande usa le celle occupate', () => {
    const vision = computeVisionGrid({
      widthPx: 700,
      heightPx: 700,
      grid,
      terrain: terrain({ ambientLight: 'bright' }),
      sources: [{ cell: { x: 1, y: 1 } }],
    });
    expect(vision).not.toBeNull();
    const fog = {
      base: 'hidden' as const,
      override: 'none' as const,
      ops: [{
        id: 'hide',
        op: 'hide' as const,
        shape: { type: 'cells' as const, cells: [{ x: 2, y: 1 }] },
        softness: 0,
      }],
    };
    expect(isCellVisible(fog, vision, grid, { x: 2, y: 1 })).toBe(false);
    expect(isCellVisible(fog, vision, grid, { x: 1, y: 1 })).toBe(true);
    expect(isTokenVisible(fog, vision, grid, { x: 2, y: 1, size: 1 })).toBe(false);
    expect(isTokenVisible(fog, vision, grid, { x: 1, y: 1, size: 1 })).toBe(true);
  });

  it('il movimento si ferma prima del muro', () => {
    const walls = Array.from({ length: 10 }, (_, y) => wall(3, y, 'v'));
    expect(lastReachableCell({ x: 1, y: 1 }, { x: 4, y: 1 }, terrain({ walls })))
      .toEqual({ x: 2, y: 1 });
  });

  it('rasterizza un tratto libero in edge connessi', () => {
    const edges = rasterizeWallTrace(
      [{ x: 70, y: 70 }, { x: 280, y: 70 }],
      grid,
    );
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every((edge) => edge.dir === 'v' || edge.dir === 'h')).toBe(true);
    expect(new Set(edges.map((edge) => `${edge.dir}:${edge.x}:${edge.y}`)).size).toBe(edges.length);
  });
});
