import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { notFound } from '../errors.js';
import { parse } from '../http/validation.js';
import { parseMonsterText } from './parse.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });
const parseSchema = z.strictObject({ text: z.string().trim().min(1).max(20000) });
const chatSchema = z.strictObject({ message: z.string().trim().min(1).max(4000) });

export const aiRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    app.get('/ai/status', async (request, reply) => {
      requireDm(request, env);
      return reply.send({
        enabled: false,
        message: 'Chat IA non configurata: il fallback locale è attivo.',
      });
    });

    app.post('/campaigns/:id/parse/statblock', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      if (getCampaign(db, id) === null) {
        throw notFound('Campagna non trovata');
      }
      const body = parse(parseSchema, request.body);
      return reply.send({ statblock: parseMonsterText(body.text), source: 'regex' });
    });

    app.post('/campaigns/:id/chat', async (request, reply) => {
      requireDm(request, env);
      const { id } = parse(idParamsSchema, request.params);
      if (getCampaign(db, id) === null) {
        throw notFound('Campagna non trovata');
      }
      parse(chatSchema, request.body);
      return reply.status(503).send({
        error: {
          code: 'ai_disabled',
          message: 'Chat IA non configurata. Il tavolo può continuare senza.',
        },
      });
    });

    done();
  };
