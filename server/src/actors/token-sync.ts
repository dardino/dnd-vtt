import { newId, sceneStateSchema, type PcStatblock } from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import { applySceneActionTx } from '../actions/service.js';
import type { Transaction } from '../db/client.js';
import { scenes } from '../db/schema.js';
import { sameHp } from './actor-sync.js';

const conditionsEqual = (
  left: PcStatblock['conditions'],
  right: PcStatblock['conditions'],
): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * Dopo una modifica alla scheda (riposo, level-up, patch DM) rispecchia HP e
 * condizioni sui token dell'attore in tutte le scene della campagna. Ogni token
 * da aggiornare produce un'azione `token.update` nella stessa transazione, così
 * l'undo copre anche la sincronizzazione.
 */
export const updateTokensForActor = (
  tx: Transaction,
  campaignId: string,
  actorId: string,
  statblock: PcStatblock,
  origin: 'dm' | 'player',
): void => {
  if (campaignId === '') {
    return;
  }
  const rows = tx.select().from(scenes).where(eq(scenes.campaignId, campaignId)).all();
  for (const row of rows) {
    const state = sceneStateSchema.parse(JSON.parse(row.state) as unknown);
    for (const token of state.tokens) {
      if (token.actorId !== actorId) {
        continue;
      }
      if (sameHp(token.hp, statblock.hp) && conditionsEqual(token.conditions, statblock.conditions)) {
        continue;
      }
      applySceneActionTx(tx, {
        campaignId,
        request: {
          id: newId(),
          clientId: 'token-sync',
          sceneId: row.id,
          action: {
            type: 'token.update',
            tokenId: token.id,
            patch: { hp: statblock.hp, conditions: statblock.conditions },
          },
        },
        origin,
        actorId,
      });
    }
  }
};
