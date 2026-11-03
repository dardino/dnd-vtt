import { and, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';
import type { DbExecutor } from './client.js';
import { authSessions } from './schema.js';

/** Intervallo minimo tra due aggiornamenti di `lastSeenAt` (60 s). */
export const AUTH_SESSION_TOUCH_INTERVAL_MS = 60_000;

export interface AuthSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  ip: string | null;
}

const toAuthSession = (row: typeof authSessions.$inferSelect): AuthSession => ({
  id: row.id,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
  userAgent: row.userAgent,
  ip: row.ip,
});

export interface InsertAuthSessionInput {
  id: string;
  expiresAt: string;
  userAgent?: string | null;
  ip?: string | null;
  now?: number;
}

export const insertAuthSession = (
  db: DbExecutor,
  input: InsertAuthSessionInput,
): AuthSession => {
  const createdAt = new Date(input.now ?? Date.now()).toISOString();
  const row = {
    id: input.id,
    createdAt,
    lastSeenAt: createdAt,
    expiresAt: input.expiresAt,
    revokedAt: null,
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
  };
  db.insert(authSessions).values(row).run();
  return toAuthSession(row);
};

export const getAuthSession = (db: DbExecutor, id: string): AuthSession | null => {
  const row = db.select().from(authSessions).where(eq(authSessions.id, id)).get();
  return row === undefined ? null : toAuthSession(row);
};

/**
 * Aggiorna `lastSeenAt` solo se è più vecchio di 60 s: evita una scrittura per
 * ogni richiesta (la UI fa polling) senza perdere la granularità utile.
 */
export const touchAuthSession = (
  db: DbExecutor,
  id: string,
  now = Date.now(),
): void => {
  const nowIso = new Date(now).toISOString();
  const threshold = new Date(now - AUTH_SESSION_TOUCH_INTERVAL_MS).toISOString();
  db.update(authSessions)
    .set({ lastSeenAt: nowIso })
    .where(and(
      eq(authSessions.id, id),
      or(isNull(authSessions.lastSeenAt), lte(authSessions.lastSeenAt, threshold)),
    ))
    .run();
};

export const revokeAuthSession = (
  db: DbExecutor,
  id: string,
  now = Date.now(),
): boolean =>
  db.update(authSessions)
    .set({ revokedAt: new Date(now).toISOString() })
    .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
    .run().changes > 0;

/** Una sessione è attiva se non revocata e non ancora scaduta. */
export const listActiveAuthSessions = (
  db: DbExecutor,
  now = Date.now(),
): AuthSession[] =>
  db.select().from(authSessions)
    .where(and(
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date(now).toISOString()),
    ))
    .orderBy(desc(authSessions.createdAt), desc(authSessions.id))
    .all()
    .map(toAuthSession);

/** Sposta la scadenza dopo un refresh, mantenendo lo stesso `jti`. */
export const updateAuthSessionExpiry = (
  db: DbExecutor,
  id: string,
  expiresAt: string,
): void => {
  db.update(authSessions)
    .set({ expiresAt })
    .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
    .run();
};

export const deleteExpiredAuthSessions = (db: DbExecutor, now = Date.now()): number =>
  db.delete(authSessions)
    .where(lt(authSessions.expiresAt, new Date(now).toISOString()))
    .run().changes;
