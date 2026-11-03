import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  currencyFromCopper,
  currencyToCopper,
  currencyToGp,
  formatGp,
  gpToCopper,
  imageMimeSchema,
  paginatedSchema,
  remainingCurrency,
  skillBonusesSchema,
  skillsTuple,
  viewSchema,
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

describe('vista condivisa', () => {
  it('accetta la vista iniziale predefinita', () => {
    expect(viewSchema.parse({ x: 0, y: 0, zoom: 1 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('rifiuta zoom non positivo e chiavi estranee', () => {
    expect(viewSchema.safeParse({ x: 0, y: 0, zoom: 0 }).success).toBe(false);
    expect(viewSchema.safeParse({ x: 0, y: 0, zoom: -1 }).success).toBe(false);
    expect(viewSchema.safeParse({ x: 0, y: 0, zoom: 1, extra: true }).success).toBe(false);
  });
});

describe('envelope paginato', () => {
  const pageSchema = paginatedSchema(z.object({ id: z.string() }));

  it('valida items e cursore nullo', () => {
    expect(pageSchema.parse({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: null }))
      .toEqual({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: null });
  });

  it('accetta un cursore stringa e rifiuta item o envelope non validi', () => {
    expect(pageSchema.parse({ items: [], nextCursor: 'next' }).nextCursor).toBe('next');
    expect(pageSchema.safeParse({ items: [{ id: 1 }], nextCursor: null }).success).toBe(false);
    expect(pageSchema.safeParse({ items: [], nextCursor: null, extra: true }).success).toBe(false);
    expect(pageSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('skill canoniche', () => {
  it('elenca le 18 skill in ordine canonico', () => {
    expect(skillsTuple).toHaveLength(18);
    expect(new Set(skillsTuple).size).toBe(18);
    expect([...skillsTuple]).toEqual([
      'acrobatics',
      'animalHandling',
      'arcana',
      'athletics',
      'deception',
      'history',
      'insight',
      'intimidation',
      'investigation',
      'medicine',
      'nature',
      'perception',
      'performance',
      'persuasion',
      'religion',
      'sleightOfHand',
      'stealth',
      'survival',
    ]);
  });

  it('genera i bonus opzionali per tutte le skill', () => {
    expect(Object.keys(skillBonusesSchema.shape)).toEqual(skillsTuple);
    const bonuses = Object.fromEntries(skillsTuple.map((skill) => [skill, 2]));
    const parsed = skillBonusesSchema.parse(bonuses);
    expect(parsed.stealth).toBe(2);
    expect(Object.keys(parsed)).toEqual(skillsTuple);
  });

  it('rifiuta bonus non interi e skill sconosciute', () => {
    expect(skillBonusesSchema.safeParse({ acrobatics: 1.5 }).success).toBe(false);
    expect(skillBonusesSchema.safeParse({ flying: 2 }).success).toBe(false);
  });
});

describe('mime immagini', () => {
  it('accetta png, jpeg e webp', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      expect(imageMimeSchema.parse(mime)).toBe(mime);
    }
  });

  it('rifiuta svg', () => {
    expect(imageMimeSchema.safeParse('image/svg+xml').success).toBe(false);
  });
});
