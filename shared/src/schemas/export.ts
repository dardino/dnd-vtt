import { z } from 'zod';
import { actorSchema } from './actor.js';
import { campaignSchema } from './campaign.js';
import { mapSchema } from './map.js';
import { programStateSchema } from './program.js';
import { sceneSchema, sceneStateSchema } from './scene.js';
import { sessionSchema } from './session.js';

export const exportAssetSchema = z.strictObject({
  id: z.string().uuid(),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(1),
});
export type ExportAsset = z.infer<typeof exportAssetSchema>;

/**
 * `playerNotes` entra nel bundle solo quando il DM lo richiede esplicitamente
 * (D31); il campo resta opzionale per i backup creati senza note private.
 */
export const exportActorSchema = actorSchema.extend({
  playerNotes: z.string().nullable().optional(),
});
export type ExportActor = z.infer<typeof exportActorSchema>;

export const campaignExportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  campaign: campaignSchema,
  maps: z.array(mapSchema),
  scenes: z.array(z.strictObject({ scene: sceneSchema, state: sceneStateSchema })),
  actors: z.array(exportActorSchema),
  program: programStateSchema.nullable(),
  assets: z.array(exportAssetSchema),
  sessions: z.array(sessionSchema),
});
export type CampaignExport = z.infer<typeof campaignExportSchema>;

export const importResultSchema = z.strictObject({
  campaign: campaignSchema,
  imported: z.strictObject({
    scenes: z.number().int().min(0),
    actors: z.number().int().min(0),
    assets: z.number().int().min(0),
  }),
});
export type ImportResult = z.infer<typeof importResultSchema>;
