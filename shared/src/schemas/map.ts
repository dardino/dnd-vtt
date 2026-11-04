import { z } from 'zod';
import { viewSchema } from './common.js';
import { defaultGridConfig, gridConfigSchema, terrainSchema, tokenLightSchema } from './scene.js';
import {
  backgroundTransformSchema,
  defaultBackgroundTransform,
  orientationSchema,
  resolutionPresetSchema,
  type BackgroundTransform,
  type Orientation,
  type ResolutionPreset,
} from './scene-size.js';

export interface SceneDimensions {
  widthPx: number;
  heightPx: number;
}

/** Colore del foglio di una mappa senza immagine, in formato CSS `rgba()`. */
export const DEFAULT_MAP_BACKGROUND_COLOR = 'rgba(255, 255, 255, 1)';

const MAP_COLOR_CHANNEL = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const MAP_COLOR_ALPHA = '(?:0|1|0?\\.\\d+)';
export const mapBackgroundColorSchema = z
  .string()
  .regex(
    new RegExp(
      `^rgba\\(${MAP_COLOR_CHANNEL}, ${MAP_COLOR_CHANNEL}, ${MAP_COLOR_CHANNEL}, ${MAP_COLOR_ALPHA}\\)$`,
    ),
    { message: 'Il colore deve essere nel formato rgba(r, g, b, a)' },
  );

/**
 * Dimensioni canoniche per preset e orientamento. Ultrawide esiste solo in
 * landscape: in portrait `sceneDimensions` ripiega sulle dimensioni landscape
 * invece di restituire una coppia inventata.
 */
export const SCENE_PRESETS: Record<
  ResolutionPreset,
  { landscape: SceneDimensions; portrait: SceneDimensions | null }
> = {
  '720p': {
    landscape: { widthPx: 1280, heightPx: 720 },
    portrait: { widthPx: 720, heightPx: 1280 },
  },
  '1080p': {
    landscape: { widthPx: 1920, heightPx: 1080 },
    portrait: { widthPx: 1080, heightPx: 1920 },
  },
  '1440p': {
    landscape: { widthPx: 2560, heightPx: 1440 },
    portrait: { widthPx: 1440, heightPx: 2560 },
  },
  '4k': {
    landscape: { widthPx: 3840, heightPx: 2160 },
    portrait: { widthPx: 2160, heightPx: 3840 },
  },
  'ultrawide-720p': {
    landscape: { widthPx: 1680, heightPx: 720 },
    portrait: null,
  },
  'ultrawide-1080p': {
    landscape: { widthPx: 2560, heightPx: 1080 },
    portrait: null,
  },
  'ultrawide-1440p': {
    landscape: { widthPx: 3440, heightPx: 1440 },
    portrait: null,
  },
  'ultrawide-4k': {
    landscape: { widthPx: 5120, heightPx: 2160 },
    portrait: null,
  },
};

/** Fallback documentato: ultrawide + portrait restituisce il preset landscape. */
export const sceneDimensions = (
  preset: ResolutionPreset,
  orientation: Orientation,
): SceneDimensions => {
  const entry = SCENE_PRESETS[preset];
  if (orientation === 'portrait') {
    return entry.portrait ?? entry.landscape;
  }
  return entry.landscape;
};

export const mapViewSchema = viewSchema;
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

/**
 * `widthPx`/`heightPx` restano opzionali per compatibilità e, se presenti,
 * hanno precedenza sui preset. Altrimenti le dimensioni derivano da
 * `preset` + `orientation` (default 1080p landscape).
 */
export const createMapSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  preset: resolutionPresetSchema.default('1080p'),
  orientation: orientationSchema.default('landscape'),
  imageAssetId: z.string().uuid().nullable().optional(),
  widthPx: z.number().int().min(1).max(20000).optional(),
  heightPx: z.number().int().min(1).max(20000).optional(),
});
export type CreateMap = z.input<typeof createMapSchema>;

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
  backgroundTransform: BackgroundTransform = defaultBackgroundTransform,
): MapDocument => {
  const maxSightFeet = Math.max(1, Math.round((Math.max(widthPx, heightPx) / 70) * 5));
  return {
    name,
    imageAssetId,
    backgroundTransform: { ...backgroundTransform },
    backgroundColor: DEFAULT_MAP_BACKGROUND_COLOR,
    widthPx,
    heightPx,
    grid: { ...defaultGridConfig },
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
