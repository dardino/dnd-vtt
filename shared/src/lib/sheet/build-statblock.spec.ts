import { describe, expect, it } from 'vitest';
import { buildPcStatblock } from './build-statblock.js';
import { baseFighterBuild, baseWizardBuild, testCatalog } from './__fixtures__/catalog.js';

describe('buildPcStatblock', () => {
  it('costruisce un combattente completo con snapshot e derivati coerenti', () => {
    const statblock = buildPcStatblock({ build: baseFighterBuild(), catalog: testCatalog });

    expect(statblock.kind).toBe('pc');
    expect(statblock.class).toEqual({ id: 'fighter', level: 1 });
    expect(statblock.hp).toEqual({ current: 12, max: 12, temp: 0 });
    expect(statblock.abilities).toEqual({ str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 8 });
    expect(statblock.hitDice).toEqual({ die: 10, total: 1, used: 0 });
    expect(statblock.proficiencies.saves).toEqual(['str', 'con']);
    expect(statblock.proficiencies.armor).toEqual(['light', 'medium', 'heavy', 'shield']);
    expect(statblock.snapshot.items).toHaveLength(3);
    expect(statblock.snapshot.features.some((feature) => feature.id === 'fighter-second-wind')).toBe(true);
    expect(statblock.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 });
  });

  it('costruisce un mago con slot, incantesimi e focus snapshot', () => {
    const statblock = buildPcStatblock({ build: baseWizardBuild(), catalog: testCatalog });

    expect(statblock.spells.ability).toBe('int');
    expect(statblock.spells.slots).toEqual([{ level: 1, max: 2, used: 0 }]);
    expect(statblock.spells.prepared.map((entry) => entry.id)).toEqual(['magic-missile', 'shield']);
    expect(statblock.snapshot.spells.map((entry) => entry.id)).toEqual([
      'fire-bolt',
      'magic-missile',
      'shield',
    ]);
    expect(statblock.hp.max).toBe(8);
  });
});
