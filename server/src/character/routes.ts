import type { FastifyPluginCallback } from 'fastify';
import { pcBuildSchema, validatePcBuild } from '@dnd-vtt/shared';
import { SrdVersionUnknownError, loadSrdCatalog } from '../srd/load.js';

export const characterRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.post('/actors/preview', (request, reply) => {
    const parsed = pcBuildSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: {
          code: 'invalid_build',
          message: 'La build non è conforme allo schema',
          details: parsed.error.issues,
        },
      });
    }

    try {
      const catalog = loadSrdCatalog(parsed.data.rulesVersion);
      const result = validatePcBuild(parsed.data, catalog);
      return reply.send(result);
    } catch (error) {
      if (error instanceof SrdVersionUnknownError) {
        return reply.status(404).send({
          error: { code: 'srd_version_unknown', message: error.message },
        });
      }
      throw error;
    }
  });

  done();
};
