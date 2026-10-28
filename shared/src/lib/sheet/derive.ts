import type { Ability, Skill } from '../../schemas/common.js';
import type {
  AttackProfile,
  DerivedSheet,
  PcStatblock,
  ResolvedItem,
  SheetOverrides,
  Speed,
  WeaponData,
} from '../../schemas/sheet.js';
import { abilityModifier, abilityModifiers, proficiencyBonus } from './abilities.js';
import { SKILL_ABILITY } from './skills.js';

export interface DeriveSheetInput {
  statblock: PcStatblock;
  equipped: readonly ResolvedItem[];
}

const POWERFUL_BUILD_SPECIES = new Set(['goliath']);

const abilityScore = (statblock: PcStatblock, ability: Ability): number => statblock.abilities[ability];

const weaponAbility = (
  statblock: PcStatblock,
  data: WeaponData,
): Ability => {
  const properties = data.properties.map((property) => property.toLowerCase());
  const isRanged = properties.includes('ammunition')
    && !properties.includes('thrown');
  if (isRanged) {
    return 'dex';
  }
  if (properties.includes('finesse')) {
    return abilityScore(statblock, 'str') >= abilityScore(statblock, 'dex') ? 'str' : 'dex';
  }
  return 'str';
};

const computeAc = (statblock: PcStatblock, equipped: readonly ResolvedItem[]): number => {
  const armor = equipped.find((item) => item.data.category === 'armor' && !item.data.shield);
  const shield = equipped.find((item) => item.data.category === 'armor' && item.data.shield);
  const dex = abilityModifier(abilityScore(statblock, 'dex'));

  if (armor !== undefined && armor.data.category === 'armor') {
    const dexBonus = armor.data.dexCap === undefined ? dex : Math.min(dex, armor.data.dexCap);
    const shieldBonus = shield !== undefined && shield.data.category === 'armor' ? shield.data.baseAc : 0;
    return armor.data.baseAc + dexBonus + shieldBonus;
  }

  const unarmored = 10 + dex;
  let base = unarmored;
  if (statblock.class.id === 'barbarian') {
    base = unarmored + abilityModifier(abilityScore(statblock, 'con'));
  } else if (statblock.class.id === 'monk') {
    base = unarmored + abilityModifier(abilityScore(statblock, 'wis'));
  }
  const shieldBonus = shield !== undefined && shield.data.category === 'armor' ? shield.data.baseAc : 0;
  return base + shieldBonus;
};

const buildAttacks = (statblock: PcStatblock, equipped: readonly ResolvedItem[]): AttackProfile[] => {
  const prof = proficiencyBonus(statblock.class.level);
  return equipped
    .filter((item) => item.data.category === 'weapon')
    .map((item) => {
      const data = item.data as WeaponData;
      const ability = weaponAbility(statblock, data);
      const modifier = abilityModifier(abilityScore(statblock, ability));
      const damage = modifier === 0
        ? data.damage.dice
        : `${data.damage.dice}${modifier > 0 ? '+' : ''}${modifier}`;
      return {
        itemId: item.id,
        name: item.name,
        ability,
        toHit: prof + modifier,
        damage,
        properties: data.properties,
      };
    });
};

const applyOverrides = <T extends Record<string, number>>(
  values: T,
  overrides: { [K in keyof T]?: T[K] | undefined } | undefined,
): T => {
  if (overrides === undefined) {
    return values;
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, overrides[key as keyof T] ?? value]),
  ) as T;
};

export const deriveSheet = ({ statblock, equipped }: DeriveSheetInput): DerivedSheet => {
  const mods = abilityModifiers(statblock.abilities);
  const prof = proficiencyBonus(statblock.class.level);
  const overrides: SheetOverrides = statblock.overrides;

  const saves = applyOverrides(
    {
      str: mods.str + (statblock.proficiencies.saves.includes('str') ? prof : 0),
      dex: mods.dex + (statblock.proficiencies.saves.includes('dex') ? prof : 0),
      con: mods.con + (statblock.proficiencies.saves.includes('con') ? prof : 0),
      int: mods.int + (statblock.proficiencies.saves.includes('int') ? prof : 0),
      wis: mods.wis + (statblock.proficiencies.saves.includes('wis') ? prof : 0),
      cha: mods.cha + (statblock.proficiencies.saves.includes('cha') ? prof : 0),
    },
    overrides.saves,
  );

  const skillEntries = Object.entries(SKILL_ABILITY) as [Skill, Ability][];
  const skillValues = Object.fromEntries(
    skillEntries.map(([skill, ability]) => {
      const proficient = statblock.proficiencies.skills.includes(skill);
      const expertise = statblock.proficiencies.expertise.includes(skill);
      const bonus = expertise ? prof * 2 : proficient ? prof : 0;
      return [skill, mods[ability] + bonus];
    }),
  ) as Record<Skill, number>;
  const skills = applyOverrides(skillValues, overrides.skills);

  const spellAbility = statblock.spells.ability;
  const spellModifier = spellAbility === undefined ? undefined : mods[spellAbility];
  const computedDc = spellModifier === undefined ? undefined : 8 + prof + spellModifier;
  const computedAttack = spellModifier === undefined ? undefined : prof + spellModifier;
  const spellSaveDC = overrides.spellSaveDC ?? computedDc;
  const spellAttackBonus = overrides.spellAttackBonus ?? computedAttack;

  const computedAc = computeAc(statblock, equipped);
  const ac = overrides.ac ?? computedAc;

  const speedOverrides = overrides.speed;
  const speed: Speed = {
    ...statblock.speed,
    ...(speedOverrides?.walk === undefined ? {} : { walk: speedOverrides.walk }),
    ...(speedOverrides?.fly === undefined ? {} : { fly: speedOverrides.fly }),
    ...(speedOverrides?.swim === undefined ? {} : { swim: speedOverrides.swim }),
    ...(speedOverrides?.climb === undefined ? {} : { climb: speedOverrides.climb }),
    ...(speedOverrides?.burrow === undefined ? {} : { burrow: speedOverrides.burrow }),
    ...(speedOverrides?.hover === undefined ? {} : { hover: speedOverrides.hover }),
  };

  const carryCapacity = abilityScore(statblock, 'str')
    * 15
    * (POWERFUL_BUILD_SPECIES.has(statblock.species.id) ? 2 : 1);

  return {
    proficiencyBonus: prof,
    initiative: overrides.initiative ?? mods.dex,
    saves,
    skills,
    passivePerception: overrides.passivePerception ?? 10 + skills.perception,
    ...(spellSaveDC === undefined ? {} : { spellSaveDC }),
    ...(spellAttackBonus === undefined ? {} : { spellAttackBonus }),
    ac,
    attacks: buildAttacks(statblock, equipped),
    carryCapacity,
    speed,
  };
};
