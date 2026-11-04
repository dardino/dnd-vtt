import { z } from 'zod';
import { mapHexColorSchema } from './color.js';
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
export const mapGraphicImageSchema = z.strictObject({
  kind: z.literal('image'),
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
export type ImageGraphic = z.infer<typeof mapGraphicImageSchema>;

const graphicPointSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
});

/**
 * Poligono decorativo con vertici in coordinate di reticolo (celle), non in
 * pixel: il renderer applica cella e offset della griglia.
 */
export const mapGraphicPolygonSchema = z.strictObject({
  kind: z.literal('polygon'),
  id: z.string().min(1),
  points: z.array(graphicPointSchema).min(3).max(200),
  fill: mapHexColorSchema.default('#4ea1ff'),
  opacity: z.number().min(0).max(1).default(0.35),
  z: z.number().int().min(0).default(0),
});
export type PolygonGraphic = z.infer<typeof mapGraphicPolygonSchema>;

/** Nuove righe e caratteri di controllo non sono ammessi nel testo libero. */
const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
};

/** Testo decorativo con font, dimensione e colore controllati. */
export const mapGraphicTextSchema = z.strictObject({
  kind: z.literal('text'),
  id: z.string().min(1),
  text: z.string().min(1).max(120).refine((value) => !hasControlCharacter(value), {
    message: 'Il testo non può contenere newline o caratteri di controllo',
  }),
  fontFamily: z.enum(['sans', 'serif', 'mono', 'display']).default('sans'),
  fontSize: z.number().int().min(8).max(200).default(24),
  color: mapHexColorSchema.default('#ffffff'),
  x: z.number().int(),
  y: z.number().int(),
  opacity: z.number().min(0).max(1).default(1),
  z: z.number().int().min(0).default(0),
});
export type TextGraphic = z.infer<typeof mapGraphicTextSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Retrocompatibilità: le grafiche storiche non avevano `kind` ed erano tutte
 * immagini. Il discriminante viene aggiunto solo a un record che non lo espone
 * già, così un `kind` invalido resta invalido e non viene corretto.
 */
const injectGraphicKind = (value: unknown): unknown =>
  isRecord(value) && !('kind' in value) ? { ...value, kind: 'image' } : value;

/** Grafica decorativa del layer `graphics`: immagine, poligono o testo. */
export const mapGraphicSchema = z.preprocess(
  injectGraphicKind,
  z.discriminatedUnion('kind', [
    mapGraphicImageSchema,
    mapGraphicPolygonSchema,
    mapGraphicTextSchema,
  ]),
);
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
