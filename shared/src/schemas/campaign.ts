import { z } from 'zod';

export const advancementModeSchema = z.enum(['milestone', 'xp']);
export type AdvancementMode = z.infer<typeof advancementModeSchema>;

export const fogDefaultSchema = z.enum(['hidden', 'revealed']);
export type FogDefault = z.infer<typeof fogDefaultSchema>;

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().max(4000);

export const campaignSchema = z.strictObject({
  id: z.string().uuid(),
  name: nameSchema,
  description: descriptionSchema,
  activeSceneId: z.string().uuid().nullable(),
  fogDefault: fogDefaultSchema,
  autoApprove: z.boolean(),
  advancementMode: advancementModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const createCampaignSchema = z.strictObject({
  name: nameSchema,
  description: descriptionSchema.default(''),
  fogDefault: fogDefaultSchema.default('hidden'),
  advancementMode: advancementModeSchema.default('milestone'),
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    activeSceneId: z.string().uuid().nullable().optional(),
    fogDefault: fogDefaultSchema.optional(),
    autoApprove: z.boolean().optional(),
    advancementMode: advancementModeSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nessun campo da aggiornare' });
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;

export const campaignListSchema = z.strictObject({
  items: z.array(campaignSchema),
  nextCursor: z.string().nullable(),
});
export type CampaignList = z.infer<typeof campaignListSchema>;
