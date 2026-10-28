import { z } from 'zod';

export const assetSchema = z.strictObject({
  id: z.string().uuid(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  url: z.string().startsWith('/uploads/'),
  previewUrl: z.string().startsWith('/uploads/'),
  thumbUrl: z.string().startsWith('/uploads/'),
  createdAt: z.string().datetime(),
});
export type Asset = z.infer<typeof assetSchema>;
