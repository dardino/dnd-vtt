import type { Ability } from '../../schemas/common.js';
import { abilities } from '../../schemas/common.js';
import type { PcBuild } from '../../schemas/build.js';
import type { SrdCatalog } from '../../schemas/srd.js';
import { abilityModifier } from './abilities.js';

export const pcAbilityScores = (build: PcBuild): Record<Ability, number> => {
  const increases = [
    ...build.backgroundIncreases,
    ...build.asiChoices.flatMap((choice) => choice.increases ?? []),
  ];
  return Object.fromEntries(abilities.map((ability) => [
    ability,
    build.abilityGeneration.base[ability]
    + increases
      .filter((increase) => increase.ability === ability)
      .reduce((sum, increase) => sum + increase.amount, 0),
  ])) as Record<Ability, number>;
};

export interface HpMaxInput {
  hitDie: number;
  hpRolls: readonly number[];
  conModifier: number;
  speciesBonus: number;
}

/** Formula unica degli HP massimi: primo dado pieno, poi i tiri registrati. */
export const hpMaxFor = (input: HpMaxInput): number => {
  const { hitDie, hpRolls, conModifier, speciesBonus } = input;
  const first = Math.max(1, hitDie + conModifier + speciesBonus);
  return hpRolls.reduce(
    (total, roll) => total + Math.max(1, roll + conModifier + speciesBonus),
    first,
  );
};

export const pcHpMax = (build: PcBuild, catalog: SrdCatalog): number => {
  const species = catalog.species.find((candidate) => candidate.id === build.speciesId);
  const characterClass = catalog.classes.find((candidate) => candidate.id === build.classId);
  if (characterClass === undefined) {
    throw new Error(`classe inesistente: ${build.classId}`);
  }
  return hpMaxFor({
    hitDie: characterClass.hitDie,
    hpRolls: build.hpRolls,
    conModifier: abilityModifier(pcAbilityScores(build).con),
    speciesBonus: species?.hpPerLevelBonus ?? 0,
  });
};
