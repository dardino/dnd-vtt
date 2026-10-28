import type { FastifyPluginCallback } from 'fastify';
import {
  createCampaignSchema,
  createSceneSchema,
  updateCampaignSchema,
} from '@dnd-vtt/shared';
import { z } from 'zod';
import type { AppEnv } from '../config/env.js';
import { requireDm } from '../auth/auth.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import { pageParams, pageQuerySchema } from '../http/pagination.js';
import {
  createCampaign,
  listCampaignPage,
  patchCampaign,
  removeCampaign,
  requireCampaign,
} from '../campaigns/service.js';
import { createScene, listCampaignScenes } from '../scenes/service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });

export const campaignRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.get('/campaigns', async (request, reply) => {
      const page = pageParams(parse(pageQuerySchema, request.query));
      return reply.send(listCampaignPage(db, page));
    });

    app.post('/campaigns', async (request, reply) => {
      const body = parse(createCampaignSchema, request.body);
      return reply.status(201).send(createCampaign(db, body));
    });

    app.get('/campaigns/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(requireCampaign(db, id));
    });

    app.patch('/campaigns/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(updateCampaignSchema, request.body);
      return reply.send(patchCampaign(db, id, body));
    });

    app.delete('/campaigns/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      removeCampaign(db, id);
      return reply.status(204).send();
    });

    app.get('/campaigns/:id/scenes', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(db, id);
      const page = pageParams(parse(pageQuerySchema, request.query));
      return reply.send(listCampaignScenes(db, id, page));
    });

    app.post('/campaigns/:id/scenes', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(createSceneSchema, request.body);
      return reply.status(201).send(createScene(db, id, body));
    });

    done();
  };
