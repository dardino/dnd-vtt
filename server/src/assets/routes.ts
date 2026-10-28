import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { deleteAsset, getAsset } from '../db/assets.repository.js';
import { AppError, notFound } from '../errors.js';
import { parse } from '../http/validation.js';
import { assetInUse, storeAsset } from './service.js';

const idParamsSchema = z.strictObject({ id: z.string().uuid() });

export const assetRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginCallback =>
  (app, _options, done) => {
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('preHandler', async (request) => {
      requireDm(request, env);
    });

    app.post('/assets', async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError('unsupported_media_type', 415, 'È richiesto un upload multipart');
      }
      const file = await request.file();
      if (file === undefined) {
        throw new AppError('validation_error', 400, 'Nessun file ricevuto');
      }
      const buffer = await file.toBuffer();
      if (buffer.byteLength > env.maxUploadBytes) {
        throw new AppError('payload_too_large', 413, 'Il file supera il limite di upload');
      }
      const asset = await storeAsset(env, db, buffer);
      return reply.status(201).send(asset);
    });

    app.get('/assets/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      const asset = getAsset(db, id);
      if (asset === null) {
        throw notFound('Asset non trovato');
      }
      return reply.send(asset);
    });

    app.delete('/assets/:id', async (request, reply) => {
      const { id } = parse(idParamsSchema, request.params);
      if (getAsset(db, id) === null) {
        throw notFound('Asset non trovato');
      }
      if (assetInUse(db, id)) {
        throw new AppError('forbidden', 409, 'Asset referenziato da una scena o da un attore');
      }
      deleteAsset(db, id);
      return reply.status(204).send();
    });

    done();
  };
