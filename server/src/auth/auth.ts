import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  allowedHosts,
  isLoopbackAddress,
  parseScryptPasswordHash,
  type AppEnv,
} from '../config/env.js';
import { AppError } from '../errors.js';
import { parse } from '../http/validation.js';

export type DmRole = 'dm' | 'none';

const SESSION_COOKIE = 'dm_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
}

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

export const createSessionToken = (env: AppEnv, now = Date.now()): string => {
  const payload: SessionPayload = {
    v: 1,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const value = `v1.${encoded}`;
  return `${value}.${sign(value, env.sessionSecret)}`;
};

export const verifySessionToken = (env: AppEnv, token: string, now = Date.now()): boolean => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return false;
  }
  const payload = parts[1] ?? '';
  const signature = parts[2] ?? '';
  const expected = sign(`v1.${payload}`, env.sessionSecret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return false;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    return decoded.v === 1 && decoded.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
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

export const resolveDmRole = (request: FastifyRequest, env: AppEnv): DmRole => {
  if (isLoopbackTrusted(request, env)) {
    return 'dm';
  }
  const token = request.cookies[SESSION_COOKIE];
  if (token !== undefined && verifySessionToken(env, token)) {
    return 'dm';
  }
  return 'none';
};

export const requireDm = (request: FastifyRequest, env: AppEnv): void => {
  if (resolveDmRole(request, env) !== 'dm') {
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

const loginBodySchema = z.strictObject({ password: z.string().min(1) });

export const authRoutes = (env: AppEnv): FastifyPluginCallback => (app, _options, done) => {
  app.post('/auth/dm', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = parse(loginBodySchema, request.body);
    if (!(await verifyDmPassword(env, body.password))) {
      throw new AppError('unauthorized', 401, 'Password non valida');
    }
    setSessionCookie(reply, env, createSessionToken(env));
    return reply.send({ role: 'dm' });
  });

  app.delete('/auth/dm', (_request, reply) => {
    clearSessionCookie(reply, env);
    return reply.status(204).send();
  });

  app.get('/auth/me', (request, reply) =>
    reply.send({ role: resolveDmRole(request, env) }));

  done();
};
