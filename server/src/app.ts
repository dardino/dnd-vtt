import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { characterRoutes } from './character/routes.js';
import { currentSrdVersion } from './srd/load.js';
import { srdRoutes } from './srd/routes.js';

export interface BuildAppOptions {
  logger?: boolean;
}

export const buildApp = (options: BuildAppOptions = {}): FastifyInstance => {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError, request, reply) => {
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

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'not_found',
        message: `Risorsa non trovata: ${request.method} ${request.url}`,
        requestId: request.id,
      },
    }));

  app.get('/health', () => ({
    status: 'ok',
    srdVersion: currentSrdVersion(),
  }));

  app.register(srdRoutes, { prefix: '/api/v1' });
  app.register(characterRoutes, { prefix: '/api/v1' });

  return app;
};
