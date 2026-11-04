import { describe, expect, it } from 'vitest';
import { arrowDelta } from './canvas-keyboard';

const keyEvent = (key: string, init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key, ...init });

const ARROWS: ReadonlyArray<{ key: string; dx: number; dy: number }> = [
  { key: 'ArrowLeft', dx: -1, dy: 0 },
  { key: 'ArrowRight', dx: 1, dy: 0 },
  { key: 'ArrowUp', dx: 0, dy: -1 },
  { key: 'ArrowDown', dx: 0, dy: 1 },
];

const OTHER_KEYS = ['a', 'A', 'Escape', 'Enter', '+', '-', ' ', 'Tab'];

describe('arrowDelta', () => {
  it.each(ARROWS)('traduce $key in un delta di una cella', ({ key, dx, dy }) => {
    expect(arrowDelta(keyEvent(key))).toEqual({ dx, dy });
  });

  it.each(OTHER_KEYS)('restituisce null per il tasto %j', (key) => {
    expect(arrowDelta(keyEvent(key))).toBeNull();
  });

  it('restituisce null con Ctrl o Meta', () => {
    expect(arrowDelta(keyEvent('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(arrowDelta(keyEvent('ArrowRight', { metaKey: true }))).toBeNull();
    expect(arrowDelta(keyEvent('ArrowUp', { ctrlKey: true, metaKey: true }))).toBeNull();
  });

  it('mantiene Alt e Shift nel delta senza cambiarne il valore', () => {
    expect(arrowDelta(keyEvent('ArrowDown', { altKey: true }))).toEqual({ dx: 0, dy: 1 });
    expect(arrowDelta(keyEvent('ArrowDown', { shiftKey: true }))).toEqual({ dx: 0, dy: 1 });
    expect(arrowDelta(keyEvent('ArrowDown', { altKey: true, shiftKey: true })))
      .toEqual({ dx: 0, dy: 1 });
  });
});
