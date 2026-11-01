import type { FastifyPluginCallback } from 'fastify';
import { playerSheetPatchSchema } from '@dnd-vtt/shared';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { idParamsSchema, parse } from '../http/validation.js';
import {
  activePlayerLink,
  createPlayerLink,
  patchPlayerSheet,
  playerSheetByToken,
  setPlayerEditing,
} from './service.js';

const tokenParamsSchema = z.strictObject({ token: z.string().min(1).max(200) });
const editingSchema = z.strictObject({ editingEnabled: z.boolean() });

export const playerRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    app.post('/actors/:id/player-link', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      return reply.status(201).send(createPlayerLink(db, id, env.publicUrl.toString()));
    });

    app.get('/actors/:id/player-link', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      return reply.send({ link: activePlayerLink(db, id) });
    });

    app.patch('/actors/:id/player-link', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      const body = parse(editingSchema, request.body);
      return reply.send({ link: setPlayerEditing(db, id, body.editingEnabled) });
    });

    app.get('/play/:token/sheet', async (request, reply) => {
      const { token } = parse(tokenParamsSchema, request.params);
      return reply.send(playerSheetByToken(db, token));
    });

    app.patch('/play/:token/sheet', async (request, reply) => {
      const { token } = parse(tokenParamsSchema, request.params);
      const body = parse(playerSheetPatchSchema, request.body);
      return reply.send(patchPlayerSheet(db, token, body));
    });

    done();
  };
