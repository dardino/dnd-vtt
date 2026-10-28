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
]);
export type FogShape = z.infer<typeof fogShapeSchema>;

export const fogOpSchema = z.strictObject({
  id: z.string().min(1),
  op: z.enum(['reveal', 'hide']),
  shape: fogShapeSchema,
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

export const createDefaultSceneState = (): SceneState => ({
  grid: {
    type: 'square',
    cellSizePx: 70,
    offsetX: 0,
    offsetY: 0,
    feetPerCell: 5,
    diagonalRule: '5-5-5',
    hexOffset: 'odd-r',
  },
  fog: { base: 'hidden', ops: [] },
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
  z.strictObject({ type: z.literal('fog.apply'), op: fogOpSchema }),
]);
export type GameAction = z.infer<typeof gameActionSchema>;
