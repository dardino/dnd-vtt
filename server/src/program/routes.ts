import type { FastifyPluginCallback } from 'fastify';
import {
  createDisplaySchema,
  displayCompositionSchema,
  displayViewportRequestSchema,
  putProgramSchema,
} from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { requireCampaign } from '../campaigns/service.js';
import {
  getDisplay,
  insertDisplay,
  listDisplays,
  revokeDisplay,
} from '../db/displays.repository.js';
import { AppError, notFound } from '../errors.js';
import { idParamsSchema, parse } from '../http/validation.js';
import {
  displayStateByCode,
  getProgram,
  putDisplayComposition,
  putDisplayViewport,
  putProgram,
} from './service.js';
import type { RealtimeHub } from '../realtime/hub.js';

const displayParamsSchema = z.strictObject({
  id: z.string().uuid(),
  displayId: z.string().uuid(),
});
const codeParamsSchema = z.strictObject({ code: z.string().min(1).max(12) });

export const programRoutes = (env: AppEnv, db: AppDatabase, hub: RealtimeHub): FastifyPluginCallback =>
  (app, _options, done) => {
    app.get('/campaigns/:id/program', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(db, id);
      return reply.send(getProgram(db, id));
    });

    app.put('/campaigns/:id/program', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(putProgramSchema, request.body);
      const program = putProgram(db, id, body.version, body.state);
      hub.broadcastDisplays(id);
      return reply.send(program);
    });

    app.put('/campaigns/:id/displays/:displayId/composition', async (request, reply) => {
      requireDm(request, env);
      const { id, displayId } = parse(displayParamsSchema, request.params);
      const body = parse(displayCompositionSchema, request.body);
      const result = putDisplayComposition(db, id, displayId, body.version, body.composition);
      hub.broadcastDisplays(id);
      return reply.send(result);
    });

    app.put('/campaigns/:id/displays/:displayId/viewport', async (request, reply) => {
      requireDm(request, env);
      const { id, displayId } = parse(displayParamsSchema, request.params);
      const body = parse(displayViewportRequestSchema, request.body);
      const result = putDisplayViewport(db, id, displayId, body.version, body.viewport);
      hub.broadcastDisplays(id);
      return reply.send(result);
    });

    app.post('/campaigns/:id/displays', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(db, id);
      const body = parse(createDisplaySchema, request.body);
      const display = insertDisplay(db, id, body.label ?? 'Schermo giocatori');
      const program = getProgram(db, id);
      const seeded = putDisplayComposition(db, id, display.id, display.compositionVersion, {
        base: program.state.base,
        overlays: program.state.overlays,
      });
      return reply.status(201).send({ ...display, compositionVersion: seeded.version });
    });

    app.get('/campaigns/:id/displays', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(db, id);
      return reply.send({ items: listDisplays(db, id) });
    });

    app.get('/campaigns/:id/displays/online', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(db, id);
      const online = hub.onlineDisplayCodes(id);
      return reply.send({ items: listDisplays(db, id).filter((display) => online.has(display.code)) });
    });

    app.delete('/displays/:id', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      const display = getDisplay(db, id);
      if (display === null) {
        throw notFound('Schermo non trovato');
      }
      if (!revokeDisplay(db, id)) {
        throw new AppError('state_conflict', 409, 'Schermo non revocabile');
      }
      return reply.status(204).send();
    });

    app.get('/displays/:code', async (request, reply) => {
      const { code } = parse(codeParamsSchema, request.params);
      return reply.send(displayStateByCode(db, code));
    });

    done();
  };
