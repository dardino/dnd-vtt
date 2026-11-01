import type { FastifyRequest } from 'fastify';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';

/**
 * Hook `preHandler` unico per le route DM. Fastify richiede una funzione
 * sincrona o una Promise: la funzione è async solo per soddisfare il tipo.
 */
export const dmPreHandler = (env: AppEnv) =>
  // eslint-disable-next-line @typescript-eslint/require-await
  async (request: FastifyRequest): Promise<void> => {
    requireDm(request, env);
  };
