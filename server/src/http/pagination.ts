import { z } from 'zod';
import { decodeCursor, type Cursor } from '../db/cursor.js';

export const pageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export interface ParsedPage {
  limit: number;
  cursor: Cursor | null;
}

export const pageParams = (query: z.infer<typeof pageQuerySchema>): ParsedPage => ({
  limit: query.limit,
  cursor: decodeCursor(query.cursor),
});
