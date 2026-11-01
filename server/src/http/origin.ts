import type { AppEnv } from '../config/env.js';

const normalizedOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.origin === 'null' ? null : url.origin;
  } catch {
    return null;
  }
};

/**
 * Confronta un header `Origin` con la allowlist. La normalizzazione via URL
 * evita differenze di maiuscole, porta implicita o slash finale.
 */
export const isAllowedOrigin = (origin: string | undefined, env: AppEnv): boolean => {
  if (origin === undefined) {
    return false;
  }
  const candidate = normalizedOrigin(origin);
  if (candidate === null) {
    return false;
  }
  return env.allowedOrigins.some((allowed) => normalizedOrigin(allowed) === candidate);
};
