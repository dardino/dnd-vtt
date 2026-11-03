import { z } from 'zod';

export const authSessionSchema = z.strictObject({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  current: z.boolean(),
  userAgent: z.string().nullable(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const authSessionListSchema = z.strictObject({
  items: z.array(authSessionSchema),
});
export type AuthSessionList = z.infer<typeof authSessionListSchema>;
