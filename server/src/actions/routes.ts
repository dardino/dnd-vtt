import type { FastifyPluginCallback } from 'fastify';
import { actionRequestSchema, undoActionRequestSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import {
  applySceneAction,
  listCampaignActions,
  redoLastBatch,
  syncCampaignActions,
  undoThrough,
} from '../actions/service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const syncQuerySchema = z.strictObject({
  sinceVersion: z.coerce.number().int().min(0),
  sceneId: z.string().uuid().optional(),
});

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
      if (request.query !== null && typeof request.query === 'object' && 'sinceVersion' in request.query) {
        const query = parse(syncQuerySchema, request.query);
        return reply.send(syncCampaignActions(db, id, query.sinceVersion, query.sceneId));
      }
      return reply.send(listCampaignActions(db, id));
    });

    app.post('/campaigns/:id/actions/undo', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(undoActionRequestSchema, request.body);
      return reply.send(undoThrough(db, id, body.entryId));
    });

    app.post('/campaigns/:id/actions/redo', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(redoLastBatch(db, id));
    });

    done();
  };
