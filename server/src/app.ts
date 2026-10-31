import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { allowedHosts, type AppEnv } from './config/env.js';
import type { DatabaseHandle } from './db/client.js';
import { migrationStatus } from './db/migrations.js';
import { AppError } from './errors.js';
import { initRealtime } from './realtime/hub.js';
import { authRoutes } from './auth/auth.js';
import { actionRoutes } from './actions/routes.js';
import { actorRoutes } from './actors/routes.js';
import { aiRoutes } from './ai/routes.js';
import { assetRoutes } from './assets/routes.js';
import { campaignRoutes } from './campaigns/routes.js';
import { mapRoutes } from './maps/routes.js';
import { characterRoutes } from './character/routes.js';
import { diceRoutes } from './dice/routes.js';
import { exportRoutes } from './export/routes.js';
import { programRoutes } from './program/routes.js';
import { playerRoutes } from './players/routes.js';
import { realtimeRoutes } from './realtime/routes.js';
import { sceneRoutes } from './scenes/routes.js';
import { sessionRoutes } from './sessions/routes.js';
import { srdRoutes } from './srd/routes.js';
import { currentSrdVersion } from './srd/load.js';
import { createSpaHandler, registerSpaRoute } from './http/spa.js';

export interface BuildAppOptions {
  env: AppEnv;
  database: DatabaseHandle;
  logger?: boolean;
}

const APP_VERSION = '0.1.0';

const normalizeHost = (hostname: string): string => {
  const lower = hostname.toLowerCase();
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
};

export const buildApp = (options: BuildAppOptions): FastifyInstance => {
  const { env, database } = options;
  const app = Fastify({
    logger: options.logger === true
      ? { level: env.logLevel }
      : false,
    trustProxy: false,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  mkdirSync(env.uploadDir, { recursive: true });

  void app.register(cookie);
  void app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  void app.register(rateLimit, {
    max: env.nodeEnv === 'test' ? 100_000 : 300,
    timeWindow: '1 minute',
    allowList: (request) => request.method === 'GET' || request.url.startsWith('/uploads/'),
    errorResponseBuilder: (request, context) => new AppError(
      'rate_limited',
      429,
      'Troppe richieste: riprova più tardi',
      { after: context.after, requestId: request.id },
    ),
  });
  void app.register(multipart, {
    limits: { fileSize: env.maxUploadBytes, files: 1 },
  });

  const hosts = allowedHosts(env);
  // Fastify 5 su Node 26 non risolve la catena con un hook sincrono: serve async.
  // eslint-disable-next-line @typescript-eslint/require-await
  app.addHook('onRequest', async (request) => {
    if (!hosts.has(normalizeHost(request.hostname))) {
      throw new AppError('misdirected_request', 421, 'Host non consentito');
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!env.allowedOrigins.includes(origin)) {
        throw new AppError('forbidden', 403, 'Origin non consentito');
      }
    }
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          requestId: request.id,
        },
      });
    }
    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.statusCode === 413) {
      return reply.status(413).send({
        error: {
          code: 'payload_too_large',
          message: 'Payload troppo grande',
          requestId: request.id,
        },
      });
    }
    if (error.validation !== undefined) {
      return reply.status(400).send({
        error: {
          code: 'validation_error',
          message: error.message,
          details: error.validation,
          requestId: request.id,
        },
      });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'errore non gestito');
    }
    return reply.status(status).send({
      error: {
        code: status >= 500 ? 'internal_error' : 'bad_request',
        message: status >= 500 ? 'Errore interno' : error.message,
        requestId: request.id,
      },
    });
  });

  app.get('/api/v1/health', () => {
    let db: 'ok' | 'migration_pending';
    try {
      db = migrationStatus(database, env.migrationsDir);
    } catch {
      db = 'migration_pending';
    }
    return { status: 'ok', version: APP_VERSION, db, srdVersion: currentSrdVersion() };
  });

  void app.register(authRoutes(env), { prefix: '/api/v1' });
  void app.register(srdRoutes, { prefix: '/api/v1' });
  void app.register(characterRoutes, { prefix: '/api/v1' });
  void app.register(campaignRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(mapRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(sceneRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(actorRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(actionRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(diceRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(exportRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(programRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(playerRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(sessionRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(assetRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(aiRoutes(env, database.db), { prefix: '/api/v1' });

  initRealtime(database.db);
  void app.register(realtimeRoutes(env, database.db));

  void app.register(fastifyStatic, {
    root: env.uploadDir,
    prefix: '/uploads/',
    setHeaders: (reply) => {
      reply.header('cache-control', 'public, max-age=31536000, immutable');
    },
  });

  if (existsSync(join(env.clientDist, 'index.html'))) {
    void app.register(fastifyStatic, {
      root: env.clientDist,
      prefix: '/',
      decorateReply: false,
      index: false,
      wildcard: false,
      setHeaders: (reply) => {
        reply.header('cache-control', 'public, max-age=31536000, immutable');
      },
    });
  }

  const spa = createSpaHandler(env);
  registerSpaRoute(app, spa);

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith('/api/')
      || request.url.startsWith('/uploads/')
      || request.url === '/health';
    if (!isApi && request.method === 'GET' && spa.enabled) {
      return spa.sendIndex(request, reply);
    }
    return reply.status(404).send({
      error: {
        code: 'not_found',
        message: `Risorsa non trovata: ${request.method} ${request.url}`,
        requestId: request.id,
      },
    });
  });

  return app;
};
