import type { FastifyPluginCallback } from 'fastify';
import { diceRollRequestSchema, diceVisibilitySchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { dmPreHandler } from '../http/guards.js';
import type { AppEnv } from '../config/env.js';
import { idParamsSchema, parse } from '../http/validation.js';
import type { DiceService } from './service.js';
import type { RealtimeHub } from '../realtime/hub.js';

const listQuerySchema = z.strictObject({ visibility: diceVisibilitySchema.optional() });

export const diceRoutes = (
  env: AppEnv,
  hub: RealtimeHub,
  dice: DiceService,
): FastifyPluginCallback =>
  (app, _options, done) => {
    app.addHook('preHandler', dmPreHandler(env));

    app.post('/campaigns/:id/rolls', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(diceRollRequestSchema, request.body);
      const roll = dice.rollForDm(id, body);
      hub.broadcastDisplays(id);
      return reply.status(201).send(roll);
    });

    app.get('/campaigns/:id/rolls', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const query = parse(listQuerySchema, request.query);
      return reply.send(dice.listDiceRolls(id, query.visibility));
    });

    done();
  };
