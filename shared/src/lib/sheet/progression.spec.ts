import { describe, expect, it } from 'vitest';
import type { SrdClass } from '../../schemas/srd.js';
import { maxSpellLevelForClass, spellSlotsFor } from './progression.js';
import { testCatalog } from './__fixtures__/catalog.js';

const wizard = testCatalog.classes.find((entry) => entry.id === 'wizard');
if (wizard === undefined || wizard.spellcasting === undefined) {
  throw new Error('fixture wizard senza incantesimi');
}
const casting = wizard.spellcasting;

const pactRow = (level: number, count: number): { level: number; count: number } =>
  ({ level, count });

const warlock: SrdClass = {
  ...wizard,
  id: 'warlock',
  name: 'Warlock',
  spellcasting: {
    ...casting,
    progression: 'pact',
    slots: Array.from({ length: 20 }, () => Array.from({ length: 9 }, () => 0)),
    pactSlots: Array.from({ length: 20 }, (_, index) => (index === 4 ? pactRow(3, 2) : pactRow(0, 0))),
  },
};

describe('spellSlotsFor', () => {
  it('restituisce gli slot normali senza quelli a zero', () => {
    expect(spellSlotsFor(wizard, 1)).toEqual({ slots: [{ level: 1, max: 2 }] });
    expect(spellSlotsFor(wizard, 5)).toEqual({
      slots: [
        { level: 1, max: 2 },
        { level: 2, max: 2 },
        { level: 3, max: 2 },
      ],
    });
  });

  it('restituisce il pact slot al livello della tabella', () => {
    expect(spellSlotsFor(warlock, 5)).toEqual({
      slots: [],
      pactSlots: { level: 3, max: 2 },
    });
    expect(spellSlotsFor(warlock, 1)).toEqual({ slots: [] });
  });

  it('restituisce nessuno slot per una classe senza incantesimi', () => {
    const fighter = testCatalog.classes.find((entry) => entry.id === 'fighter');
    if (fighter === undefined) {
      throw new Error('fixture fighter mancante');
    }
    expect(spellSlotsFor(fighter, 1)).toEqual({ slots: [] });
  });
});

describe('maxSpellLevelForClass', () => {
  it('deriva il livello massimo dagli slot normali o pact', () => {
    expect(maxSpellLevelForClass(wizard, 1)).toBe(1);
    expect(maxSpellLevelForClass(wizard, 5)).toBe(3);
    expect(maxSpellLevelForClass(warlock, 5)).toBe(3);
    expect(maxSpellLevelForClass(warlock, 1)).toBe(0);
  });
});
