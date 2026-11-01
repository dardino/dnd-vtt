import {
  levelUpPcStatblock,
  xpThresholdForLevel,
  type Actor,
  type LevelUpInput,
  type LevelUpPreview,
  type PcStatblock,
} from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { getActor, updateActorSheet } from '../db/actors.repository.js';
import { actors } from '../db/schema.js';
import { AppError, notFound } from '../errors.js';
import { SrdVersionUnknownError, loadSrdCatalog } from '../srd/load.js';
import { getDmSheet } from './pc-service.js';
import { updateTokensForActor } from './token-sync.js';

const loadActorContext = (db: AppDatabase, actorId: string): {
  actor: Actor;
  statblock: PcStatblock;
  catalog: ReturnType<typeof loadSrdCatalog>;
} => {
  const actor = getActor(db, actorId);
  if (actor === null) {
    throw notFound('Attore non trovato');
  }
  if (actor.statblock.kind !== 'pc') {
    throw new AppError('validation_error', 422, 'Solo i personaggi salgono di livello');
  }
  if (actor.rulesVersion === null) {
    throw new AppError('validation_error', 422, 'La scheda non ha una versione SRD');
  }
  try {
    return {
      actor,
      statblock: actor.statblock,
      catalog: loadSrdCatalog(actor.rulesVersion),
    };
  } catch (error) {
    if (error instanceof SrdVersionUnknownError) {
      throw new AppError('not_found', 404, error.message);
    }
    throw error;
  }
};

const compute = (
  db: AppDatabase,
  actorId: string,
  input: LevelUpInput,
): { actor: Actor; statblock: PcStatblock; preview: LevelUpPreview } => {
  const context = loadActorContext(db, actorId);
  let result;
  try {
    result = levelUpPcStatblock(context.statblock, context.catalog, input);
  } catch (error) {
    throw new AppError(
      'validation_error',
      422,
      error instanceof Error ? error.message : 'Level-up non valido',
    );
  }
  return { actor: context.actor, statblock: result.statblock, preview: result.preview };
};

export const previewLevelUp = (
  db: AppDatabase,
  actorId: string,
  input: LevelUpInput,
): LevelUpPreview => compute(db, actorId, input).preview;

export const applyLevelUp = (
  db: AppDatabase,
  actorId: string,
  input: LevelUpInput,
): { sheet: ReturnType<typeof getDmSheet>; preview: LevelUpPreview } => {
  const computed = compute(db, actorId, input);
  const campaignId = computed.actor.campaignId;
  if (campaignId === null) {
    throw new AppError('validation_error', 422, 'Il personaggio non appartiene a una campagna');
  }
  const campaign = getCampaign(db, campaignId);
  if (campaign === null) {
    throw notFound('Campagna non trovata');
  }
  const threshold = xpThresholdForLevel(computed.preview.level);
  if (campaign.advancementMode === 'xp' && computed.actor.xp < threshold) {
    throw new AppError('validation_error', 422, 'XP insufficienti per il livello successivo', {
      required: threshold,
      current: computed.actor.xp,
    });
  }
  const xp = campaign.advancementMode === 'milestone'
    ? Math.max(computed.actor.xp, threshold)
    : computed.actor.xp;
  db.transaction((tx) => {
    const updated = updateActorSheet(
      tx,
      computed.actor.id,
      computed.actor.sheetVersion,
      computed.statblock,
      computed.actor.dmNotes,
    );
    if (!updated) {
      throw new AppError('sheet_conflict', 409, 'La scheda è stata modificata altrove');
    }
    tx.update(actors).set({ xp, updatedAt: new Date().toISOString() })
      .where(eq(actors.id, computed.actor.id))
      .run();
    updateTokensForActor(tx, campaignId, computed.actor.id, computed.statblock, 'dm');
  });
  return { sheet: getDmSheet(db, actorId), preview: computed.preview };
};
