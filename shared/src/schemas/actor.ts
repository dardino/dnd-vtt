import { z } from 'zod';
import { conditionSchema, currencySchema } from './common.js';
import { pcBuildSchema } from './build.js';
import {
  abilityIncreaseSchema,
  actorStatblockSchema,
  deathSavesSchema,
  derivedSheetSchema,
  hitDiceSchema,
  hpSchema,
  overridesSchema,
  resolvedFeatureSchema,
  resolvedItemSchema,
  resourcePoolSchema,
  spellSelectionSchema,
  spellSlotPoolSchema,
} from './sheet.js';

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

export const createPcSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  alignment: z.string().max(80).optional(),
  playerNotes: z.string().max(20000).optional(),
  dmNotes: z.string().max(20000).optional(),
  build: pcBuildSchema,
});
export type CreatePc = z.infer<typeof createPcSchema>;

export const sheetPatchSchema = z.strictObject({
  sheetVersion: z.number().int().min(1),
  patch: z.strictObject({
    hp: hpSchema.optional(),
    conditions: z.array(conditionSchema).optional(),
    deathSaves: deathSavesSchema.optional(),
    currency: currencySchema.optional(),
    overrides: overridesSchema.optional(),
    resources: z.array(resourcePoolSchema).optional(),
    hitDice: hitDiceSchema.optional(),
    spells: spellSelectionSchema.optional(),
    dmNotes: z.string().max(20000).nullable().optional(),
  }),
});
export type SheetPatch = z.infer<typeof sheetPatchSchema>;

export const restRequestSchema = z.strictObject({
  type: z.enum(['short', 'long']),
  actorIds: z.array(z.string().uuid()).min(1).max(20),
});
export type RestRequest = z.infer<typeof restRequestSchema>;

export const restResultSchema = z.strictObject({
  actors: z.array(actorSchema),
});
export type RestResult = z.infer<typeof restResultSchema>;

export const levelUpInputSchema = z.strictObject({
  hpMethod: z.enum(['average', 'roll']),
  hpRoll: z.number().int().min(1).max(12).optional(),
  subclassId: z.string().min(1).optional(),
  abilityIncreases: z.array(abilityIncreaseSchema).max(2).optional(),
  featId: z.string().min(1).optional(),
});
export type LevelUpInput = z.infer<typeof levelUpInputSchema>;

export const levelUpPreviewSchema = z.strictObject({
  level: z.number().int().min(2).max(20),
  hpMax: z.number().int().min(1),
  hpGain: z.number().int(),
  features: z.array(resolvedFeatureSchema),
  slots: z.array(spellSlotPoolSchema),
  pactSlots: z
    .strictObject({ level: z.number().int().min(1).max(9), max: z.number().int().min(1) })
    .optional(),
  abilityIncreases: z.array(abilityIncreaseSchema),
});
export type LevelUpPreview = z.infer<typeof levelUpPreviewSchema>;

export const dmSheetViewSchema = z.strictObject({
  actor: actorSchema,
  statblock: actorStatblockSchema,
  derived: derivedSheetSchema.nullable(),
  inventory: z.array(resolvedItemSchema),
  sheetVersion: z.number().int().min(1),
});
export type DmSheetView = z.infer<typeof dmSheetViewSchema>;

export const levelUpResultSchema = z.strictObject({
  sheet: dmSheetViewSchema,
  preview: levelUpPreviewSchema,
});
export type LevelUpResult = z.infer<typeof levelUpResultSchema>;
