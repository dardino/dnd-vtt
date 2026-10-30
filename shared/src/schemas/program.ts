import { z } from 'zod';
import { diceRollSchema } from './dice.js';
import { fogStateSchema, gridConfigSchema, initiativeEntrySchema } from './scene.js';

export const viewportSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});
export type Viewport = z.infer<typeof viewportSchema>;

export const layerFrameSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type LayerFrame = z.infer<typeof layerFrameSchema>;

export const programContentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('blank') }),
  z.strictObject({
    type: z.literal('map'),
    sceneId: z.string().uuid(),
    viewport: viewportSchema,
    fog: z.boolean(),
    cameraLocked: z.boolean(),
  }),
  z.strictObject({ type: z.literal('actor'), actorId: z.string().uuid() }),
  z.strictObject({
    type: z.literal('image'),
    assetId: z.string().uuid(),
    fit: z.enum(['contain', 'cover']),
  }),
  z.strictObject({
    type: z.literal('text'),
    title: z.string(),
    body: z.string(),
  }),
  z.strictObject({ type: z.literal('initiative') }),
]);
export type ProgramContent = z.infer<typeof programContentSchema>;

export const programLayerSchema = z.strictObject({
  id: z.string().min(1),
  content: programContentSchema,
  frame: layerFrameSchema,
  opacity: z.number().min(0).max(1),
  interactive: z.boolean(),
  confirmBeforeTake: z.boolean().optional(),
});
export type ProgramLayer = z.infer<typeof programLayerSchema>;

export const programStateSchema = z.strictObject({
  base: programLayerSchema,
  overlays: z.array(programLayerSchema),
  hud: z.strictObject({
    dice: z.boolean(),
    initiative: z.boolean(),
    pointer: z.boolean(),
  }),
  blackout: z.boolean(),
  background: z.string(),
  updatedAt: z.string().datetime(),
});
export type ProgramState = z.infer<typeof programStateSchema>;

export const programVersionSchema = z.strictObject({
  version: z.number().int().min(1),
  state: programStateSchema,
});
export type ProgramVersion = z.infer<typeof programVersionSchema>;

export const putProgramSchema = z.strictObject({
  version: z.number().int().min(1),
  state: programStateSchema,
});
export type PutProgram = z.infer<typeof putProgramSchema>;

export const compositionSchema = z.strictObject({
  base: programLayerSchema,
  overlays: z.array(programLayerSchema),
});
export type ProgramComposition = z.infer<typeof compositionSchema>;

export const displaySchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  code: z.string().min(1),
  label: z.string(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});
export type Display = z.infer<typeof displaySchema>;

export const createDisplaySchema = z.strictObject({
  label: z.string().trim().max(80).optional(),
});
export type CreateDisplay = z.infer<typeof createDisplaySchema>;

export const publicTokenSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  size: z.number(),
  rotation: z.number(),
  elevation: z.number(),
  hp: z.strictObject({ current: z.number().int(), max: z.number().int() }).optional(),
  conditions: z.array(z.string()),
});
export type PublicToken = z.infer<typeof publicTokenSchema>;

export const publicSceneSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  imageUrl: z.string().nullable(),
  grid: gridConfigSchema,
  tokens: z.array(publicTokenSchema),
  fog: fogStateSchema,
});
export type PublicScene = z.infer<typeof publicSceneSchema>;

export const publicActorViewSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(['monster', 'npc', 'pc']),
  imageUrl: z.string().nullable(),
  hp: z.strictObject({ current: z.number().int(), max: z.number().int() }).nullable(),
});
export type PublicActorView = z.infer<typeof publicActorViewSchema>;

export const displayLayerSchema = z.strictObject({
  id: z.string(),
  frame: layerFrameSchema,
  opacity: z.number(),
  type: z.enum(['blank', 'map', 'actor', 'image', 'text', 'initiative']),
  scene: publicSceneSchema.optional(),
  viewport: viewportSchema.optional(),
  actor: publicActorViewSchema.optional(),
  imageUrl: z.string().optional(),
  fit: z.enum(['contain', 'cover']).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});
export type DisplayLayer = z.infer<typeof displayLayerSchema>;

export const displayStateSchema = z.strictObject({
  campaign: z.strictObject({ id: z.string().uuid(), name: z.string() }),
  program: z.strictObject({
    hud: z.strictObject({ dice: z.boolean(), initiative: z.boolean(), pointer: z.boolean() }),
    blackout: z.boolean(),
    background: z.string(),
    updatedAt: z.string().datetime(),
  }),
  composition: z.strictObject({ base: displayLayerSchema, overlays: z.array(displayLayerSchema) }),
  initiative: z
    .strictObject({
      active: z.boolean(),
      round: z.number().int(),
      turnIndex: z.number().int(),
      entries: z.array(initiativeEntrySchema),
    })
    .optional(),
  rolls: z.array(diceRollSchema),
});
export type DisplayState = z.infer<typeof displayStateSchema>;

export const displayStateEnvelopeSchema = z.strictObject({
  display: displaySchema,
  state: displayStateSchema,
});
export type DisplayStateEnvelope = z.infer<typeof displayStateEnvelopeSchema>;
