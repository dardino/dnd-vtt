import type { z } from 'zod';
import { AppError } from '../errors.js';

export const parse = <T>(schema: z.ZodType<T>, value: unknown, message = 'Richiesta non valida'): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('validation_error', 400, message, result.error.issues);
  }
  return result.data;
};
