import { z } from 'zod';
import { actorSchema } from './actor.js';
import { imageMimeSchema } from './common.js';
import { campaignSchema } from './campaign.js';
import { mapSchema, type Map } from './map.js';
import { legacyMapDocumentSchema, migrateMapDocument } from './map-legacy.js';
import { programStateSchema } from './program.js';
import { sceneSchema, sceneStateSchema } from './scene.js';
import { sessionSchema } from './session.js';

export const exportAssetSchema = z.strictObject({
  id: z.string().uuid(),
  mime: imageMimeSchema,
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

/**
 * Voce mappa di un bundle v1: i metadati DTO convivono con il documento piatto
 * storico (`backgroundTransform`, `terrain`, `spawns`, `playerStarts`). La
 * trasformazione produce una voce già v2, così il resto del bundle resta
 * validato dallo stesso `campaignExportSchema` dell'export.
 */
const legacyExportMapSchema = legacyMapDocumentSchema
  .extend({
    id: z.string().uuid(),
    campaignId: z.string().uuid(),
    version: z.number().int().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    thumbAssetId: z.string().uuid().nullable().optional(),
    compositeAssetId: z.string().uuid().nullable().optional(),
  })
  .transform((entry): Map => {
    const {
      id,
      campaignId,
      version,
      createdAt,
      updatedAt,
      thumbAssetId,
      compositeAssetId,
      ...legacyDocument
    } = entry;
    const documentV2 = migrateMapDocument(legacyDocument);
    return {
      id,
      campaignId,
      version,
      createdAt,
      updatedAt,
      ...documentV2,
      // I derivati non facevano parte del bundle v1: restano assenti.
      thumbAssetId: thumbAssetId ?? null,
      compositeAssetId: compositeAssetId ?? null,
      imageAssetId: entry.imageAssetId ?? documentV2.layers[0].imageAssetId,
    };
  });

/**
 * Accetta i bundle attuali e quelli v1 con mappe in formato piatto. La
 * normalizzazione è pura: le voci legacy vengono migrate a v2 prima che il
 * resto del bundle venga validato.
 */
export const campaignImportSchema = campaignExportSchema.extend({
  maps: z.array(z.union([mapSchema, legacyExportMapSchema])),
});

export const normalizeCampaignExport = (input: unknown): CampaignExport =>
  campaignImportSchema.parse(input);

export const importResultSchema = z.strictObject({
  campaign: campaignSchema,
  imported: z.strictObject({
    scenes: z.number().int().min(0),
    actors: z.number().int().min(0),
    assets: z.number().int().min(0),
  }),
});
export type ImportResult = z.infer<typeof importResultSchema>;
