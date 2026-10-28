import type { Actor, ActorKind, CreateActor, UpdateActor } from '@dnd-vtt/shared';
import { actorStatblockSchema } from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import type { Cursor } from '../db/cursor.js';
import { getCampaign } from '../db/campaigns.repository.js';
import {
  deleteActor,
  getActor,
  insertActor,
  listActors,
  updateActor,
} from '../db/actors.repository.js';
import { AppError, notFound } from '../errors.js';

export interface ActorPageParams {
  limit: number;
  cursor: Cursor | null;
  kind?: ActorKind;
  campaignId?: string;
  query?: string;
}

export const listActorPage = (
  db: AppDatabase,
  page: ActorPageParams,
): { items: Actor[]; nextCursor: string | null } => {
  const { limit, cursor, ...filters } = page;
  return listActors(db, filters, { limit, cursor });
};

export const requireActor = (db: AppDatabase, id: string): Actor => {
  const actor = getActor(db, id);
  if (actor === null) {
    throw notFound('Attore non trovato');
  }
  return actor;
};

export const createActor = (db: AppDatabase, input: CreateActor): Actor => {
  if (input.campaignId !== undefined && getCampaign(db, input.campaignId) === null) {
    throw notFound('Campagna non trovata');
  }
  const parsed = actorStatblockSchema.safeParse(input.statblock);
  if (!parsed.success) {
    throw new AppError('validation_error', 422, 'Statblock non valido', parsed.error.issues);
  }
  return insertActor(db, input);
};

export const patchActor = (
  db: AppDatabase,
  id: string,
  patch: UpdateActor,
): Actor => {
  requireActor(db, id);
  const updated = updateActor(db, id, patch);
  if (updated === null) {
    throw notFound('Attore non trovato');
  }
  return updated;
};

export const removeActor = (db: AppDatabase, id: string): void => {
  requireActor(db, id);
  if (!deleteActor(db, id)) {
    throw notFound('Attore non trovato');
  }
};
