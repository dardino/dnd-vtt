import { describe, expect, it } from 'vitest';
import {
  currencyFromCopper,
  currencyToCopper,
  currencyToGp,
  formatGp,
  gpToCopper,
  remainingCurrency,
} from './common.js';

describe('contabilità in rame', () => {
  it('converte i prezzi decimali senza artefatti floating point', () => {
    expect(gpToCopper(0.02)).toBe(2);
    expect(gpToCopper(4.98)).toBe(498);
    expect(gpToCopper(15)).toBe(1500);
  });

  it('scompone un totale in monete intere canoniche', () => {
    expect(currencyFromCopper(498)).toEqual({ cp: 8, sp: 9, ep: 0, gp: 4, pp: 0 });
    expect(currencyToCopper(currencyFromCopper(498))).toBe(498);
    expect(currencyToGp(currencyFromCopper(498))).toBe(4.98);
  });

  it('calcola il residuo dopo una spesa da 2 mr', () => {
    const remaining = remainingCurrency(5, gpToCopper(0.02));
    expect(remaining).toEqual({ cp: 8, sp: 9, ep: 0, gp: 4, pp: 0 });
    expect(formatGp(currencyToCopper(remaining))).toBe('4.98');
  });

  it('non mostra decimali inutili', () => {
    expect(formatGp(500)).toBe('5');
    expect(formatGp(2)).toBe('0.02');
    expect(formatGp(0)).toBe('0');
  });
});
