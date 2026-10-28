import type { Ability } from '../../schemas/common.js';

export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2);

export const proficiencyBonus = (level: number): number => {
  if (level < 1 || level > 20) {
    throw new RangeError(`livello fuori intervallo: ${level}`);
  }
  return 2 + Math.floor((level - 1) / 4);
};

export const pointBuyCost = (score: number): number => {
  if (score < 8 || score > 15) {
    throw new RangeError(`point buy ammette 8-15, ricevuto ${score}`);
  }
  if (score <= 13) {
    return score - 8;
  }
  return 5 + (score - 13) * 2;
};

export const POINT_BUY_BUDGET = 27;
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export const formatModifier = (value: number): string => (value >= 0 ? `+${value}` : String(value));

export const abilityModifiers = (scores: Record<Ability, number>): Record<Ability, number> => ({
  str: abilityModifier(scores.str),
  dex: abilityModifier(scores.dex),
  con: abilityModifier(scores.con),
  int: abilityModifier(scores.int),
  wis: abilityModifier(scores.wis),
  cha: abilityModifier(scores.cha),
});
