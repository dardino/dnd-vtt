export type ErrorCode
  = | 'validation_error'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'state_conflict'
    | 'action_stale'
    | 'action_not_undoable'
    | 'asset_in_use'
    | 'invalid_build'
    | 'sheet_conflict'
    | 'roll_expired'
    | 'payload_too_large'
    | 'unsupported_media_type'
    | 'misdirected_request'
    | 'rate_limited'
    | 'internal_error';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details: unknown;

  public constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notFound = (message = 'Risorsa non trovata'): AppError =>
  new AppError('not_found', 404, message);
