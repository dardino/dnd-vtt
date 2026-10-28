import { describe, expect, it } from 'vitest';
import { deriveSheet } from './derive.js';
import {
  fighterStatblock,
  resolvedItem,
  wizardStatblock,
} from './__fixtures__/catalog.js';

describe('deriveSheet', () => {
  it('calcola TS, abilità, iniziativa e percezione passiva', () => {
    const derived = deriveSheet({ statblock: fighterStatblock(), equipped: [] });

    expect(derived.proficiencyBonus).toBe(2);
    expect(derived.saves).toEqual({ str: 5, dex: 2, con: 4, int: -1, wis: 1, cha: -1 });
    expect(derived.skills.athletics).toBe(5);
    expect(derived.skills.perception).toBe(3);
    expect(derived.initiative).toBe(2);
    expect(derived.passivePerception).toBe(13);
  });

  it('calcola la CA con armatura pesante e scudo', () => {
    const derived = deriveSheet({
      statblock: fighterStatblock(),
      equipped: [resolvedItem('chain-mail'), resolvedItem('shield')],
    });

    expect(derived.ac).toBe(18);
  });

  it('calcola la CA senz armatura', () => {
    const derived = deriveSheet({ statblock: fighterStatblock(), equipped: [] });
    expect(derived.ac).toBe(12);
  });

  it('applica l override della CA e lo segnala con il valore esplicito', () => {
    const derived = deriveSheet({
      statblock: fighterStatblock({ overrides: { ac: 21, initiative: 7 } }),
      equipped: [resolvedItem('chain-mail'), resolvedItem('shield')],
    });

    expect(derived.ac).toBe(21);
    expect(derived.initiative).toBe(7);
  });

  it('deriva gli attacchi dalle armi equipaggiate', () => {
    const derived = deriveSheet({
      statblock: fighterStatblock(),
      equipped: [resolvedItem('longsword')],
    });

    expect(derived.attacks).toEqual([
      {
        itemId: 'longsword',
        name: 'Longsword',
        ability: 'str',
        toHit: 5,
        damage: '1d8+3',
        properties: ['Versatile'],
      },
    ]);
  });

  it('calcola CD e attacco degli incantesimi', () => {
    const derived = deriveSheet({ statblock: wizardStatblock(), equipped: [] });
    expect(derived.spellSaveDC).toBe(12);
    expect(derived.spellAttackBonus).toBe(4);
  });

  it('non espone CD incantesimi per un non incantatore', () => {
    const derived = deriveSheet({ statblock: fighterStatblock(), equipped: [] });
    expect(derived.spellSaveDC).toBeUndefined();
    expect(derived.spellAttackBonus).toBeUndefined();
  });

  it('calcola la capacità di carico e raddoppia per Powerful Build', () => {
    const human = deriveSheet({ statblock: fighterStatblock(), equipped: [] });
    const goliath = deriveSheet({
      statblock: fighterStatblock({ species: { id: 'goliath' } }),
      equipped: [],
    });

    expect(human.carryCapacity).toBe(255);
    expect(goliath.carryCapacity).toBe(510);
  });

  it('applica gli override alle abilità e alla velocità', () => {
    const derived = deriveSheet({
      statblock: fighterStatblock({
        overrides: {
          skills: { stealth: 9 },
          speed: { walk: 40 },
        },
      }),
      equipped: [],
    });

    expect(derived.skills.stealth).toBe(9);
    expect(derived.speed.walk).toBe(40);
  });
});
