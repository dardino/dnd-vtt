import { z } from 'zod';
import { actorStatblockSchema, hpSchema } from './sheet.js';

export const actorKindSchema = z.enum(['monster', 'npc', 'pc']);
export type ActorKind = z.infer<typeof actorKindSchema>;

/**
 * Attore come lo vede la console DM: `playerNotes` non attraversa mai questo
 * confine (D26). Per i `pc` lo stato canonico degli HP è nell'attore.
 */
export const actorSchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid().nullable(),
  kind: actorKindSchema,
  name: z.string().min(1),
  statblock: actorStatblockSchema,
  rulesVersion: z.string().nullable(),
  xp: z.number().int().min(0),
  sheetVersion: z.number().int().min(1),
  dmNotes: z.string().nullable(),
  imageAssetId: z.string().uuid().nullable(),
  hp: hpSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Actor = z.infer<typeof actorSchema>;

const createActorBase = {
  campaignId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  statblock: actorStatblockSchema,
  rulesVersion: z.string().min(1).optional(),
  xp: z.number().int().min(0).default(0),
  dmNotes: z.string().max(20000).optional(),
  imageAssetId: z.string().uuid().optional(),
} as const;

/**
 * In Fase 2 si creano solo mostri e NPC: il `pc` nasce dalla build completa
 * della Fase 3b, che è l'unica strada per avere snapshot e derivati coerenti.
 */
export const createActorSchema = z
  .strictObject({ ...createActorBase, kind: z.enum(['monster', 'npc']) })
  .refine((value) => value.statblock.kind === value.kind, {
    message: 'statblock.kind deve coincidere con kind',
    path: ['statblock', 'kind'],
  });
export type CreateActor = z.infer<typeof createActorSchema>;

export const updateActorSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
    imageAssetId: z.string().uuid().nullable().optional(),
    xp: z.number().int().min(0).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nessun campo da aggiornare' });
export type UpdateActor = z.infer<typeof updateActorSchema>;

export const actorListSchema = z.strictObject({
  items: z.array(actorSchema),
  nextCursor: z.string().nullable(),
});
export type ActorList = z.infer<typeof actorListSchema>;
