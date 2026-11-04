import { z } from 'zod';
import { DEFAULT_MAP_BACKGROUND_COLOR, mapBackgroundColorSchema } from './color.js';
import { viewSchema } from './common.js';
import { mapDocumentV2Schema, type MapDocumentV2 } from './map-document.js';
import type { MapLayers } from './map-layers.js';
import { mapSpawnSchema, playerStartSchema } from './map-spawn.js';
import { gridConfigSchema, terrainSchema } from './scene.js';
import { backgroundTransformSchema, defaultBackgroundTransform } from './scene-size.js';

/**
 * Copia congelata del documento mappa v1: serve solo alla migrazione, così
 * l'evoluzione dello schema pubblico (`map.ts`) non può alterare la lettura dei
 * documenti storici. Non ha `schemaVersion`; una v1 che la include è invalida.
 */
export const legacyMapDocumentSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  imageAssetId: z.string().uuid().nullable(),
  backgroundTransform: backgroundTransformSchema.default(defaultBackgroundTransform),
  backgroundColor: mapBackgroundColorSchema.default(DEFAULT_MAP_BACKGROUND_COLOR),
  widthPx: z.number().int().positive().max(20000),
  heightPx: z.number().int().positive().max(20000),
  grid: gridConfigSchema,
  terrain: terrainSchema,
  spawns: z.array(mapSpawnSchema).max(500).default([]),
  playerStarts: z.array(playerStartSchema).max(12).default([]),
  startView: viewSchema.optional(),
  fogBase: z.enum(['hidden', 'revealed']).default('hidden'),
  showDoorIcons: z.boolean().default(true),
  notes: z.string().default(''),
});
export type LegacyMapDocument = z.infer<typeof legacyMapDocumentSchema>;

const migrateLegacyDocument = (doc: LegacyMapDocument): MapDocumentV2 => ({
  schemaVersion: 2,
  name: doc.name,
  backgroundColor: doc.backgroundColor,
  widthPx: doc.widthPx,
  heightPx: doc.heightPx,
  grid: doc.grid,
  layers: [
    {
      id: 'background',
      kind: 'background',
      visible: true,
      locked: false,
      opacity: 1,
      imageAssetId: doc.imageAssetId,
      imageTransform: { ...doc.backgroundTransform },
    },
    { id: 'graphics', kind: 'graphics', visible: true, locked: false, opacity: 1, items: [] },
    {
      id: 'constraints',
      kind: 'constraints',
      visible: true,
      locked: false,
      opacity: 1,
      items: doc.terrain.walls.map((wall) => ({ ...wall, a: { ...wall.a }, b: { ...wall.b } })),
    },
    {
      id: 'elements',
      kind: 'elements',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        ...doc.terrain.lights.map((light) => ({ ...light, type: 'light' as const })),
        ...doc.spawns.map((spawn) => ({ ...spawn, type: 'spawn' as const })),
        ...doc.playerStarts.map((start) => ({ ...start, type: 'start' as const })),
      ],
    },
  ] satisfies MapLayers,
  ambientLight: doc.terrain.ambientLight,
  visionLimitFeet: doc.terrain.visionLimitFeet,
  visionEnabled: doc.terrain.visionEnabled,
  ...(doc.startView === undefined ? {} : { startView: doc.startView }),
  fogBase: doc.fogBase,
  showDoorIcons: doc.showDoorIcons,
  notes: doc.notes,
});

/**
 * Migra un documento mappa v1 al formato v2. È pura e idempotente: un input già
 * v2 viene validato e restituito tal quale, qualsiasi input invalido lancia
 * `ZodError`.
 */
export const migrateMapDocument = (input: unknown): MapDocumentV2 => {
  const current = mapDocumentV2Schema.safeParse(input);
  if (current.success) {
    return current.data;
  }
  return migrateLegacyDocument(legacyMapDocumentSchema.parse(input));
};
