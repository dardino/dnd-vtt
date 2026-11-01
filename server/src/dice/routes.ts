import type { FastifyPluginCallback } from 'fastify';
import { diceRollRequestSchema, diceVisibilitySchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { dmPreHandler } from '../http/guards.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { idParamsSchema, parse } from '../http/validation.js';
import { listDiceRolls, rollForDm } from './service.js';
import { broadcastDisplays } from '../realtime/hub.js';

const listQuerySchema = z.strictObject({ visibility: diceVisibilitySchema.optional() });

export const diceRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    app.addHook('preHandler', dmPreHandler(env));

    app.post('/campaigns/:id/rolls', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(diceRollRequestSchema, request.body);
      const roll = rollForDm(db, id, body);
      broadcastDisplays(id);
      return reply.status(201).send(roll);
    });

    app.get('/campaigns/:id/rolls', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const query = parse(listQuerySchema, request.query);
      return reply.send(listDiceRolls(db, id, query.visibility));
    });

    done();
  };
