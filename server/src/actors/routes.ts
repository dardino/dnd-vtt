import type { FastifyPluginCallback } from 'fastify';
import { createActorSchema, createPcSchema, sheetPatchSchema, updateActorSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { notFound } from '../errors.js';
import { parse } from '../http/validation.js';
import { pageParams, pageQuerySchema } from '../http/pagination.js';
import {
  createActor,
  listActorPage,
  patchActor,
  removeActor,
  requireActor,
} from '../actors/service.js';
import { createPc, getDmSheet, patchPcSheet } from '../actors/pc-service.js';
import { rollAbilityScores } from '../actors/roll-stats.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const actorQuerySchema = pageQuerySchema.extend({
  kind: z.enum(['monster', 'npc', 'pc']).optional(),
  campaignId: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export const actorRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.get('/actors', async (request, reply) => {
      const query = parse(actorQuerySchema, request.query);
      const page = pageParams(query);
      return reply.send(listActorPage(db, {
        ...page,
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
        ...(query.q === undefined ? {} : { query: query.q }),
      }));
    });

    app.post('/actors', async (request, reply) => {
      const body = parse(createActorSchema, request.body);
      return reply.status(201).send(createActor(db, body));
    });

    app.post('/campaigns/:id/actors', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(createPcSchema, request.body);
      return reply.status(201).send(createPc(db, id, body));
    });

    app.post('/campaigns/:id/actors/roll-stats', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      if (getCampaign(db, id) === null) {
        throw notFound('Campagna non trovata');
      }
      return reply.send(rollAbilityScores());
    });

    app.get('/actors/:id/sheet', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(getDmSheet(db, id));
    });

    app.patch('/actors/:id/sheet', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(sheetPatchSchema, request.body);
      return reply.send(patchPcSheet(db, id, body));
    });

    app.get('/actors/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      return reply.send(requireActor(db, id));
    });

    app.patch('/actors/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(updateActorSchema, request.body);
      return reply.send(patchActor(db, id, body));
    });

    app.delete('/actors/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      removeActor(db, id);
      return reply.status(204).send();
    });

    done();
  };
