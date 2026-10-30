import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import { campaignSessions, startCampaignSession, stopCampaignSession } from './service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });

export const sessionRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.get('/campaigns/:id/sessions', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(campaignSessions(db, id));
    });

    app.post('/campaigns/:id/sessions/start', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.status(201).send(startCampaignSession(db, id));
    });

    app.post('/campaigns/:id/sessions/stop', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(stopCampaignSession(db, id));
    });

    done();
  };
