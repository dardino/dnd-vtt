import { z } from 'zod';
import { tokenLightSchema } from './scene.js';

/**
 * Schemi di spawn e partenze condivisi da documento mappa v1 (`map.ts`), v2
 * (`map-layers.ts`) e migrazione legacy. Vivono in un modulo dedicato per
 * evitare cicli di import tra `map.ts` e i layer; `map.ts` li ri-esporta per
 * mantenere l'API pubblica invariata.
 */

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
