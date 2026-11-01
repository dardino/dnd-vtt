import { randomInt, randomUUID } from 'node:crypto';

interface StoredRoll {
  values: number[];
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000;

const rollOnce = (): number => {
  const dice = Array.from({ length: 4 }, () => randomInt(1, 7)).sort((a, b) => b - a);
  return (dice[0] ?? 1) + (dice[1] ?? 1) + (dice[2] ?? 1);
};

export interface RollStatsResult {
  rollId: string;
  values: number[];
  expiresAt: string;
}

export class RollStats {
  private readonly rolls = new Map<string, StoredRoll>();

  rollAbilityScores(now = Date.now()): RollStatsResult {
    for (const [id, entry] of this.rolls) {
      if (entry.expiresAt <= now) {
        this.rolls.delete(id);
      }
    }
    const values = Array.from({ length: 6 }, () => rollOnce());
    const rollId = randomUUID();
    const expiresAt = now + TTL_MS;
    this.rolls.set(rollId, { values, expiresAt });
    return { rollId, values, expiresAt: new Date(expiresAt).toISOString() };
  }

  resolveRoll(rollId: string, now = Date.now()): number[] | null {
    const entry = this.rolls.get(rollId);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAt <= now) {
      this.rolls.delete(rollId);
      return null;
    }
    return [...entry.values];
  }

  dispose(): void {
    this.rolls.clear();
  }
}
