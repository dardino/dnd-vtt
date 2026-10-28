import type { FastifyPluginCallback } from 'fastify';
import { putSceneStateSchema, updateSceneSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import {
  patchScene,
  removeScene,
  saveSceneState,
  snapshotScene,
} from '../scenes/service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const snapshotQuerySchema = z.strictObject({ force: z.enum(['true', 'false']).optional() });

export const sceneRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

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

    app.put('/scenes/:id/state', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(putSceneStateSchema, request.body);
      const serialized = JSON.stringify(body.state);
      if (Buffer.byteLength(serialized, 'utf8') > env.maxJsonBytes) {
        return reply.status(413).send({
          error: {
            code: 'payload_too_large',
            message: 'Lo stato della scena supera il limite consentito',
            requestId: request.id,
          },
        });
      }
      const result = saveSceneState(db, id, body.state, body.stateVersion);
      return reply.header('etag', `"scene-${result.stateVersion}"`).send(result);
    });

    app.delete('/scenes/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      removeScene(db, id);
      return reply.status(204).send();
    });

    done();
  };
