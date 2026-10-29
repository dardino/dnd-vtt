import { describe, expect, it } from 'vitest';
import { fighterStatblock } from './__fixtures__/catalog.js';
import { applyLongRest, applyShortRest } from './rest.js';

const restFixture = () => ({
  ...fighterStatblock(),
  hp: { current: 5, max: 30, temp: 7 },
  conditions: [
    { name: 'exhaustion' as const, level: 2 },
    { name: 'poisoned' as const },
  ],
  hitDice: { die: 10, total: 4, used: 3 },
  deathSaves: { successes: 1, failures: 2 },
  resources: [
    { id: 'short', name: 'Azione impetuosa', max: 3, used: 2, recharge: 'short' as const },
    { id: 'long', name: 'Potenziamento', max: 1, used: 1, recharge: 'long' as const },
  ],
  spells: {
    ...fighterStatblock().spells,
    slots: [{ level: 1, max: 2, used: 2 }],
    pactSlots: { level: 1, max: 1, used: 1 },
  },
});

describe('riposi', () => {
  it('il breve ricarica short e pact ma non cura', () => {
    const result = applyShortRest(restFixture());
    expect(result.hp.current).toBe(5);
    expect(result.hitDice.used).toBe(3);
    expect(result.resources.map((resource) => resource.used)).toEqual([0, 1]);
    expect(result.spells.slots[0]?.used).toBe(2);
    expect(result.spells.pactSlots?.used).toBe(0);
  });

  it('il lungo recupera HP, dadi vita, death saves e riduce exhaustion', () => {
    const result = applyLongRest(restFixture());
    expect(result.hp).toEqual({ current: 30, max: 30, temp: 7 });
    expect(result.hitDice.used).toBe(0);
    expect(result.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(result.resources.map((resource) => resource.used)).toEqual([0, 0]);
    expect(result.spells.slots[0]?.used).toBe(0);
    expect(result.spells.pactSlots?.used).toBe(0);
    expect(result.conditions).toEqual([{ name: 'exhaustion', level: 1 }, { name: 'poisoned' }]);
  });
});
