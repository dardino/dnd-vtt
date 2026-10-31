import { z } from 'zod';
import {
  gridConfigSchema,
  terrainSchema,
  tokenLightSchema,
} from './scene.js';

export const mapViewSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});
export type MapView = z.infer<typeof mapViewSchema>;

export const spawnSourceSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('srd'), monsterId: z.string().min(1) }),
  z.strictObject({ type: z.literal('actor'), actorId: z.string().uuid() }),
]);
export type SpawnSource = z.infer<typeof spawnSourceSchema>;

export const mapSpawnSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['monster', 'npc']),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  source: spawnSourceSchema,
  label: z.string().min(1).optional(),
  size: z.number().positive().default(1),
  hidden: z.boolean().default(false),
  quantity: z.number().int().min(1).max(20).default(1),
  light: tokenLightSchema.optional(),
});
export type MapSpawn = z.infer<typeof mapSpawnSchema>;

export const playerStartSchema = z.strictObject({
  id: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  label: z.string().min(1).optional(),
});
export type PlayerStart = z.infer<typeof playerStartSchema>;

export const mapDocumentSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  imageAssetId: z.string().uuid().nullable(),
  widthPx: z.number().int().positive().max(20000),
  heightPx: z.number().int().positive().max(20000),
  grid: gridConfigSchema,
  terrain: terrainSchema,
  spawns: z.array(mapSpawnSchema).max(500).default([]),
  playerStarts: z.array(playerStartSchema).max(12).default([]),
  startView: mapViewSchema.optional(),
  fogBase: z.enum(['hidden', 'revealed']).default('hidden'),
  showDoorIcons: z.boolean().default(true),
  notes: z.string().default(''),
});
export type MapDocument = z.infer<typeof mapDocumentSchema>;

export const mapSchema = mapDocumentSchema.extend({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Map = z.infer<typeof mapSchema>;

export const mapSummarySchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string().min(1),
  imageAssetId: z.string().uuid().nullable(),
  imageUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  grid: gridConfigSchema,
  fogBase: z.enum(['hidden', 'revealed']),
  version: z.number().int().min(1),
  walls: z.number().int().min(0),
  lights: z.number().int().min(0),
  spawns: z.number().int().min(0),
  playerStarts: z.number().int().min(0),
  updatedAt: z.string().datetime(),
});
export type MapSummary = z.infer<typeof mapSummarySchema>;

export const mapListSchema = z.strictObject({
  items: z.array(mapSummarySchema),
});
export type MapList = z.infer<typeof mapListSchema>;

export const createMapSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  imageAssetId: z.string().uuid(),
});
export type CreateMap = z.infer<typeof createMapSchema>;

export const putMapSchema = z.strictObject({
  version: z.number().int().min(1),
  document: mapDocumentSchema,
});
export type PutMap = z.infer<typeof putMapSchema>;

export const playerAssignmentSchema = z.strictObject({
  actorId: z.string().uuid(),
  startId: z.string().min(1),
});
export type PlayerAssignment = z.infer<typeof playerAssignmentSchema>;

export const createSceneFromMapSchema = z.strictObject({
  mapId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  fogBase: z.enum(['hidden', 'revealed']).optional(),
  playerAssignments: z.array(playerAssignmentSchema).max(12).default([]),
});
export type CreateSceneFromMap = z.infer<typeof createSceneFromMapSchema>;

export const createSceneFromMapResultSchema = z.strictObject({
  sceneId: z.string().uuid(),
  mapId: z.string().uuid(),
  fogBase: z.enum(['hidden', 'revealed']),
});
export type CreateSceneFromMapResult = z.infer<typeof createSceneFromMapResultSchema>;

// Rende esplicito che il documento della mappa e lo stato iniziale della scena
// condividono lo stesso schema di terreno.
export const mapTerrainDefaults = {
  ambientLight: 'dark' as const,
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [],
  lights: [],
} satisfies z.input<typeof terrainSchema>;

export const emptyMapDocument = (
  name: string,
  imageAssetId: string | null,
  widthPx: number,
  heightPx: number,
): MapDocument => {
  const maxSightFeet = Math.max(1, Math.round((Math.max(widthPx, heightPx) / 70) * 5));
  return {
    name,
    imageAssetId,
    widthPx,
    heightPx,
    grid: {
      type: 'square',
      cellSizePx: 70,
      offsetX: 0,
      offsetY: 0,
      feetPerCell: 5,
      diagonalRule: '5-5-5',
      hexOffset: 'odd-r',
    },
    terrain: {
      ...mapTerrainDefaults,
      visionLimitFeet: Math.min(120, maxSightFeet),
      walls: [],
      lights: [],
    },
    spawns: [],
    playerStarts: [],
    fogBase: 'hidden',
    showDoorIcons: true,
    notes: '',
  };
};
