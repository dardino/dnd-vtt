import type { FastifyPluginCallback } from 'fastify';
import {
  createMapSchema,
  createSceneFromMapSchema,
  putMapSchema,
} from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { parse } from '../http/validation.js';
import {
  createMap,
  createSceneFromMap,
  duplicateMap,
  listCampaignMaps,
  putMap,
  removeMap,
  requireMapFull,
} from './service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const mapParamsSchema = z.strictObject({ mapId: z.string().uuid() });

export const mapRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.get('/campaigns/:id/maps', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send({ items: listCampaignMaps(db, id) });
    });

    app.post('/campaigns/:id/maps', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(createMapSchema, request.body);
      return reply.status(201).send(createMap(db, id, body));
    });

    app.post('/campaigns/:id/scenes/from-map', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(createSceneFromMapSchema, request.body);
      return reply.status(201).send(createSceneFromMap(db, id, body));
    });

    app.get('/maps/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(requireMapFull(db, id));
    });

    app.put('/maps/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(putMapSchema, request.body);
      return reply.send(putMap(db, id, body.version, body.document));
    });

    app.delete('/maps/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      removeMap(db, id);
      return reply.status(204).send();
    });

    app.post('/maps/:mapId/duplicate', async (request, reply) => {
      const { mapId } = parse(mapParamsSchema, request.params);
      return reply.status(201).send(duplicateMap(db, mapId));
    });

    done();
  };
