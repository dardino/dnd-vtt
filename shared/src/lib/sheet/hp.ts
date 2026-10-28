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

export const pcHpMax = (build: PcBuild, catalog: SrdCatalog): number => {
  const species = catalog.species.find((candidate) => candidate.id === build.speciesId);
  const characterClass = catalog.classes.find((candidate) => candidate.id === build.classId);
  if (characterClass === undefined) {
    throw new Error(`classe inesistente: ${build.classId}`);
  }
  const conMod = abilityModifier(pcAbilityScores(build).con);
  const speciesBonus = species?.hpPerLevelBonus ?? 0;
  const first = Math.max(1, characterClass.hitDie + conMod + speciesBonus);
  return build.hpRolls.reduce(
    (total, roll) => total + Math.max(1, roll + conMod + speciesBonus),
    first,
  );
};
