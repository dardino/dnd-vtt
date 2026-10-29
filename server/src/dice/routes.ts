import type { FastifyPluginCallback } from 'fastify';
import { diceRollRequestSchema, diceVisibilitySchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import { listDiceRolls, rollForDm } from './service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const listQuerySchema = z.strictObject({ visibility: diceVisibilitySchema.optional() });

export const diceRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.post('/campaigns/:id/rolls', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(diceRollRequestSchema, request.body);
      return reply.status(201).send(rollForDm(db, id, body));
    });

    app.get('/campaigns/:id/rolls', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const query = parse(listQuerySchema, request.query);
      return reply.send(listDiceRolls(db, id, query.visibility));
    });

    done();
  };
