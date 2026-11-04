import { z } from 'zod';
import { DEFAULT_MAP_BACKGROUND_COLOR, mapBackgroundColorSchema } from './color.js';
import { viewSchema } from './common.js';
import { mapLayersSchema } from './map-layers.js';
import { ambientLightSchema, defaultGridConfig, gridConfigSchema } from './scene.js';
import {
  defaultBackgroundTransform,
  type BackgroundTransform,
} from './scene-size.js';

/**
 * Documento mappa v2: i dati di terreno/visione vivono a livello documento, i
 * contenuti sono distribuiti nei quattro layer canonici. Nessun campo della v1
 * (`imageAssetId`, `backgroundTransform`, `terrain`, `spawns`, `playerStarts`)
 * è ammesso a questo livello.
 */
export const mapDocumentV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  name: z.string().trim().min(1).max(120),
  backgroundColor: mapBackgroundColorSchema.default(DEFAULT_MAP_BACKGROUND_COLOR),
  widthPx: z.number().int().positive().max(20000),
  heightPx: z.number().int().positive().max(20000),
  grid: gridConfigSchema,
  layers: mapLayersSchema,
  ambientLight: ambientLightSchema.default('dark'),
  visionLimitFeet: z.number().positive().default(120),
  visionEnabled: z.boolean().default(true),
  startView: viewSchema.optional(),
  fogBase: z.enum(['hidden', 'revealed']).default('hidden'),
  showDoorIcons: z.boolean().default(true),
  notes: z.string().default(''),
});
export type MapDocumentV2 = z.infer<typeof mapDocumentV2Schema>;

/** Documento v2 vuoto con i quattro layer canonici (id = kind). */
export const emptyMapDocumentV2 = (
  name: string,
  imageAssetId: string | null,
  widthPx: number,
  heightPx: number,
  backgroundTransform: BackgroundTransform = defaultBackgroundTransform,
): MapDocumentV2 => {
  const maxSightFeet = Math.max(1, Math.round((Math.max(widthPx, heightPx) / 70) * 5));
  return {
    schemaVersion: 2,
    name,
    backgroundColor: DEFAULT_MAP_BACKGROUND_COLOR,
    widthPx,
    heightPx,
    grid: { ...defaultGridConfig },
    layers: [
      {
        id: 'background',
        kind: 'background',
        visible: true,
        locked: false,
        opacity: 1,
        imageAssetId,
        imageTransform: { ...backgroundTransform },
      },
      { id: 'graphics', kind: 'graphics', visible: true, locked: false, opacity: 1, items: [] },
      {
        id: 'constraints', kind: 'constraints', visible: true, locked: false, opacity: 1, items: [],
      },
      { id: 'elements', kind: 'elements', visible: true, locked: false, opacity: 1, items: [] },
    ],
    ambientLight: 'dark',
    visionLimitFeet: Math.min(120, maxSightFeet),
    visionEnabled: true,
    fogBase: 'hidden',
    showDoorIcons: true,
    notes: '',
  };
};
