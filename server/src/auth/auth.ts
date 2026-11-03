import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import {
  allowedHosts,
  isLoopbackAddress,
  parseScryptPasswordHash,
  type AppEnv,
} from '../config/env.js';
import type { DbExecutor } from '../db/client.js';
import {
  deleteExpiredAuthSessions,
  getAuthSession,
  insertAuthSession,
  listActiveAuthSessions,
  revokeAuthSession,
  touchAuthSession,
  updateAuthSessionExpiry,
} from '../db/auth-sessions.repository.js';
import { AppError } from '../errors.js';
import { parse } from '../http/validation.js';

export type DmRole = 'dm' | 'none';

const SESSION_COOKIE = 'dm_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Oltre un giorno di attività il cookie viene riemesso con scadenza scorrevole. */
const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;

export interface SessionPayload {
  v: 1;
  /** Identificativo della riga `auth_sessions`; assente nei token legacy. */
  jti?: string;
  iat: number;
  exp: number;
}

/** Ruolo risolto nell'hook `onRequest`, riusato da `requireDm`. */
const resolvedRoles = new WeakMap<FastifyRequest, DmRole>();

export const setResolvedDmRole = (request: FastifyRequest, role: DmRole): void => {
  resolvedRoles.set(request, role);
};

export const getResolvedDmRole = (request: FastifyRequest): DmRole | undefined =>
  resolvedRoles.get(request);

const hasForwardingHeaders = (request: FastifyRequest): boolean =>
  Object.keys(request.headers).some((name) =>
    name === 'forwarded' || name.startsWith('x-forwarded-'));

const hostIsAllowed = (request: FastifyRequest, env: AppEnv): boolean => {
  const hostname = request.hostname.toLowerCase();
  const normalized = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return allowedHosts(env).has(normalized);
};

/**
 * Il bypass loopback vale solo per connessione diretta: peer loopback, Host
 * ammesso e nessun header di forwarding. Un proxy rende il peer loopback ma
 * non deve diventare una credenziale implicita (D47).
 */
export const isLoopbackTrusted = (request: FastifyRequest, env: AppEnv): boolean =>
  isLoopbackAddress(request.socket.remoteAddress ?? '')
  && hostIsAllowed(request, env)
  && !hasForwardingHeaders(request);

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export const createSessionToken = (
  env: AppEnv,
  now = Date.now(),
  jti?: string,
): string => {
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    v: 1,
    ...(jti === undefined ? {} : { jti }),
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const value = `v1.${encoded}`;
  return `${value}.${sign(value, env.sessionSecret)}`;
};

/** Verifica firma e forma del payload; non controlla la scadenza. */
export const decodeSessionToken = (env: AppEnv, token: string): SessionPayload | undefined => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return undefined;
  }
  const payload = parts[1] ?? '';
  const signature = parts[2] ?? '';
  const expected = sign(`v1.${payload}`, env.sessionSecret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    if (decoded.v !== 1 || !Number.isFinite(decoded.iat) || !Number.isFinite(decoded.exp)) {
      return undefined;
    }
    if (decoded.jti !== undefined && (typeof decoded.jti !== 'string' || decoded.jti === '')) {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
};

export const verifySessionToken = (env: AppEnv, token: string, now = Date.now()): boolean => {
  const decoded = decodeSessionToken(env, token);
  return decoded !== undefined && decoded.exp > Math.floor(now / 1000);
};

export const passwordMatches = (expected: string, provided: string): boolean => {
  const expectedHash = createHmac('sha256', 'dm-password').update(expected).digest();
  const providedHash = createHmac('sha256', 'dm-password').update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
};

const deriveScryptKey = (password: string, salt: Buffer, length: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, length, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });

/**
 * Verifica una password contro `scrypt$<saltBase64>$<hashBase64>`. Un hash
 * malformato o un errore di scrypt valgono come non corrispondenza.
 */
export const passwordHashMatches = async (storedHash: string, provided: string): Promise<boolean> => {
  const parsed = parseScryptPasswordHash(storedHash);
  if (parsed === undefined) {
    return false;
  }
  try {
    const derived = await deriveScryptKey(provided, parsed.salt, parsed.hash.length);
    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
};

/** L'hash, quando configurato, ha sempre precedenza sulla password plaintext. */
export const verifyDmPassword = async (env: AppEnv, provided: string): Promise<boolean> => {
  if (env.dmPasswordHash !== undefined) {
    return passwordHashMatches(env.dmPasswordHash, provided);
  }
  if (env.dmPassword !== undefined) {
    return passwordMatches(env.dmPassword, provided);
  }
  return false;
};

/**
 * Ruolo DM senza accesso al DB: usato dai test e come fallback quando l'hook
 * `onRequest` non ha ancora risolto la richiesta.
 */
export const resolveDmRole = (request: FastifyRequest, env: AppEnv): DmRole => {
  if (isLoopbackTrusted(request, env)) {
    return 'dm';
  }
  const token = sessionTokenFromRequest(request);
  if (token !== undefined && verifySessionToken(env, token)) {
    return 'dm';
  }
  return 'none';
};

/**
 * Come `resolveDmRole`, ma convalida il `jti` contro `auth_sessions`: un token
 * con riga revocata perde subito il ruolo, mentre un `jti` sconosciuto (token
 * legacy o di test) resta valido. Il loopback non crea né tocca sessioni.
 */
export const resolveDmRoleWithSessions = (
  request: FastifyRequest,
  env: AppEnv,
  db: DbExecutor,
): DmRole => {
  if (isLoopbackTrusted(request, env)) {
    return 'dm';
  }
  const token = sessionTokenFromRequest(request);
  if (token === undefined) {
    return 'none';
  }
  const payload = decodeSessionToken(env, token);
  if (payload === undefined || payload.exp <= Math.floor(Date.now() / 1000)) {
    return 'none';
  }
  if (payload.jti === undefined) {
    return 'dm';
  }
  const session = getAuthSession(db, payload.jti);
  if (session === null) {
    return 'dm';
  }
  if (session.revokedAt !== null) {
    return 'none';
  }
  touchAuthSession(db, payload.jti);
  return 'dm';
};

export const requireDm = (request: FastifyRequest, env: AppEnv): void => {
  const role = getResolvedDmRole(request) ?? resolveDmRole(request, env);
  if (role !== 'dm') {
    throw new AppError('unauthorized', 401, 'Autenticazione DM richiesta');
  }
};

const setSessionCookie = (reply: FastifyReply, env: AppEnv, token: string): void => {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: env.cookieSecure,
    maxAge: SESSION_TTL_SECONDS,
  });
};

const clearSessionCookie = (reply: FastifyReply, env: AppEnv): void => {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: env.cookieSecure,
  });
};

/**
 * L'hook `onRequest` gira prima del parsing cookie di `@fastify/cookie`
 * (registrato come plugin, quindi dopo gli hook root): leggiamo il token
 * dall'header grezzo quando `request.cookies` non è ancora popolato.
 */
const sessionTokenFromHeader = (header: string | undefined): string | undefined => {
  if (header === undefined) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) {
      continue;
    }
    return part.slice(separator + 1).trim();
  }
  return undefined;
};

const sessionTokenFromRequest = (request: FastifyRequest): string | undefined =>
  request.cookies?.[SESSION_COOKIE] ?? sessionTokenFromHeader(request.headers.cookie);

const sessionCookiePayload = (
  request: FastifyRequest,
  env: AppEnv,
): SessionPayload | undefined => {
  const token = sessionTokenFromRequest(request);
  return token === undefined ? undefined : decodeSessionToken(env, token);
};

/**
 * Refresh scorrevole: se il cookie è valido ma `iat` è più vecchio di un
 * giorno, viene riemesso con una nuova scadenza di 7 giorni mantenendo lo
 * stesso `jti`. Un token con riga revocata non viene rinnovato: il cookie
 * viene cancellato. Un accesso loopback senza cookie non crea sessione.
 */
export const refreshSessionIfNeeded = (
  request: FastifyRequest,
  reply: FastifyReply,
  env: AppEnv,
  db: DbExecutor,
  now = Date.now(),
): void => {
  const token = sessionTokenFromRequest(request);
  if (token === undefined) {
    return;
  }
  const payload = decodeSessionToken(env, token);
  if (payload === undefined || payload.exp <= Math.floor(now / 1000)) {
    return;
  }
  if (payload.jti !== undefined) {
    const session = getAuthSession(db, payload.jti);
    if (session === null) {
      // Token con `jti` ma senza riga (es. purga): non c'è nulla da rinnovare.
      return;
    }
    if (session.revokedAt !== null) {
      clearSessionCookie(reply, env);
      return;
    }
  }
  if (Math.floor(now / 1000) - payload.iat < SESSION_REFRESH_AFTER_SECONDS) {
    return;
  }
  if (payload.jti !== undefined) {
    const expiresAt = new Date((Math.floor(now / 1000) + SESSION_TTL_SECONDS) * 1000)
      .toISOString();
    updateAuthSessionExpiry(db, payload.jti, expiresAt);
  }
  setSessionCookie(reply, env, createSessionToken(env, now, payload.jti));
};

const loginBodySchema = z.strictObject({ password: z.string().min(1) });
const sessionParamsSchema = z.strictObject({ id: z.string().min(1) });

export const authRoutes = (env: AppEnv, db: DbExecutor): FastifyPluginCallback =>
  (app, _options, done) => {
    // Fastify richiede un hook async o con callback: una funzione sincrona
    // lascerebbe la richiesta appesa.
    // eslint-disable-next-line @typescript-eslint/require-await
    const dmOnly = async (request: FastifyRequest): Promise<void> => {
      requireDm(request, env);
    };

    app.post('/auth/dm', {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      const body = parse(loginBodySchema, request.body);
      if (!(await verifyDmPassword(env, body.password))) {
        throw new AppError('unauthorized', 401, 'Password non valida');
      }
      const now = Date.now();
      const jti = uuidv7();
      // Pulizia opportunistica delle righe scadute: non tocca mai jti attivi.
      deleteExpiredAuthSessions(db, now);
      insertAuthSession(db, {
        id: jti,
        now,
        expiresAt: new Date((Math.floor(now / 1000) + SESSION_TTL_SECONDS) * 1000).toISOString(),
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });
      setSessionCookie(reply, env, createSessionToken(env, now, jti));
      return reply.send({ role: 'dm' });
    });

    app.delete('/auth/dm', (request, reply) => {
      const payload = sessionCookiePayload(request, env);
      if (payload?.jti !== undefined) {
        revokeAuthSession(db, payload.jti);
      }
      clearSessionCookie(reply, env);
      return reply.status(204).send();
    });

    app.get('/auth/me', (request, reply) =>
      reply.send({ role: getResolvedDmRole(request) ?? resolveDmRole(request, env) }));

    app.get('/auth/sessions', { preHandler: dmOnly }, (request, reply) => {
      const currentId = sessionCookiePayload(request, env)?.jti;
      const items = listActiveAuthSessions(db).map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        current: session.id === currentId,
        userAgent: session.userAgent,
      }));
      return reply.send({ items });
    });

    app.delete('/auth/sessions/:id', { preHandler: dmOnly }, (request, reply) => {
      const { id } = parse(sessionParamsSchema, request.params);
      const currentId = sessionCookiePayload(request, env)?.jti;
      revokeAuthSession(db, id);
      if (currentId === id) {
        clearSessionCookie(reply, env);
      }
      return reply.status(204).send();
    });

    done();
  };
