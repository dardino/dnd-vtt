import { describe, expect, it } from 'vitest';
import { applyHpDelta } from './hp.js';

describe('applyHpDelta', () => {
  it('consuma prima i punti ferita temporanei', () => {
    expect(applyHpDelta({ current: 20, max: 20, temp: 5 }, -7)).toEqual({
      current: 18,
      max: 20,
      temp: 0,
    });
  });

  it('non scende sotto zero e limita la cura al massimo', () => {
    expect(applyHpDelta({ current: 5, max: 20, temp: 0 }, -12)).toEqual({
      current: 0,
      max: 20,
      temp: 0,
    });
    expect(applyHpDelta({ current: 18, max: 20, temp: 0 }, 10)).toEqual({
      current: 20,
      max: 20,
      temp: 0,
    });
  });
});
