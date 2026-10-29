import {
  buildPcStatblock,
  deriveSheet,
  validatePcBuild,
  type Actor,
  type CreatePc,
  type DmSheetView,
  type SheetPatch,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import {
  getActor,
  insertPcActor,
  updateActorSheet,
} from '../db/actors.repository.js';
import { AppError, notFound } from '../errors.js';
import { SrdVersionUnknownError, loadSrdCatalog } from '../srd/load.js';
import { resolveRoll } from './roll-stats.js';
import { updateTokensForActor } from './token-sync.js';

export const createPc = (db: AppDatabase, campaignId: string, input: CreatePc): Actor => {
  if (getCampaign(db, campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  let catalog;
  try {
    catalog = loadSrdCatalog(input.build.rulesVersion);
  } catch (error) {
    if (error instanceof SrdVersionUnknownError) {
      throw new AppError('not_found', 404, error.message);
    }
    throw error;
  }
  const validation = validatePcBuild(input.build, catalog);
  if (!validation.ok) {
    throw new AppError('invalid_build', 422, 'La build non è valida', validation.errors);
  }
  if (input.build.abilityGeneration.method === 'rolled') {
    const rollId = input.build.abilityGeneration.rollId;
    const stored = rollId === undefined ? null : resolveRoll(rollId);
    if (stored === null) {
      throw new AppError('roll_expired', 409, 'Il tiro delle caratteristiche è scaduto');
    }
    const sortedStored = [...stored].sort((a, b) => a - b).join(',');
    const sortedBase = Object.values(input.build.abilityGeneration.base)
      .sort((a, b) => a - b)
      .join(',');
    if (sortedStored !== sortedBase) {
      throw new AppError('invalid_build', 422, 'I punteggi non corrispondono al tiro del server');
    }
  }
  const statblock = buildPcStatblock({ build: input.build, catalog });
  return db.transaction((tx) => insertPcActor(tx, {
    name: input.name,
    campaignId,
    statblock,
    playerNotes: input.playerNotes ?? null,
    dmNotes: input.dmNotes ?? null,
  }));
};

export const getDmSheet = (db: AppDatabase, actorId: string): DmSheetView => {
  const actor = getActor(db, actorId);
  if (actor === null) {
    throw notFound('Attore non trovato');
  }
  if (actor.statblock.kind === 'pc') {
    return {
      actor,
      statblock: actor.statblock,
      derived: deriveSheet({
        statblock: actor.statblock,
        equipped: actor.statblock.snapshot.items,
      }),
      inventory: actor.statblock.snapshot.items,
      sheetVersion: actor.sheetVersion,
    };
  }
  return {
    actor,
    statblock: actor.statblock,
    derived: null,
    inventory: [],
    sheetVersion: actor.sheetVersion,
  };
};

export const patchPcSheet = (
  db: AppDatabase,
  actorId: string,
  input: SheetPatch,
): DmSheetView => {
  const actor = getActor(db, actorId);
  if (actor === null) {
    throw notFound('Attore non trovato');
  }
  if (actor.statblock.kind !== 'pc') {
    throw new AppError('validation_error', 422, 'La scheda è modificabile solo per i personaggi');
  }
  if (actor.sheetVersion !== input.sheetVersion) {
    throw new AppError('sheet_conflict', 409, 'La scheda è stata modificata altrove', {
      currentVersion: actor.sheetVersion,
    });
  }
  const statblock = {
    ...actor.statblock,
    ...(input.patch.hp === undefined ? {} : { hp: input.patch.hp }),
    ...(input.patch.conditions === undefined ? {} : { conditions: input.patch.conditions }),
    ...(input.patch.deathSaves === undefined ? {} : { deathSaves: input.patch.deathSaves }),
    ...(input.patch.currency === undefined ? {} : { currency: input.patch.currency }),
    ...(input.patch.overrides === undefined ? {} : { overrides: input.patch.overrides }),
    ...(input.patch.resources === undefined ? {} : { resources: input.patch.resources }),
    ...(input.patch.hitDice === undefined ? {} : { hitDice: input.patch.hitDice }),
    ...(input.patch.spells === undefined ? {} : { spells: input.patch.spells }),
  };
  const dmNotes = input.patch.dmNotes === undefined ? actor.dmNotes : input.patch.dmNotes;
  db.transaction((tx) => {
    const updated = updateActorSheet(tx, actorId, actor.sheetVersion, statblock, dmNotes);
    if (!updated) {
      throw new AppError('sheet_conflict', 409, 'La scheda è stata modificata altrove', {
        currentVersion: actor.sheetVersion,
      });
    }
    if (actor.campaignId !== null) {
      updateTokensForActor(tx, actor.campaignId, actorId, statblock);
    }
  });
  return getDmSheet(db, actorId);
};
