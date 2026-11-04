import { z } from 'zod';
import { mapSpawnSchema, playerStartSchema } from './map-spawn.js';
import { lightSchema, wallSegmentSchema } from './scene.js';
import {
  backgroundTransformSchema,
  defaultBackgroundTransform,
} from './scene-size.js';

/** Kind canonici dei layer, nell'ordine in cui compaiono nella tupla. */
export const mapLayerKindSchema = z.enum([
  'background',
  'graphics',
  'constraints',
  'elements',
]);
export type MapLayerKind = z.infer<typeof mapLayerKindSchema>;

/** Campi comuni a ogni layer: identità, visibilità e opacità. */
export const mapLayerBaseSchema = z.strictObject({
  id: z.string().min(1),
  kind: mapLayerKindSchema,
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
});
export type MapLayerBase = z.infer<typeof mapLayerBaseSchema>;

/** Immagine decorativa libera, indipendente dalla griglia. */
export const mapGraphicSchema = z.strictObject({
  id: z.string().min(1),
  assetId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  z: z.number().int().min(0).default(0),
});
export type MapGraphic = z.infer<typeof mapGraphicSchema>;

const blockedAreaPointSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
});

/**
 * Area calpestabile bloccata: rettangolo con esattamente due angoli opposti o
 * poligono con almeno tre vertici. I vertici sono coordinate intere di griglia.
 */
export const blockedAreaSchema = z.discriminatedUnion('shape', [
  z.strictObject({
    id: z.string().min(1),
    shape: z.literal('rect'),
    points: z.array(blockedAreaPointSchema).length(2),
    label: z.string().min(1).optional(),
  }),
  z.strictObject({
    id: z.string().min(1),
    shape: z.literal('polygon'),
    points: z.array(blockedAreaPointSchema).min(3),
    label: z.string().min(1).optional(),
  }),
]);
export type BlockedArea = z.infer<typeof blockedAreaSchema>;

/** Vincolo del layer `constraints`: muro vettoriale o area bloccata. */
export const mapConstraintSchema = z.union([wallSegmentSchema, blockedAreaSchema]);
export type MapConstraint = z.infer<typeof mapConstraintSchema>;

/**
 * Elemento logico del layer `elements`. Luce, spawn e partenza riusano gli
 * schemi della scena aggiungendo il discriminante `type`; il loot è specifico
 * del documento mappa.
 */
export const mapElementSchema = z.discriminatedUnion('type', [
  lightSchema.extend({ type: z.literal('light') }),
  mapSpawnSchema.extend({ type: z.literal('spawn') }),
  playerStartSchema.extend({ type: z.literal('start') }),
  z.strictObject({
    id: z.string().min(1),
    type: z.literal('loot'),
    itemId: z.string().min(1),
    x: z.number().int(),
    y: z.number().int(),
    quantity: z.number().int().min(1).max(999).default(1),
    visible: z.boolean().default(true),
  }),
]);
export type MapElement = z.infer<typeof mapElementSchema>;

export const backgroundLayerSchema = mapLayerBaseSchema.extend({
  kind: z.literal('background'),
  imageAssetId: z.string().uuid().nullable(),
  imageTransform: backgroundTransformSchema.default(defaultBackgroundTransform),
});
export type BackgroundLayer = z.infer<typeof backgroundLayerSchema>;

export const graphicsLayerSchema = mapLayerBaseSchema.extend({
  kind: z.literal('graphics'),
  items: z.array(mapGraphicSchema).max(500).default([]),
});
export type GraphicsLayer = z.infer<typeof graphicsLayerSchema>;

export const constraintsLayerSchema = mapLayerBaseSchema.extend({
  kind: z.literal('constraints'),
  items: z.array(mapConstraintSchema).max(4000).default([]),
});
export type ConstraintsLayer = z.infer<typeof constraintsLayerSchema>;

export const elementsLayerSchema = mapLayerBaseSchema.extend({
  kind: z.literal('elements'),
  items: z.array(mapElementSchema).max(2000).default([]),
});
export type ElementsLayer = z.infer<typeof elementsLayerSchema>;

/**
 * I quattro layer sono una tupla, non un array: ordine, unicità e presenza sono
 * garantiti dallo schema stesso.
 */
export const mapLayersSchema = z.tuple([
  backgroundLayerSchema,
  graphicsLayerSchema,
  constraintsLayerSchema,
  elementsLayerSchema,
]);
export type MapLayers = z.infer<typeof mapLayersSchema>;
