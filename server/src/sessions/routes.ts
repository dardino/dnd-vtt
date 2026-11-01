import type { FastifyPluginCallback } from 'fastify';
import { dmPreHandler } from '../http/guards.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { idParamsSchema, parse } from '../http/validation.js';
import { campaignSessions, startCampaignSession, stopCampaignSession } from './service.js';

export const sessionRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    app.addHook('preHandler', dmPreHandler(env));

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
