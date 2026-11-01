import { gpToCopper, type Ability } from '../../schemas/common.js';
import type { SrdClass, SrdItem } from '../../schemas/srd.js';

export interface EquipmentRecommendation {
  itemId: string;
  quantity: number;
}

export interface RecommendEquipmentInput {
  characterClass: SrdClass;
  items: readonly SrdItem[];
  abilities: Record<Ability, number>;
  budgetGp: number;
}

const PACK_BY_CLASS: Readonly<Record<string, string>> = {
  barbarian: 'dungeoneers-pack',
  bard: 'entertainers-pack',
  cleric: 'priests-pack',
  druid: 'explorers-pack',
  fighter: 'dungeoneers-pack',
  monk: 'explorers-pack',
  paladin: 'priests-pack',
  ranger: 'explorers-pack',
  rogue: 'burglars-pack',
  sorcerer: 'scholars-pack',
  warlock: 'scholars-pack',
  wizard: 'scholars-pack',
};

const FOCUS_BY_CLASS: Readonly<Record<string, string>> = {
  bard: 'component-pouch',
  cleric: 'holy-symbol-emblem',
  druid: 'druidic-focus-sprig-of-mistletoe',
  paladin: 'holy-symbol-emblem',
  ranger: 'druidic-focus-sprig-of-mistletoe',
  sorcerer: 'component-pouch',
  warlock: 'component-pouch',
  wizard: 'component-pouch',
};

const TOOL_BY_PROFICIENCY: Readonly<Record<string, string>> = {
  thievesTools: 'thieves-tools',
  herbalismKit: 'herbalism-kit',
};

const averageDamage = (dice: string): number => {
  const match = /^(\d+)d(\d+)$/.exec(dice);
  if (match === null) {
    return 0;
  }
  const count = Number(match[1]);
  const sides = Number(match[2]);
  return (count * (sides + 1)) / 2;
};

const hasProperty = (item: SrdItem, property: string): boolean =>
  item.data.category === 'weapon'
  && item.data.properties.some((entry) => entry.toLowerCase() === property.toLowerCase());

const isRanged = (item: SrdItem): boolean => hasProperty(item, 'Ammunition');
const isFinesse = (item: SrdItem): boolean => hasProperty(item, 'Finesse');
const isTwoHanded = (item: SrdItem): boolean => hasProperty(item, 'Two-Handed');
const isHeavy = (item: SrdItem): boolean => hasProperty(item, 'Heavy');

const weaponScore = (
  item: SrdItem,
  abilities: Record<Ability, number>,
  usesDex: boolean,
): number => {
  if (item.data.category !== 'weapon') {
    return Number.NEGATIVE_INFINITY;
  }
  let score = averageDamage(item.data.damage.dice);
  const attackAbility = isRanged(item) || (usesDex && isFinesse(item)) ? 'dex' : 'str';
  score += Math.floor((abilities[attackAbility] - 10) / 2);
  if (usesDex && isFinesse(item)) {
    score += 0.75;
  }
  if (usesDex && !isFinesse(item) && !isRanged(item)) {
    // Per un personaggio basato su Destrezza un'arma non finesse usa Forza:
    // meglio una finesse più leggera che una spada a due mani fuori ruolo.
    score -= 5;
  }
  if (isTwoHanded(item)) {
    score += 0.25;
  }
  if (isHeavy(item) && abilities.str < 13) {
    score -= 100;
  }
  return score;
};

const weaponAllowed = (item: SrdItem, characterClass: SrdClass): boolean => {
  if (item.data.category !== 'weapon') {
    return false;
  }
  if (item.data.simple && characterClass.weaponProficiencies.includes('simple')) {
    return true;
  }
  return item.data.martial && characterClass.weaponProficiencies.includes('martial');
};

const ammoFor = (item: SrdItem): string | undefined => {
  if (item.data.category !== 'weapon' || !isRanged(item)) {
    return undefined;
  }
  if (item.name.toLowerCase().includes('crossbow') || item.data.properties.includes('Loading')) {
    return 'bolts-20';
  }
  if (item.name.toLowerCase().includes('sling')) {
    return 'bullets-sling-20';
  }
  return 'arrows-20';
};

/**
 * Sceglie un equipaggiamento coerente con competenze, caratteristiche e
 * budget: armatura e scudo migliori consentiti, arma primaria e secondaria
 * adatte, focus, attrezzi di classe e una sacca. Il chiamante applica poi il
 * risultato al build e ricalcola il residuo in rame.
 */
export const recommendEquipment = (
  input: RecommendEquipmentInput,
): EquipmentRecommendation[] => {
  const { characterClass, items, abilities, budgetGp } = input;
  const byId = new Map(items.map((item) => [item.id, item]));
  const training = new Set(characterClass.armorTraining);
  const usesDex = characterClass.primaryAbilities.includes('dex')
    && !characterClass.primaryAbilities.includes('str');
  const result: EquipmentRecommendation[] = [];
  let remaining = gpToCopper(budgetGp);

  const add = (itemId: string | undefined, quantity = 1): boolean => {
    if (itemId === undefined) {
      return false;
    }
    const item = byId.get(itemId);
    if (item === undefined) {
      return false;
    }
    const cost = gpToCopper(item.valueGp) * quantity;
    if (cost > remaining) {
      return false;
    }
    remaining -= cost;
    const existing = result.find((entry) => entry.itemId === itemId);
    if (existing !== undefined) {
      existing.quantity += quantity;
    } else {
      result.push({ itemId, quantity });
    }
    return true;
  };

  const armorCap = Math.floor(gpToCopper(budgetGp) * 0.6);
  const armor = items
    .filter((item) => item.data.category === 'armor')
    .filter((item) => item.data.category === 'armor' && !item.data.shield && training.has(item.data.armorCategory))
    .filter((item) => item.data.category !== 'armor' || item.data.strength === undefined || abilities.str >= item.data.strength)
    .filter((item) => gpToCopper(item.valueGp) <= armorCap)
    .sort((left, right) => {
      if (left.data.category !== 'armor' || right.data.category !== 'armor') {
        return 0;
      }
      return right.data.baseAc - left.data.baseAc || left.valueGp - right.valueGp;
    });
  for (const candidate of armor) {
    if (add(candidate.id)) {
      break;
    }
  }

  const shield = items.find((item) => item.data.category === 'armor' && item.data.shield);
  const shieldChosen = training.has('shield') && shield !== undefined && add(shield.id);

  const weapons = items
    .filter((item) => weaponAllowed(item, characterClass))
    .filter((item) => !/musket|pistol|blowgun/i.test(item.name))
    .sort((left, right) => weaponScore(right, abilities, usesDex) - weaponScore(left, abilities, usesDex));
  const melee = weapons.filter((item) =>
    !isRanged(item) && (!shieldChosen || !isTwoHanded(item)));
  const ranged = weapons.filter(isRanged);

  const addFirst = (candidates: readonly SrdItem[], withAmmo: boolean): void => {
    for (const candidate of candidates) {
      if (add(candidate.id)) {
        if (withAmmo) {
          add(ammoFor(candidate));
        }
        return;
      }
    }
  };

  const rangedFirst = characterClass.id === 'ranger';
  if (characterClass.spellcasting !== undefined) {
    add(FOCUS_BY_CLASS[characterClass.id]);
  }

  const preferredPack = PACK_BY_CLASS[characterClass.id];
  const packs = items
    .filter((item) => item.data.category === 'pack' && item.name.includes('Pack'))
    .sort((left, right) => left.valueGp - right.valueGp);
  if (!add(preferredPack)) {
    for (const pack of packs) {
      if (add(pack.id)) {
        break;
      }
    }
  }

  const toolId = characterClass.toolProficiencies
    .map((proficiency) => TOOL_BY_PROFICIENCY[proficiency])
    .find((id) => id !== undefined);
  add(toolId);

  addFirst(rangedFirst ? ranged : melee, true);
  addFirst(rangedFirst ? melee : ranged, true);

  return result;
};

/** Costo in rame dell'equipaggiamento scelto, con lookup sul catalogo. */
export const equipmentCostCopper = (
  equipment: readonly { itemId: string; quantity: number }[],
  items: readonly SrdItem[],
): number => {
  const byId = new Map(items.map((item) => [item.id, item]));
  return equipment.reduce((total, entry) => {
    const item = byId.get(entry.itemId);
    return total + gpToCopper(item?.valueGp ?? 0) * entry.quantity;
  }, 0);
};
