import {
  actorStatblockSchema,
  type PcStatblock,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { actors } from '../db/schema.js';

export const sameHp = (a: TokenState['hp'], b: TokenState['hp']): boolean =>
  a.current === b.current && a.max === b.max && a.temp === b.temp;

/**
 * Per i `pc` lo stato canonico è sull'attore: dopo un'azione di scena che
 * tocca un token collegato, l'attore viene riallineato nella stessa transazione.
 */
export const syncPcActorsFromState = (db: DbExecutor, state: SceneState): void => {
  for (const token of state.tokens) {
    if (token.actorId === undefined) {
      continue;
    }
    const row = db.select().from(actors).where(eq(actors.id, token.actorId)).get();
    if (row === undefined || row.kind !== 'pc') {
      continue;
    }
    const statblock = actorStatblockSchema.parse(JSON.parse(row.statblock) as unknown);
    if (statblock.kind !== 'pc') {
      continue;
    }
    const conditionsEqual = JSON.stringify(statblock.conditions) === JSON.stringify(token.conditions);
    if (sameHp(statblock.hp, token.hp) && conditionsEqual) {
      continue;
    }
    const next: PcStatblock = {
      ...statblock,
      hp: token.hp,
      conditions: token.conditions,
    };
    db.update(actors)
      .set({
        statblock: JSON.stringify(next),
        hpCurrent: next.hp.current,
        hpMax: next.hp.max,
        hpTemp: next.hp.temp,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(actors.id, token.actorId))
      .run();
  }
};
