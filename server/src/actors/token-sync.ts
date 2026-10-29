import {
  actorStatblockSchema,
  sceneStateSchema,
  type PcStatblock,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { actors, scenes } from '../db/schema.js';

const sameHp = (a: TokenState['hp'], b: TokenState['hp']): boolean =>
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

/**
 * Dopo una modifica alla scheda (riposo, level-up, patch DM) rispecchia HP e
 * condizioni sui token dell'attore in tutte le scene della campagna.
 */
export const updateTokensForActor = (
  db: DbExecutor,
  campaignId: string,
  actorId: string,
  statblock: PcStatblock,
): void => {
  const rows = db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).all();
  for (const row of rows) {
    const state = sceneStateSchema.parse(JSON.parse(row.state) as unknown);
    const tokens = state.tokens.map((token) =>
      token.actorId === actorId
        ? { ...token, hp: statblock.hp, conditions: statblock.conditions }
        : token);
    if (tokens.every((token, index) => token === state.tokens[index])) {
      continue;
    }
    db.update(scenes)
      .set({
        state: JSON.stringify({ ...state, tokens }),
        stateVersion: row.stateVersion + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(scenes.id, row.id))
      .run();
  }
};
