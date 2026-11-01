import { z } from 'zod';
import { AppError } from '../errors.js';

/** Parametro `:id` condiviso da tutte le route con UUID. */
export const idParamsSchema = z.strictObject({ id: z.string().uuid() });

export const parse = <T>(schema: z.ZodType<T>, value: unknown, message = 'Richiesta non valida'): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('validation_error', 400, message, result.error.issues);
  }
  return result.data;
};
