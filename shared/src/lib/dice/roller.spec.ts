import { describe, expect, it } from 'vitest';
import { DiceFormulaError, mulberry32, parseFormula, rollDice } from './roller.js';

describe('parseFormula', () => {
  it('analizza dadi, keep e modificatori', () => {
    expect(parseFormula('4d6kh3+2')).toEqual({
      count: 4,
      sides: 6,
      keep: { mode: 'high', count: 3 },
      modifier: 2,
    });
    expect(parseFormula('2d8-1+2')).toMatchObject({ count: 2, sides: 8, modifier: 1 });
  });

  it('rifiuta formule invalide e limiti', () => {
    expect(() => parseFormula('d20')).toThrow(DiceFormulaError);
    expect(() => parseFormula('101d6')).toThrow(/massimo/);
    expect(() => parseFormula('1d1001')).toThrow(/lati/);
  });
});

describe('rollDice', () => {
  it('produce la stessa sequenza con lo stesso seed', () => {
    const first = rollDice({ formula: '4d6kh3', rng: mulberry32(42) });
    const second = rollDice({ formula: '4d6kh3', rng: mulberry32(42) });
    expect(first).toEqual(second);
    expect(first.dice.filter((die) => !die.dropped)).toHaveLength(3);
  });

  it('applica vantaggio e svantaggio sul d20', () => {
    const advantage = rollDice({ formula: '1d20+5', mode: 'advantage', rng: mulberry32(7) });
    expect(advantage.dice).toHaveLength(2);
    expect(advantage.dice.filter((die) => !die.dropped)).toHaveLength(1);
    expect(advantage.modifier).toBe(5);
    expect(() => rollDice({ formula: '2d6', mode: 'advantage' })).toThrow(/singolo d20/);
  });

  it('somma i dadi tenuti e il modificatore', () => {
    const roll = rollDice({ formula: '2d6+3', rng: () => 2 });
    expect(roll.dice.map((die) => die.value)).toEqual([3, 3]);
    expect(roll.total).toBe(9);
  });
});
