import { randomInt, randomUUID } from 'node:crypto';

interface StoredRoll {
  values: number[];
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const rolls = new Map<string, StoredRoll>();

const rollOnce = (): number => {
  const dice = Array.from({ length: 4 }, () => randomInt(1, 7)).sort((a, b) => b - a);
  return (dice[0] ?? 1) + (dice[1] ?? 1) + (dice[2] ?? 1);
};

export interface RollStatsResult {
  rollId: string;
  values: number[];
  expiresAt: string;
}

export const rollAbilityScores = (now = Date.now()): RollStatsResult => {
  for (const [id, entry] of rolls) {
    if (entry.expiresAt <= now) {
      rolls.delete(id);
    }
  }
  const values = Array.from({ length: 6 }, () => rollOnce());
  const rollId = randomUUID();
  const expiresAt = now + TTL_MS;
  rolls.set(rollId, { values, expiresAt });
  return { rollId, values, expiresAt: new Date(expiresAt).toISOString() };
};

export const resolveRoll = (rollId: string, now = Date.now()): number[] | null => {
  const entry = rolls.get(rollId);
  if (entry === undefined) {
    return null;
  }
  if (entry.expiresAt <= now) {
    rolls.delete(rollId);
    return null;
  }
  return [...entry.values];
};
