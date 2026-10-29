import { and, desc, eq, notInArray, type SQL } from 'drizzle-orm';
import type { DiceRoll, DiceRollList, DiceVisibility } from '@dnd-vtt/shared';
import type { DbExecutor } from './client.js';
import { toDiceRoll } from './mappers.js';
import { diceRolls } from './schema.js';

export interface DiceRollInsert {
  id: string;
  campaignId: string;
  sceneId: string | null;
  actorId: string | null;
  tokenId: string | null;
  origin: 'dm' | 'player';
  formula: string;
  mode: DiceRoll['mode'];
  dice: DiceRoll['dice'];
  modifier: number;
  total: number;
  visibility: DiceVisibility;
  label: string | null;
  createdAt: string;
}

export const insertDiceRoll = (db: DbExecutor, input: DiceRollInsert): DiceRoll => {
  const row = { ...input, dice: JSON.stringify(input.dice) };
  db.insert(diceRolls).values(row).run();
  return toDiceRoll(row);
};

export const listDiceRolls = (
  db: DbExecutor,
  campaignId: string,
  visibility?: DiceVisibility,
): DiceRollList => {
  const filters: (SQL | undefined)[] = [
    eq(diceRolls.campaignId, campaignId),
    visibility === undefined ? undefined : eq(diceRolls.visibility, visibility),
  ];
  const rows = db
    .select()
    .from(diceRolls)
    .where(and(...filters))
    .orderBy(desc(diceRolls.createdAt), desc(diceRolls.id))
    .limit(200)
    .all();
  return { items: rows.map(toDiceRoll) };
};

/** Retention FIFO: restano gli ultimi 200 tiri della campagna. */
export const pruneDiceRolls = (db: DbExecutor, campaignId: string): void => {
  const keep = db
    .select({ id: diceRolls.id })
    .from(diceRolls)
    .where(eq(diceRolls.campaignId, campaignId))
    .orderBy(desc(diceRolls.createdAt), desc(diceRolls.id))
    .limit(200);
  db.delete(diceRolls)
    .where(and(eq(diceRolls.campaignId, campaignId), notInArray(diceRolls.id, keep)))
    .run();
};
