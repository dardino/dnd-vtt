import { describe, expect, it } from 'vitest';
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  abilityModifier,
  pointBuyCost,
  proficiencyBonus,
} from './abilities.js';
import { levelForXp, xpForNextLevel, xpThresholdForLevel } from './progression.js';

describe('modificatori e competenza', () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [20, 5],
    [30, 10],
  ])('il punteggio %i dà modificatore %i', (score, modifier) => {
    expect(abilityModifier(score)).toBe(modifier);
  });

  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('il livello %i ha bonus di competenza %i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus);
  });

  it('rifiuta livelli fuori da 1-20', () => {
    expect(() => proficiencyBonus(0)).toThrow(RangeError);
    expect(() => proficiencyBonus(21)).toThrow(RangeError);
  });
});

describe('point buy', () => {
  it.each([
    [8, 0],
    [9, 1],
    [10, 2],
    [11, 3],
    [12, 4],
    [13, 5],
    [14, 7],
    [15, 9],
  ])('il punteggio %i costa %i punti', (score, cost) => {
    expect(pointBuyCost(score)).toBe(cost);
  });

  it('rifiuta punteggi fuori dall intervallo', () => {
    expect(() => pointBuyCost(7)).toThrow(RangeError);
    expect(() => pointBuyCost(16)).toThrow(RangeError);
  });

  it('ha il budget e lo standard array SRD', () => {
    expect(POINT_BUY_BUDGET).toBe(27);
    expect([...STANDARD_ARRAY].sort((a, b) => a - b)).toEqual([8, 10, 12, 13, 14, 15]);
  });
});

describe('avanzamento', () => {
  it('usa le soglie XP SRD 5.2', () => {
    expect(xpThresholdForLevel(1)).toBe(0);
    expect(xpThresholdForLevel(5)).toBe(6500);
    expect(xpThresholdForLevel(20)).toBe(355000);
  });

  it('deriva il livello dagli XP senza superare il 20', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(355000)).toBe(20);
    expect(levelForXp(999999)).toBe(20);
  });

  it('calcola gli XP mancanti al livello successivo', () => {
    expect(xpForNextLevel(1, 0)).toBe(300);
    expect(xpForNextLevel(1, 100)).toBe(200);
    expect(xpForNextLevel(20, 355000)).toBeUndefined();
  });
});
