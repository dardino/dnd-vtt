import {
  deriveSheet,
  playerEditableFieldSchema,
  type Actor,
  type CreatePlayerLinkResult,
  type PlayerEditableField,
  type PlayerLink,
  type PlayerSheetPatch,
  type PlayerSheetView,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import {
  getActor,
  getActorRow,
  updateActorPlayerNotes,
  updateActorSheet,
} from '../db/actors.repository.js';
import {
  getActiveLinkForActor,
  getEditableFields,
  getLinkByToken,
  insertPlayerLink,
  newPlayerToken,
  revokeLinksForActor,
  setLinkEditing,
  touchPlayerLink,
} from '../db/player-links.repository.js';
import { AppError, notFound } from '../errors.js';
import { updateTokensForActor } from '../actors/token-sync.js';

const DEFAULT_EDITABLE = playerEditableFieldSchema.options;

const playerActor = (actor: Actor): Omit<Actor, 'dmNotes'> => {
  const { dmNotes, ...rest } = actor;
  void dmNotes;
  return rest;
};

const viewFor = (db: AppDatabase, link: PlayerLink): PlayerSheetView => {
  const actor = getActor(db, link.actorId);
  const row = getActorRow(db, link.actorId);
  const campaign = getCampaign(db, link.campaignId);
  if (actor === null || row === null || campaign === null || actor.statblock.kind !== 'pc') {
    throw notFound('Scheda non disponibile');
  }
  const editable = getEditableFields(db, link.id)
    .filter((field): field is PlayerEditableField =>
      (playerEditableFieldSchema.options as string[]).includes(field));
  return {
    actor: playerActor(actor),
    statblock: actor.statblock,
    derived: deriveSheet({ statblock: actor.statblock, equipped: actor.statblock.snapshot.items }),
    inventory: actor.statblock.snapshot.items,
    playerNotes: row.playerNotes ?? '',
    sheetVersion: actor.sheetVersion,
    campaign: { id: campaign.id, name: campaign.name },
    editingEnabled: link.editingEnabled,
    editable,
    autoApprove: campaign.autoApprove,
  };
};

export const createPlayerLink = (
  db: AppDatabase,
  actorId: string,
  publicUrl: string,
): CreatePlayerLinkResult => {
  const actor = getActor(db, actorId);
  if (actor === null || actor.campaignId === null || actor.statblock.kind !== 'pc') {
    throw new AppError('validation_error', 422, 'Il link giocatore richiede un personaggio in campagna');
  }
  return db.transaction((tx) => {
    revokeLinksForActor(tx, actorId);
    const token = newPlayerToken();
    const link = insertPlayerLink(tx, {
      campaignId: actor.campaignId ?? '',
      actorId,
      token,
      editable: [...DEFAULT_EDITABLE],
      label: actor.name,
    });
    return {
      link,
      token,
      url: `${publicUrl.replace(/\/$/, '')}/play/${token}`,
    };
  });
};

export const activePlayerLink = (db: AppDatabase, actorId: string): PlayerLink | null =>
  getActiveLinkForActor(db, actorId);

export const setPlayerEditing = (
  db: AppDatabase,
  actorId: string,
  enabled: boolean,
): PlayerLink | null => setLinkEditing(db, actorId, enabled);

export const playerSheetByToken = (db: AppDatabase, token: string): PlayerSheetView => {
  const link = getLinkByToken(db, token);
  if (link === null) {
    throw notFound('Scheda non trovata');
  }
  touchPlayerLink(db, link.id);
  return viewFor(db, link);
};

export const patchPlayerSheet = (
  db: AppDatabase,
  token: string,
  input: PlayerSheetPatch,
): PlayerSheetView => {
  const link = getLinkByToken(db, token);
  if (link === null) {
    throw notFound('Scheda non trovata');
  }
  if (!link.editingEnabled) {
    throw new AppError('editing_disabled', 403, 'La matita è spenta: scheda in sola lettura');
  }
  const actor = getActor(db, link.actorId);
  if (actor === null || actor.statblock.kind !== 'pc') {
    throw notFound('Scheda non trovata');
  }
  if (actor.sheetVersion !== input.sheetVersion) {
    throw new AppError('sheet_conflict', 409, 'La scheda è stata modificata altrove', {
      currentVersion: actor.sheetVersion,
    });
  }
  const editable = new Set(getEditableFields(db, link.id));
  const unauthorised = Object.keys(input.patch).filter((field) =>
    field !== 'playerNotes' && !editable.has(field));
  if (unauthorised.length > 0) {
    throw new AppError('forbidden', 403, 'Campo non modificabile dal link giocatore');
  }
  const statblock = {
    ...actor.statblock,
    ...(input.patch.hp === undefined ? {} : { hp: input.patch.hp }),
    ...(input.patch.conditions === undefined ? {} : { conditions: input.patch.conditions }),
    ...(input.patch.deathSaves === undefined ? {} : { deathSaves: input.patch.deathSaves }),
    ...(input.patch.currency === undefined ? {} : { currency: input.patch.currency }),
    ...(input.patch.resources === undefined ? {} : { resources: input.patch.resources }),
    ...(input.patch.hitDice === undefined ? {} : { hitDice: input.patch.hitDice }),
    ...(input.patch.spells === undefined ? {} : { spells: input.patch.spells }),
  };
  db.transaction((tx) => {
    const updated = updateActorSheet(tx, actor.id, actor.sheetVersion, statblock, actor.dmNotes);
    if (!updated) {
      throw new AppError('sheet_conflict', 409, 'La scheda è stata modificata altrove');
    }
    if (input.patch.playerNotes !== undefined) {
      updateActorPlayerNotes(tx, actor.id, input.patch.playerNotes);
    }
    updateTokensForActor(tx, actor.campaignId ?? '', actor.id, statblock);
  });
  return playerSheetByToken(db, token);
};
