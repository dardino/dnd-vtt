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

const pointSchema = z.strictObject({ x: z.number(), y: z.number() });

export const fogShapeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rect'), x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  z.strictObject({ type: z.literal('polygon'), points: z.array(pointSchema).min(3) }),
  z.strictObject({ type: z.literal('circle'), cx: z.number(), cy: z.number(), radius: z.number().positive() }),
  z.strictObject({
    type: z.literal('brush'),
    points: z.array(pointSchema).min(2),
    radius: z.number().positive(),
  }),
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
  base: z.enum(['hidden', 'revealed']),
  ops: z.array(fogOpSchema).max(2000),
});
export type FogState = z.infer<typeof fogStateSchema>;

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
});
export type TokenState = z.infer<typeof tokenStateSchema>;

export const tokenPatchSchema = z.strictObject({
  actorId: z.string().min(1).optional(),
  label: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  size: z.number().positive().optional(),
  rotation: z.number().optional(),
  elevation: z.number().optional(),
  hp: hpSchema.optional(),
  ac: z.number().int().optional(),
  conditions: z.array(conditionSchema).optional(),
  deathSaves: deathSavesSchema.optional(),
  visible: z.boolean().optional(),
  owner: z.enum(['dm', 'players']).optional(),
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

export const sceneStateSchema = z.strictObject({
  grid: gridConfigSchema,
  fog: fogStateSchema,
  tokens: z.array(tokenStateSchema),
  loot: z.array(lootEntrySchema),
  drawings: z.array(drawingSchema),
  initiative: z.strictObject({
    active: z.boolean(),
    round: z.number().int().min(0),
    turnIndex: z.number().int().min(0),
    entries: z.array(initiativeEntrySchema),
  }),
});
export type SceneState = z.infer<typeof sceneStateSchema>;

export const initiativeStateSchema = z.strictObject({
  active: z.boolean(),
  round: z.number().int().min(0),
  turnIndex: z.number().int().min(0),
  entries: z.array(initiativeEntrySchema),
});
export type InitiativeState = z.infer<typeof initiativeStateSchema>;

export const createDefaultSceneState = (
  fogBase: 'hidden' | 'revealed' = 'hidden',
): SceneState => ({
  grid: {
    type: 'square',
    cellSizePx: 70,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    diagonalRule: '5-5-5',
    hexOffset: 'odd-r',
  },
  fog: { base: fogBase, ops: [] },
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
  }),
  z.strictObject({
    type: z.literal('token.update'),
    tokenId: z.string().min(1),
    patch: tokenPatchSchema,
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
  z.strictObject({ type: z.literal('drawing.add'), drawing: drawingSchema }),
  z.strictObject({ type: z.literal('drawing.remove'), drawingId: z.string().min(1) }),
  z.strictObject({ type: z.literal('grid.update'), grid: gridConfigSchema }),
  z.strictObject({ type: z.literal('initiative.set'), initiative: initiativeStateSchema }),
  z.strictObject({ type: z.literal('initiative.next') }),
]);
export type GameAction = z.infer<typeof gameActionSchema>;

export const sceneSchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
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

export const putSceneStateSchema = z.strictObject({
  stateVersion: z.number().int().min(1),
  state: sceneStateSchema,
});
export type PutSceneState = z.infer<typeof putSceneStateSchema>;

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
