import type { FastifyPluginCallback } from 'fastify';
import { updateSceneSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { dmPreHandler } from '../http/guards.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { idParamsSchema, parse } from '../http/validation.js';
import {
  patchScene,
  removeScene,
  snapshotScene,
} from '../scenes/service.js';

const snapshotQuerySchema = z.strictObject({ force: z.enum(['true', 'false']).optional() });

export const sceneRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    app.addHook('preHandler', dmPreHandler(env));

    app.get('/scenes/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(snapshotScene(db, id));
    });

    app.get('/scenes/:id/snapshot', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const query = parse(snapshotQuerySchema, request.query);
      const snapshot = snapshotScene(db, id);
      const etag = `"scene-${snapshot.stateVersion}"`;
      if (query.force !== 'true' && request.headers['if-none-match'] === etag) {
        return reply.status(304).send();
      }
      return reply.header('etag', etag).send(snapshot);
    });

    app.patch('/scenes/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(updateSceneSchema, request.body);
      return reply.send(patchScene(db, id, body));
    });

    app.delete('/scenes/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      removeScene(db, id);
      return reply.status(204).send();
    });

    done();
  };
