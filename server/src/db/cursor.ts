import { AppError } from '../errors.js';

export interface Cursor {
  createdAt: string;
  id: string;
}

export const encodeCursor = (cursor: Cursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

export const decodeCursor = (value: string | undefined): Cursor | null => {
  if (value === undefined || value === '') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'createdAt' in parsed
      && 'id' in parsed
      && typeof parsed.createdAt === 'string'
      && typeof parsed.id === 'string'
    ) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    // un cursore non decodificabile è un input invalido, non un errore interno
  }
  throw new AppError('validation_error', 400, 'Cursore non valido');
};
