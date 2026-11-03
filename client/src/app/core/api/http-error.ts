import { HttpErrorResponse } from '@angular/common/http';

export const httpStatus = (error: unknown): number | null =>
  error instanceof HttpErrorResponse ? error.status : null;

/** Messaggio strutturato `{ error: { message } }` del server, se presente. */
export const serverMessage = (error: unknown): string | null => {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return null;
  }
  const inner = (body as { error?: { message?: unknown } }).error;
  return typeof inner?.message === 'string' ? inner.message : null;
};

export interface HttpMessageOptions {
  fallback: string;
  byStatus?: Readonly<Record<number, string>>;
  useServerMessage?: boolean;
}

/** Traduce un errore HTTP in un messaggio italiano, con override per stato. */
export const httpMessage = (error: unknown, options: HttpMessageOptions): string => {
  const status = httpStatus(error);
  const mapped = status === null ? undefined : options.byStatus?.[status];
  if (mapped !== undefined) {
    return mapped;
  }
  if (options.useServerMessage === true) {
    return serverMessage(error) ?? options.fallback;
  }
  return options.fallback;
};
