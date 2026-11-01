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
import { RealtimeHub } from './realtime/hub.js';
import { DiceService } from './dice/service.js';
import { RollStats } from './actors/roll-stats.js';
import { authRoutes, refreshSessionIfNeeded } from './auth/auth.js';
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
import { isAllowedOrigin } from './http/origin.js';
import { isRateLimitExempt } from './http/rate-limit.js';
import { WsAttemptLimiter } from './realtime/rate-limit.js';

export interface BuildAppOptions {
  env: AppEnv;
  database: DatabaseHandle;
  logger?: boolean;
}

const APP_VERSION = '0.1.0';

const isWebSocketPath = (url: string): boolean => url === '/ws' || url.startsWith('/ws?');

const normalizeHost = (hostname: string): string => {
  const lower = hostname.toLowerCase();
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
};

/**
 * Fastify 5.12 rifiuta il `trustProxy` numerico (tipi e runtime fail-closed),
 * quindi N hop si traducono in una funzione `(address, hop)`: si fidano solo i
 * primi N peer. Come `true`, è sicuro solo se il server non è raggiungibile
 * direttamente: un client diretto può fingersi il proxy e falsificare
 * `X-Forwarded-For`/`X-Forwarded-Host`.
 */
const resolveTrustProxy = (
  value: boolean | number,
): boolean | ((address: string, hop: number) => boolean) => {
  if (typeof value !== 'number') {
    return value;
  }
  return (_address, hop) => hop < value;
};

export const buildApp = (options: BuildAppOptions): FastifyInstance => {
  const { env, database } = options;
  const app = Fastify({
    logger: options.logger === true
      ? { level: env.logLevel }
      : false,
    // Default `false`; con un proxy TLS davanti `TRUST_PROXY` abilita
    // X-Forwarded-For (IP reale) e X-Forwarded-Proto (protocollo).
    trustProxy: resolveTrustProxy(env.trustProxy),
    // Limite unico per i body JSON (import compreso): prima era applicato
    // solo al PUT rimosso e Fastify usava il default di 1 MB.
    bodyLimit: env.maxJsonBytes,
  });

  const hub = new RealtimeHub(database.db);
  const dice = new DiceService(database.db);
  const rollStats = new RollStats();

  app.addHook('onClose', (_instance, done) => {
    hub.close();
    dice.dispose();
    rollStats.dispose();
    done();
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
    // Esenti solo upload, health, SRD e polling azioni (ogni 2 s): tutte le
    // altre GET, export e player sheet compresi, passano dal limite globale.
    allowList: (request) => isRateLimitExempt(request),
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
  const wsLimiter = new WsAttemptLimiter(env.wsRateLimitMax, 60_000);
  // Fastify 5 su Node 26 non risolve la catena con un hook sincrono: serve async.
  app.addHook('onRequest', async (request, reply) => {
    // Con TRUST_PROXY attivo `request.hostname` può venire da
    // X-Forwarded-Host: il proxy deve preservare `Host` e allineare XFH.
    if (!hosts.has(normalizeHost(request.hostname))) {
      throw new AppError('misdirected_request', 421, 'Host non consentito');
    }
    if (isWebSocketPath(request.url)) {
      const url = new URL(request.url, 'http://localhost');
      // Il WebSocket è una GET: il controllo Origin qui sotto non lo copre.
      // Senza questo blocco una pagina esterna potrebbe aprire un canale
      // verso il server (CSWSH), soprattutto quando A1 porterà azioni sul WS.
      const wsOrigin = request.headers.origin;
      if (wsOrigin === undefined) {
        if (url.searchParams.get('role') === 'dm') {
          throw new AppError('forbidden', 403, 'Origin richiesto per il WebSocket DM');
        }
      } else if (!isAllowedOrigin(wsOrigin, env)) {
        throw new AppError('forbidden', 403, 'Origin non consentito');
      }
      // Il rate limit globale esenta le GET: i tentativi di upgrade vanno
      // limitati qui, altrimenti i codici display sono provabili senza freno.
      if (!wsLimiter.allow(request.ip)) {
        throw new AppError('rate_limited', 429, 'Troppi tentativi di connessione: riprova più tardi');
      }
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!isAllowedOrigin(origin, env)) {
        throw new AppError('forbidden', 403, 'Origin non consentito');
      }
    }
    // Dopo host/Origin e prima delle route: rinnova il cookie di sessione
    // quando l'attività supera un giorno, così il TTL resta scorrevole.
    // Login/logout gestiscono il proprio Set-Cookie e non vanno rinnovati qui.
    if (request.url.startsWith('/api/v1') && !/^\/api\/v1\/auth\/dm(?:[?#]|$)/.test(request.url)) {
      refreshSessionIfNeeded(request, reply, env);
    }
  });

  // Se un upgrade viene rifiutato prima che il plugin websocket imposti
  // `request.ws`, il suo hook `onResponse` non chiude il socket raw: lo
  // facciamo qui per non lasciare connessioni appese.
  app.addHook('onResponse', (request, reply, done) => {
    if (isWebSocketPath(request.url) && reply.statusCode >= 400) {
      request.raw.socket.destroy();
    }
    done();
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
  void app.register(actorRoutes(env, database.db, hub, rollStats), { prefix: '/api/v1' });
  void app.register(actionRoutes(env, database.db, hub), { prefix: '/api/v1' });
  void app.register(diceRoutes(env, hub, dice), { prefix: '/api/v1' });
  void app.register(exportRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(programRoutes(env, database.db, hub), { prefix: '/api/v1' });
  void app.register(playerRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(sessionRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(assetRoutes(env, database.db), { prefix: '/api/v1' });
  void app.register(aiRoutes(env, database.db), { prefix: '/api/v1' });

  void app.register(realtimeRoutes(env, database.db, hub));

  void app.register(fastifyStatic, {
    root: env.uploadDir,
    prefix: '/uploads/',
    // Gli originali restano su disco per la deduplica, ma non sono un asset
    // pubblico: EXIF e metadati non devono uscire dal server.
    allowedPath: (pathName) => !pathName.replace(/^\/+/, '').startsWith('originals/'),
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
