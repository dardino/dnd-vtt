import { z } from 'zod';

export const diceModeSchema = z.enum(['normal', 'advantage', 'disadvantage']);
export type DiceMode = z.infer<typeof diceModeSchema>;

export const diceVisibilitySchema = z.enum(['public', 'dm']);
export type DiceVisibility = z.infer<typeof diceVisibilitySchema>;

export const diceRollRequestSchema = z.strictObject({
  formula: z.string().trim().min(1).max(100),
  mode: diceModeSchema.default('normal'),
  visibility: diceVisibilitySchema.default('public'),
  sceneId: z.string().uuid().optional(),
  tokenId: z.string().min(1).optional(),
  requestId: z.string().min(1).max(120).optional(),
});
export type DiceRollRequest = z.infer<typeof diceRollRequestSchema>;

export const rolledDieSchema = z.strictObject({
  sides: z.number().int().min(2).max(1000),
  value: z.number().int().min(1),
  dropped: z.boolean(),
});
export type RolledDie = z.infer<typeof rolledDieSchema>;

export const diceRollSchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  sceneId: z.string().uuid().nullable(),
  actorId: z.string().uuid().nullable(),
  tokenId: z.string().min(1).nullable(),
  origin: z.enum(['dm', 'player']),
  formula: z.string().min(1),
  mode: diceModeSchema,
  dice: z.array(rolledDieSchema),
  modifier: z.number().int(),
  total: z.number().int(),
  visibility: diceVisibilitySchema,
  label: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type DiceRoll = z.infer<typeof diceRollSchema>;

export const diceRollListSchema = z.strictObject({
  items: z.array(diceRollSchema),
});
export type DiceRollList = z.infer<typeof diceRollListSchema>;
