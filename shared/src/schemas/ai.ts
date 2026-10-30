import { z } from 'zod';
import { monsterStatblockSchema } from './sheet.js';

export const aiStatusSchema = z.strictObject({
  enabled: z.boolean(),
  message: z.string(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

export const statblockParseResultSchema = z.strictObject({
  statblock: monsterStatblockSchema,
  source: z.enum(['regex', 'ai']),
});
export type StatblockParseResult = z.infer<typeof statblockParseResultSchema>;
