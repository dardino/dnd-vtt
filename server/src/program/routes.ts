import type { FastifyPluginCallback } from 'fastify';
import { createDisplaySchema, putProgramSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import {
  getDisplay,
  insertDisplay,
  listDisplays,
  revokeDisplay,
} from '../db/displays.repository.js';
import { AppError, notFound } from '../errors.js';
import { parse } from '../http/validation.js';
import { displayStateByCode, getProgram, putProgram } from './service.js';
import { broadcastDisplays } from '../realtime/hub.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const codeParamsSchema = z.strictObject({ code: z.string().min(1).max(12) });

export const programRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    const requireCampaign = (id: string): void => {
      if (getCampaign(db, id) === null) {
        throw notFound('Campagna non trovata');
      }
    };

    app.get('/campaigns/:id/program', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(id);
      return reply.send(getProgram(db, id));
    });

    app.put('/campaigns/:id/program', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(putProgramSchema, request.body);
      const program = putProgram(db, id, body.version, body.state);
      broadcastDisplays(id);
      return reply.send(program);
    });

    app.post('/campaigns/:id/displays', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(id);
      const body = parse(createDisplaySchema, request.body);
      return reply.status(201).send(insertDisplay(db, id, body.label ?? 'Schermo giocatori'));
    });

    app.get('/campaigns/:id/displays', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      requireCampaign(id);
      return reply.send({ items: listDisplays(db, id) });
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
