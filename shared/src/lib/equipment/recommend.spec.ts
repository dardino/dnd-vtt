import { describe, expect, it } from 'vitest';
import type { SrdClass, SrdItem } from '../../schemas/srd.js';
import { testCatalog } from '../sheet/__fixtures__/catalog.js';
import { recommendEquipment } from './recommend.js';

const item = (
  id: string,
  name: string,
  category: SrdItem['category'],
  valueGp: number,
  data: SrdItem['data'],
): SrdItem => ({
  id,
  name,
  type: category,
  category,
  valueGp,
  weightLb: 0,
  description: '',
  data,
});

const armor = (id: string, name: string, valueGp: number, armorCategory: 'light' | 'medium' | 'heavy' | 'shield', baseAc: number, strength?: number): SrdItem =>
  armorCategory === 'shield'
    ? item(id, name, 'armor', valueGp, { category: 'armor', armorCategory, baseAc, shield: true })
    : item(id, name, 'armor', valueGp, {
      category: 'armor',
      armorCategory,
      baseAc,
      shield: false,
      ...(strength === undefined ? {} : { strength }),
    });

const weapon = (
  id: string,
  name: string,
  valueGp: number,
  dice: string,
  properties: string[],
  martial = false,
): SrdItem => item(id, name, 'weapon', valueGp, {
  category: 'weapon',
  damage: { dice, type: 'slashing' },
  properties,
  simple: !martial,
  martial,
});

const catalogItems: SrdItem[] = [
  armor('chain-mail', 'Chain Mail', 75, 'heavy', 16, 13),
  armor('leather-armor', 'Leather Armor', 10, 'light', 11),
  armor('shield', 'Shield', 10, 'shield', 2),
  weapon('battleaxe', 'Battleaxe', 10, '1d8', ['Topple', 'Versatile'], true),
  weapon('longbow', 'Longbow', 50, '1d8', ['Ammunition', 'Heavy', 'Two-Handed'], true),
  weapon('dagger', 'Dagger', 2, '1d4', ['Finesse', 'Light', 'Thrown']),
  weapon('quarterstaff', 'Quarterstaff', 0.2, '1d6', ['Topple', 'Versatile']),
  weapon('shortsword', 'Shortsword', 10, '1d6', ['Finesse', 'Light'], true),
  item('arrows-20', 'Arrows (20)', 'ammunition', 1, { category: 'gear' }),
  item('component-pouch', 'Component Pouch', 'gear', 25, { category: 'gear' }),
  item('explorers-pack', "Explorer's Pack", 'pack', 10, { category: 'pack' }),
  item('scholars-pack', "Scholar's Pack", 'pack', 40, { category: 'pack' }),
  item('thieves-tools', "Thieves' Tools", 'tool', 25, { category: 'tool' }),
];

const fighter = testCatalog.classes.find((entry) => entry.id === 'fighter');
const wizard = testCatalog.classes.find((entry) => entry.id === 'wizard');
if (fighter === undefined || wizard === undefined) {
  throw new Error('fixture classi mancanti');
}

const abilities = { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };

const ids = (recommendations: { itemId: string }[]): string[] =>
  recommendations.map((entry) => entry.itemId);

describe('recommendEquipment', () => {
  it('equipaggia un combattente con armatura, scudo e armi competenti', () => {
    const result = recommendEquipment({
      characterClass: fighter,
      items: catalogItems,
      abilities,
      budgetGp: 155,
    });
    expect(ids(result)).toContain('chain-mail');
    expect(ids(result)).toContain('shield');
    expect(ids(result)).toContain('battleaxe');
    expect(ids(result)).not.toContain('leather-armor');
    const total = result.reduce((sum, entry) =>
      sum + (catalogItems.find((candidate) => candidate.id === entry.itemId)?.valueGp ?? 0) * entry.quantity, 0);
    expect(total).toBeLessThanOrEqual(155);
  });

  it('non mette armatura a un mago e rispetta il budget', () => {
    const result = recommendEquipment({
      characterClass: wizard,
      items: catalogItems,
      abilities: { ...abilities, int: 16, dex: 14 },
      budgetGp: 55,
    });
    expect(ids(result)).not.toContain('chain-mail');
    expect(ids(result)).not.toContain('shield');
    expect(ids(result)).toContain('component-pouch');
    expect(ids(result)).toContain('explorers-pack');
    expect(ids(result)).not.toContain('scholars-pack');
  });

  it('sceglie l arma finesse per un ladro e include gli attrezzi', () => {
    const rogue: SrdClass = {
      ...fighter,
      id: 'rogue',
      name: 'Rogue',
      primaryAbilities: ['dex'],
      armorTraining: ['light'],
      toolProficiencies: ['thievesTools'],
      weaponProficiencies: ['simple', 'martial'],
    };
    const result = recommendEquipment({
      characterClass: rogue,
      items: catalogItems,
      abilities: { ...abilities, str: 10, dex: 16 },
      budgetGp: 100,
    });
    expect(ids(result)).toContain('leather-armor');
    expect(ids(result)).toContain('thieves-tools');
    expect(ids(result)).toContain('shortsword');
    expect(result.reduce((sum, entry) =>
      sum + (catalogItems.find((candidate) => candidate.id === entry.itemId)?.valueGp ?? 0) * entry.quantity, 0))
      .toBeLessThanOrEqual(100);
  });

  it('non supera un budget insufficiente', () => {
    const result = recommendEquipment({
      characterClass: fighter,
      items: catalogItems,
      abilities,
      budgetGp: 1,
    });
    const total = result.reduce((sum, entry) =>
      sum + (catalogItems.find((candidate) => candidate.id === entry.itemId)?.valueGp ?? 0) * entry.quantity, 0);
    expect(total).toBeLessThanOrEqual(1);
  });
});
