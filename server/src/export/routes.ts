import type { FastifyPluginCallback } from 'fastify';
import { campaignExportSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import { exportCampaign, importCampaign } from './service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });

export const exportRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    app.get('/campaigns/:id/export', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      const bundle = await exportCampaign(env, db, id);
      return reply
        .header('content-disposition', `attachment; filename="${bundle.campaign.name}.json"`)
        .send(bundle);
    });

    app.post('/campaigns/import', async (request, reply) => {
      requireDm(request, env);
      const body = parse(campaignExportSchema, request.body);
      return reply.status(201).send(await importCampaign(env, db, body));
    });

    done();
  };
