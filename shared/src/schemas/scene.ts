import { z } from 'zod';
import { conditionSchema } from './common.js';
import { deathSavesSchema, hpSchema } from './sheet.js';

export const gridConfigSchema = z.strictObject({
  type: z.enum(['square', 'hex']).default('square'),
  cellSizePx: z.number().int().min(8).max(400).default(70),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  feetPerCell: z.number().positive().default(5),
  diagonalRule: z.enum(['5-5-5', '5-10-5']).default('5-5-5'),
  hexOffset: z.literal('odd-r').default('odd-r'),
});
export type GridConfig = z.infer<typeof gridConfigSchema>;

/** Griglia di default condivisa da scene, mappe e seed demo. */
export const defaultGridConfig: GridConfig = {
  type: 'square',
  cellSizePx: 70,
  offsetX: 0,
  offsetY: 0,
  feetPerCell: 5,
  diagonalRule: '5-5-5',
  hexOffset: 'odd-r',
};

const pointSchema = z.strictObject({ x: z.number(), y: z.number() });
export const cellPointSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
});

export const fogShapeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rect'), x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  z.strictObject({ type: z.literal('polygon'), points: z.array(pointSchema).min(3) }),
  z.strictObject({ type: z.literal('circle'), cx: z.number(), cy: z.number(), radius: z.number().positive() }),
  z.strictObject({
    type: z.literal('brush'),
    points: z.array(pointSchema).min(2),
    radius: z.number().positive(),
  }),
  z.strictObject({ type: z.literal('cells'), cells: z.array(cellPointSchema).min(1) }),
]);
export type FogShape = z.infer<typeof fogShapeSchema>;

export const fogOpSchema = z.strictObject({
  id: z.string().min(1),
  op: z.enum(['reveal', 'hide']),
  shape: fogShapeSchema,
  softness: z.number().min(0).max(200).default(0),
  createdAt: z.string().datetime().optional(),
});
export type FogOp = z.infer<typeof fogOpSchema>;

export const fogStateSchema = z.strictObject({
  base: z.enum(['hidden', 'revealed']).default('hidden'),
  ops: z.array(fogOpSchema).max(2000).default([]),
  override: z.enum(['none', 'reveal', 'hide']).default('none'),
});
export type FogState = z.infer<typeof fogStateSchema>;

export const wallKindSchema = z.enum(['wall', 'door', 'window', 'lowWall']);
export type WallKind = z.infer<typeof wallKindSchema>;

export const doorStateSchema = z.enum(['open', 'closed', 'secret']);
export type DoorState = z.infer<typeof doorStateSchema>;

/**
 * Muro vettoriale tra due intersezioni della griglia (coordinate lattice).
 * Per il muro disegnato con lo strumento dedicato i due punti sono interi;
 * il tratto libero usa coordinate frazionarie. La visione a celle deriva da
 * questi segmenti gli edge bloccanti.
 */
export const wallPointSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
});
export type WallPoint = z.infer<typeof wallPointSchema>;

export const wallSegmentSchema = z.strictObject({
  id: z.string().min(1),
  kind: wallKindSchema,
  a: wallPointSchema,
  b: wallPointSchema,
  door: doorStateSchema.optional(),
});
export type WallSegment = z.infer<typeof wallSegmentSchema>;

export const lightShapeSchema = z.enum(['circle', 'cone']);
export type LightShape = z.infer<typeof lightShapeSchema>;

export const tokenLightSchema = z.strictObject({
  brightFeet: z.number().positive(),
  dimFeet: z.number().positive(),
  color: z.string().default('#ffcc80'),
  enabled: z.boolean().default(true),
  shape: lightShapeSchema.default('circle'),
  direction: z.number().min(0).max(360).optional(),
  angle: z.number().min(1).max(360).default(60),
});
export type TokenLight = z.infer<typeof tokenLightSchema>;

export const lightSchema = tokenLightSchema.extend({
  id: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});
export type Light = z.infer<typeof lightSchema>;

export const ambientLightSchema = z.enum(['bright', 'dim', 'dark']);
export type AmbientLight = z.infer<typeof ambientLightSchema>;

export const defaultTerrain = {
  ambientLight: 'dark' as const,
  visionLimitFeet: 120,
  visionEnabled: true,
  walls: [] as WallSegment[],
  lights: [] as Light[],
};

export const terrainSchema = z.strictObject({
  ambientLight: ambientLightSchema.default('dark'),
  visionLimitFeet: z.number().positive().default(120),
  visionEnabled: z.boolean().default(true),
  walls: z.array(wallSegmentSchema).max(4000).default([]),
  lights: z.array(lightSchema).max(500).default([]),
});
export type Terrain = z.infer<typeof terrainSchema>;

export const visionGridSchema = z.strictObject({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  levels: z.array(z.number().int().min(0).max(2)),
});
export type VisionGrid = z.infer<typeof visionGridSchema>;

export const publicDoorSchema = z.strictObject({
  id: z.string().min(1),
  a: wallPointSchema,
  b: wallPointSchema,
  state: z.enum(['open', 'closed']),
});
export type PublicDoor = z.infer<typeof publicDoorSchema>;

export const tokenStateSchema = z.strictObject({
  id: z.string().min(1),
  actorId: z.string().min(1).optional(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  size: z.number().positive().default(1),
  rotation: z.number().default(0),
  elevation: z.number().default(0),
  hp: hpSchema,
  ac: z.number().int().optional(),
  conditions: z.array(conditionSchema),
  deathSaves: deathSavesSchema.optional(),
  visible: z.boolean().default(true),
  owner: z.enum(['dm', 'players']).optional(),
  light: tokenLightSchema.optional(),
});
export type TokenState = z.infer<typeof tokenStateSchema>;

export const tokenPatchSchema = z.strictObject({
  // `null` significa “rimuovi il campo opzionale”: serve all'inverso di
  // `token.update`, che deve poter tornare a un campo assente.
  actorId: z.string().min(1).nullable().optional(),
  label: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  size: z.number().positive().optional(),
  rotation: z.number().optional(),
  elevation: z.number().optional(),
  hp: hpSchema.optional(),
  ac: z.number().int().nullable().optional(),
  conditions: z.array(conditionSchema).optional(),
  deathSaves: deathSavesSchema.nullable().optional(),
  visible: z.boolean().optional(),
  owner: z.enum(['dm', 'players']).nullable().optional(),
  light: tokenLightSchema.nullable().optional(),
});
export type TokenPatch = z.infer<typeof tokenPatchSchema>;

export const lootEntrySchema = z.strictObject({
  id: z.string().min(1),
  itemId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  quantity: z.number().int().min(1).default(1),
  visible: z.boolean().default(true),
});
export type LootEntry = z.infer<typeof lootEntrySchema>;

export const drawingSchema = z.strictObject({
  id: z.string().min(1),
  points: z.array(pointSchema).min(2),
  color: z.string(),
  width: z.number().positive(),
  visible: z.boolean().default(true),
});
export type Drawing = z.infer<typeof drawingSchema>;

export const initiativeEntrySchema = z.strictObject({
  id: z.string().min(1),
  tokenId: z.string().min(1),
  label: z.string(),
  value: z.number().int(),
  tiebreak: z.number().int(),
  hidden: z.boolean(),
  defeated: z.boolean(),
});
export type InitiativeEntry = z.infer<typeof initiativeEntrySchema>;

export const initiativeStateSchema = z.strictObject({
  active: z.boolean(),
  round: z.number().int().min(0),
  turnIndex: z.number().int().min(0),
  entries: z.array(initiativeEntrySchema),
});
export type InitiativeState = z.infer<typeof initiativeStateSchema>;

export const sceneStateSchema = z.strictObject({
  grid: gridConfigSchema,
  fog: fogStateSchema,
  terrain: terrainSchema.default(defaultTerrain),
  showDoorIcons: z.boolean().default(true),
  startView: z.strictObject({
    x: z.number(),
    y: z.number(),
    zoom: z.number().positive(),
  }).optional(),
  tokens: z.array(tokenStateSchema),
  loot: z.array(lootEntrySchema),
  drawings: z.array(drawingSchema),
  initiative: initiativeStateSchema,
});
export type SceneState = z.infer<typeof sceneStateSchema>;

export const createDefaultSceneState = (
  fogBase: 'hidden' | 'revealed' = 'hidden',
  terrain: Terrain = defaultTerrain,
): SceneState => ({
  grid: { ...defaultGridConfig },
  fog: { base: fogBase, ops: [], override: 'none' },
  terrain: {
    ...terrain,
    walls: [...terrain.walls],
    lights: [...terrain.lights],
  },
  showDoorIcons: true,
  tokens: [],
  loot: [],
  drawings: [],
  initiative: { active: false, round: 0, turnIndex: 0, entries: [] },
});

export const gameActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('token.add'), token: tokenStateSchema }),
  z.strictObject({
    type: z.literal('token.move'),
    tokenId: z.string().min(1),
    x: z.number(),
    y: z.number(),
    force: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('token.update'),
    tokenId: z.string().min(1),
    patch: tokenPatchSchema,
  }),
  z.strictObject({
    type: z.literal('token.light'),
    tokenId: z.string().min(1),
    light: tokenLightSchema.nullable(),
  }),
  z.strictObject({ type: z.literal('token.remove'), tokenId: z.string().min(1) }),
  z.strictObject({
    type: z.literal('token.hp'),
    tokenId: z.string().min(1),
    delta: z.number().int(),
  }),
  z.strictObject({
    type: z.literal('token.condition'),
    tokenId: z.string().min(1),
    op: z.enum(['add', 'remove', 'update']),
    condition: conditionSchema,
  }),
  z.strictObject({ type: z.literal('fog.apply'), op: fogOpSchema }),
  z.strictObject({ type: z.literal('fog.remove'), opId: z.string().min(1) }),
  z.strictObject({
    type: z.literal('fog.replace'),
    base: z.enum(['hidden', 'revealed']),
    ops: z.array(fogOpSchema).max(2000),
  }),
  z.strictObject({ type: z.literal('fog.override'), override: z.enum(['none', 'reveal', 'hide']) }),
  z.strictObject({ type: z.literal('drawing.add'), drawing: drawingSchema }),
  z.strictObject({ type: z.literal('drawing.remove'), drawingId: z.string().min(1) }),
  z.strictObject({ type: z.literal('grid.update'), grid: gridConfigSchema }),
  z.strictObject({
    type: z.literal('terrain.door'),
    wallId: z.string().min(1),
    state: z.enum(['open', 'closed', 'secret']),
  }),
  z.strictObject({
    type: z.literal('terrain.light'),
    lightId: z.string().min(1),
    enabled: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('terrain.ambient'),
    ambientLight: ambientLightSchema,
  }),
  z.strictObject({
    type: z.literal('terrain.vision'),
    enabled: z.boolean(),
  }),
  z.strictObject({ type: z.literal('initiative.set'), initiative: initiativeStateSchema }),
  z.strictObject({ type: z.literal('initiative.next') }),
]);
export type GameAction = z.infer<typeof gameActionSchema>;

export const sceneSchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  mapId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  imageAssetId: z.string().uuid().nullable(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  stateVersion: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Scene = z.infer<typeof sceneSchema>;

export const createSceneSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  widthPx: z.number().int().min(1).max(20000).default(1920),
  heightPx: z.number().int().min(1).max(20000).default(1080),
  imageAssetId: z.string().uuid().optional(),
  mapId: z.string().uuid().optional(),
  fogBase: z.enum(['hidden', 'revealed']).optional(),
});
export type CreateScene = z.infer<typeof createSceneSchema>;

export const updateSceneSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    widthPx: z.number().int().min(1).max(20000).optional(),
    heightPx: z.number().int().min(1).max(20000).optional(),
    imageAssetId: z.string().uuid().nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nessun campo da aggiornare' });
export type UpdateScene = z.infer<typeof updateSceneSchema>;

export const sceneListSchema = z.strictObject({
  items: z.array(sceneSchema),
  nextCursor: z.string().nullable(),
});
export type SceneList = z.infer<typeof sceneListSchema>;

export const sceneSnapshotSchema = z.strictObject({
  scene: sceneSchema,
  state: sceneStateSchema,
  stateVersion: z.number().int().min(1),
});
export type SceneSnapshot = z.infer<typeof sceneSnapshotSchema>;

export const actionRequestSchema = z.strictObject({
  id: z.string().uuid(),
  clientId: z.string().min(1).max(120),
  sceneId: z.string().uuid(),
  action: gameActionSchema,
});
export type ActionRequest = z.infer<typeof actionRequestSchema>;

export const appliedActionSchema = z.strictObject({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  type: z.string().min(1),
  label: z.string(),
  stateVersion: z.number().int().min(1),
  action: gameActionSchema,
  inverse: gameActionSchema,
  at: z.string().datetime(),
});
export type AppliedAction = z.infer<typeof appliedActionSchema>;

export const actionLogEntrySchema = z.strictObject({
  id: z.string().uuid(),
  sceneId: z.string().uuid().nullable(),
  actorId: z.string().uuid().nullable(),
  clientId: z.string().min(1),
  origin: z.enum(['dm', 'player']),
  type: z.string().min(1),
  label: z.string(),
  payload: gameActionSchema,
  inverse: gameActionSchema,
  status: z.enum(['applied', 'undone']),
  stateVersion: z.number().int().min(1),
  createdAt: z.string().datetime(),
  undoneAt: z.string().datetime().nullable(),
});
export type ActionLogEntry = z.infer<typeof actionLogEntrySchema>;

export const actionLogListSchema = z.strictObject({
  items: z.array(actionLogEntrySchema),
});
export type ActionLogList = z.infer<typeof actionLogListSchema>;

export const undoActionRequestSchema = z.strictObject({
  entryId: z.string().uuid(),
});
export type UndoActionRequest = z.infer<typeof undoActionRequestSchema>;

export const undoResultSchema = z.strictObject({
  snapshot: sceneSnapshotSchema,
  undone: z.number().int().min(1),
});
export type UndoResult = z.infer<typeof undoResultSchema>;

export const redoResultSchema = z.strictObject({
  snapshot: sceneSnapshotSchema,
  redone: z.number().int().min(1),
});
export type RedoResult = z.infer<typeof redoResultSchema>;

export const clearHistoryResultSchema = z.strictObject({
  cleared: z.number().int().min(0),
});
export type ClearHistoryResult = z.infer<typeof clearHistoryResultSchema>;

export const resetFogRequestSchema = z.strictObject({
  sceneId: z.string().uuid(),
});
export type ResetFogRequest = z.infer<typeof resetFogRequestSchema>;

export const resetFogResultSchema = z.strictObject({
  snapshot: sceneSnapshotSchema,
  cleared: z.number().int().min(0),
});
export type ResetFogResult = z.infer<typeof resetFogResultSchema>;
