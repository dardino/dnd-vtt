import type { DiceMode, RolledDie } from '../../schemas/dice.js';

export const MAX_DICE = 100;
export const MAX_SIDES = 1000;
export const MAX_FORMULA_LENGTH = 100;

export type DiceErrorCode = 'invalid_formula' | 'too_many_dice' | 'invalid_sides';

export class DiceFormulaError extends Error {
  public readonly code: DiceErrorCode;

  public constructor(code: DiceErrorCode, message: string) {
    super(message);
    this.name = 'DiceFormulaError';
    this.code = code;
  }
}

export interface ParsedFormula {
  count: number;
  sides: number;
  keep?: { mode: 'high' | 'low'; count: number };
  modifier: number;
}

export interface DiceRollResult {
  formula: string;
  mode: DiceMode;
  dice: RolledDie[];
  modifier: number;
  total: number;
}

export type DiceRng = (sides: number) => number;

const FORMULA_PATTERN = /^(\d{1,3})d(\d{1,4})(?:(kh|kl)(\d{1,3}))?((?:[+-]\d{1,3})*)$/i;

const parseModifier = (raw: string): number => {
  if (raw === '') {
    return 0;
  }
  const parts = raw.match(/[+-]\d{1,3}/g) ?? [];
  return parts.reduce((sum, part) => sum + Number(part), 0);
};

export const parseFormula = (formula: string): ParsedFormula => {
  const normalized = formula.replaceAll(/\s+/g, '');
  if (normalized.length === 0 || normalized.length > MAX_FORMULA_LENGTH) {
    throw new DiceFormulaError('invalid_formula', 'La formula non è valida');
  }
  const match = FORMULA_PATTERN.exec(normalized);
  if (match === null) {
    throw new DiceFormulaError('invalid_formula', 'La formula deve avere la forma 2d6+3 o 4d6kh3');
  }
  const count = Number(match[1]);
  const sides = Number(match[2]);
  if (count < 1 || count > MAX_DICE) {
    throw new DiceFormulaError('too_many_dice', `Sono ammessi al massimo ${MAX_DICE} dadi`);
  }
  if (sides < 2 || sides > MAX_SIDES) {
    throw new DiceFormulaError('invalid_sides', `I lati devono essere fra 2 e ${MAX_SIDES}`);
  }
  const keepMode = match[3]?.toLowerCase();
  const keepCount = match[4] === undefined ? undefined : Number(match[4]);
  if (keepMode !== undefined && keepCount !== undefined) {
    if (keepCount < 1 || keepCount > count) {
      throw new DiceFormulaError('invalid_formula', 'Il numero di dadi da tenere non è valido');
    }
    return {
      count,
      sides,
      keep: { mode: keepMode === 'kh' ? 'high' : 'low', count: keepCount },
      modifier: parseModifier(match[5] ?? ''),
    };
  }
  return { count, sides, modifier: parseModifier(match[5] ?? '') };
};

/** RNG crittografico senza bias modulo, usato di default anche dal server (D12). */
export const cryptoRng: DiceRng = (sides) => {
  const cryptoApi = (globalThis as {
    crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array };
  }).crypto;
  if (cryptoApi === undefined || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto non disponibile');
  }
  const limit = Math.floor(0x1_0000_0000 / sides) * sides;
  const buffer = new Uint32Array(1);
  let value = limit;
  while (value >= limit) {
    cryptoApi.getRandomValues(buffer);
    value = buffer[0] ?? 0;
  }
  return value % sides;
};

export const mulberry32 = (seed: number): DiceRng => {
  let state = seed >>> 0;
  return (sides) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const result = ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    return Math.floor(result * sides);
  };
};

const applyKeep = (
  dice: RolledDie[],
  keep: ParsedFormula['keep'],
): RolledDie[] => {
  if (keep === undefined) {
    return dice;
  }
  const dropCount = dice.length - keep.count;
  const ordered = [...dice].sort((a, b) =>
    keep.mode === 'high' ? a.value - b.value : b.value - a.value);
  const dropped = new Set(ordered.slice(0, dropCount));
  return dice.map((die) => ({ ...die, dropped: dropped.has(die) }));
};

export interface RollDiceInput {
  formula: string;
  mode?: DiceMode;
  rng?: DiceRng;
}

export const rollDice = ({ formula, mode = 'normal', rng = cryptoRng }: RollDiceInput): DiceRollResult => {
  const parsed = parseFormula(formula);
  const advantage = mode !== 'normal';
  if (advantage && (parsed.sides !== 20 || parsed.count !== 1 || parsed.keep !== undefined)) {
    throw new DiceFormulaError(
      'invalid_formula',
      'Vantaggio e svantaggio valgono solo per un singolo d20',
    );
  }
  const count = advantage ? 2 : parsed.count;
  const keep = advantage
    ? { mode: mode === 'advantage' ? 'high' as const : 'low' as const, count: 1 }
    : parsed.keep;
  const raw = Array.from({ length: count }, () => ({
    sides: parsed.sides,
    value: rng(parsed.sides) + 1,
    dropped: false,
  }));
  const dice = applyKeep(raw, keep);
  const total = dice
    .filter((die) => !die.dropped)
    .reduce((sum, die) => sum + die.value, parsed.modifier);
  return {
    formula,
    mode,
    dice,
    modifier: parsed.modifier,
    total,
  };
};

export const rollWithMode = (
  formula: string,
  mode: DiceMode,
  rng: DiceRng = cryptoRng,
): DiceRollResult => rollDice({ formula, mode, rng });
