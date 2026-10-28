import type { FastifyPluginCallback } from 'fastify';
import { actionRequestSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import { applySceneAction, listCampaignActions } from '../actions/service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });

export const actionRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.post('/campaigns/:id/actions', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(actionRequestSchema, request.body);
      const applied = applySceneAction(db, {
        campaignId: id,
        request: body,
        origin: 'dm',
      });
      return reply.send(applied);
    });

    app.get('/campaigns/:id/actions', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(listCampaignActions(db, id));
    });

    done();
  };
