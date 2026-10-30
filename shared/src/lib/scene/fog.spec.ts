import { describe, expect, it } from 'vitest';
import type { FogState } from '../../schemas/scene.js';
import { FOG_BRUSH_CELLS, fogBrushRadius, isPointRevealed } from './fog.js';

const fog = (overrides: Partial<FogState> = {}): FogState => ({
  base: 'hidden',
  ops: [],
  ...overrides,
});

describe('visibilità fog', () => {
  it('rispetta base e ordine delle operazioni', () => {
    const state = fog({
      ops: [
        { id: 'a', op: 'reveal', shape: { type: 'rect', x: 0, y: 0, width: 100, height: 100 }, softness: 0 },
        { id: 'b', op: 'hide', shape: { type: 'rect', x: 30, y: 30, width: 20, height: 20 }, softness: 0 },
      ],
    });
    expect(isPointRevealed(state, { x: 10, y: 10 })).toBe(true);
    expect(isPointRevealed(state, { x: 40, y: 40 })).toBe(false);
    expect(isPointRevealed(state, { x: 200, y: 200 })).toBe(false);
  });

  it('supporta poligoni, cerchi e pennello', () => {
    const state = fog({
      ops: [
        { id: 'p', op: 'reveal', shape: { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] }, softness: 0 },
        { id: 'c', op: 'reveal', shape: { type: 'circle', cx: 200, cy: 200, radius: 50 }, softness: 0 },
        { id: 'b', op: 'reveal', shape: { type: 'brush', points: [{ x: 300, y: 300 }, { x: 400, y: 300 }], radius: 20 }, softness: 0 },
      ],
    });
    expect(isPointRevealed(state, { x: 20, y: 20 })).toBe(true);
    expect(isPointRevealed(state, { x: 200, y: 240 })).toBe(true);
    expect(isPointRevealed(state, { x: 350, y: 315 })).toBe(true);
    expect(isPointRevealed(state, { x: 350, y: 340 })).toBe(false);
  });

  it('parte scoperta quando base è revealed e una hide ricopre', () => {
    const state = fog({
      base: 'revealed',
      ops: [{ id: 'h', op: 'hide', shape: { type: 'circle', cx: 10, cy: 10, radius: 5 }, softness: 0 }],
    });
    expect(isPointRevealed(state, { x: 100, y: 100 })).toBe(true);
    expect(isPointRevealed(state, { x: 10, y: 10 })).toBe(false);
  });

  it('calcola un pennello di 3 celle di diametro', () => {
    expect(FOG_BRUSH_CELLS).toBe(3);
    expect(fogBrushRadius(100)).toBe(150);
    expect(fogBrushRadius(64)).toBe(96);
    expect(fogBrushRadius(0)).toBe(1);
  });
});
