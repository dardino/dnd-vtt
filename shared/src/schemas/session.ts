import { z } from 'zod';

export const sessionSchema = z.strictObject({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  number: z.number().int().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().min(0).nullable(),
  notes: z.string().nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export const sessionListSchema = z.strictObject({
  items: z.array(sessionSchema),
});
export type SessionList = z.infer<typeof sessionListSchema>;
