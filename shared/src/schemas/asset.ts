import { z } from 'zod';
import { imageMimeSchema } from './common.js';

export const assetSchema = z.strictObject({
  id: z.string().uuid(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mime: imageMimeSchema,
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  url: z.string().startsWith('/uploads/'),
  previewUrl: z.string().startsWith('/uploads/'),
  thumbUrl: z.string().startsWith('/uploads/'),
  createdAt: z.string().datetime(),
});
export type Asset = z.infer<typeof assetSchema>;
