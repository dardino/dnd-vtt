import { applyLongRest, applyShortRest, type Actor, type RestRequest } from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { getActor, updateActorSheet } from '../db/actors.repository.js';
import { AppError, notFound } from '../errors.js';
import { updateTokensForActor } from './token-sync.js';

export const restActors = (
  db: AppDatabase,
  campaignId: string,
  input: RestRequest,
): Actor[] => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  return db.transaction((tx) => {
    const ids = [...new Set(input.actorIds)];
    return ids.map((actorId) => {
      const actor = getActor(tx, actorId);
      if (actor === null || actor.campaignId !== campaignId) {
        throw notFound('Attore non trovato');
      }
      if (actor.statblock.kind !== 'pc') {
        throw new AppError('validation_error', 422, 'I riposi si applicano solo ai personaggi');
      }
      const next = input.type === 'short'
        ? applyShortRest(actor.statblock)
        : applyLongRest(actor.statblock);
      const updated = updateActorSheet(tx, actor.id, actor.sheetVersion, next, actor.dmNotes);
      if (!updated) {
        throw new AppError('sheet_conflict', 409, 'La scheda è stata modificata altrove');
      }
      updateTokensForActor(tx, campaignId, actor.id, next);
      const result = getActor(tx, actor.id);
      if (result === null) {
        throw notFound('Attore non trovato');
      }
      return result;
    });
  });
};
