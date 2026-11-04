import { describe, expect, it } from 'vitest';
import {
  hexAlphaToRgba,
  parseRgba,
  rgbaAlphaPercent,
  rgbaToHex,
} from './map-color';

describe('map color', () => {
  it('converte rgba in hex e percentuale alfa', () => {
    expect(rgbaToHex('rgba(255, 128, 0, 0.5)')).toBe('#ff8000');
    expect(rgbaAlphaPercent('rgba(255, 128, 0, 0.5)')).toBe(50);
  });

  it('costruisce rgba canonico dal picker', () => {
    expect(hexAlphaToRgba('#102030', 75)).toBe('rgba(16, 32, 48, 0.75)');
    expect(hexAlphaToRgba('#102030', 100)).toBe('rgba(16, 32, 48, 1)');
    expect(hexAlphaToRgba('#102030', 0)).toBe('rgba(16, 32, 48, 0)');
  });

  it('rifiuta valori fuori formato o fuori range', () => {
    expect(parseRgba('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseRgba('rgba(256, 0, 0, 1)')).toBeNull();
    expect(parseRgba('rgba(0, 0, 0, 1.5)')).toBeNull();
    expect(parseRgba('#ffffff')).toBeNull();
  });

  it('ricade sul bianco per un valore invalido', () => {
    expect(rgbaToHex('non-un-colore')).toBe('#ffffff');
  });
});
