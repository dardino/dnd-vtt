import { describe, expect, it } from 'vitest';
import { fighterStatblock, testCatalog } from './__fixtures__/catalog.js';
import { levelUpPcStatblock } from './level-up.js';

const levelFour = () => fighterStatblock({
  class: { id: 'fighter', level: 4, subclassId: 'champion' },
  hp: { current: 39, max: 39, temp: 0 },
  hpRolls: [7, 8, 6],
  hitDice: { die: 10, total: 4, used: 0 },
  abilityIncreases: [
    { source: 'background', ability: 'str', amount: 2 },
    { source: 'background', ability: 'con', amount: 1 },
    { source: 'asi', ability: 'str', amount: 2 },
  ],
});

describe('levelUpPcStatblock', () => {
  it('porta il fighter dal 4 al 5 con HP, dado vita e privilegi', () => {
    const result = levelUpPcStatblock(levelFour(), testCatalog, { hpMethod: 'average' });
    expect(result.statblock.class.level).toBe(5);
    expect(result.statblock.hitDice.total).toBe(5);
    expect(result.preview.hpGain).toBe(8);
    expect(result.statblock.hp.max).toBe(47);
    expect(result.statblock.hpRolls).toEqual([7, 8, 6, 6]);
  });

  it('richiede la sottoclasse quando il livello la sblocca', () => {
    const withoutSubclass = fighterStatblock({
      class: { id: 'fighter', level: 2 },
      hp: { current: 20, max: 20, temp: 0 },
      hpRolls: [6],
      hitDice: { die: 10, total: 2, used: 0 },
    });
    expect(() => levelUpPcStatblock(withoutSubclass, testCatalog, { hpMethod: 'average' }))
      .toThrow(/sottoclasse/);
    const result = levelUpPcStatblock(withoutSubclass, testCatalog, {
      hpMethod: 'average',
      subclassId: 'champion',
    });
    expect(result.statblock.class.subclassId).toBe('champion');
  });

  it('rifiuta un tiro fuori dal dado vita e il livello 20', () => {
    expect(() => levelUpPcStatblock(levelFour(), testCatalog, { hpMethod: 'roll', hpRoll: 11 }))
      .toThrow(/punti ferita/);
    const levelTwenty = fighterStatblock({ class: { id: 'fighter', level: 20, subclassId: 'champion' } });
    expect(() => levelUpPcStatblock(levelTwenty, testCatalog, { hpMethod: 'average' }))
      .toThrow(/livello 20/);
  });
});
