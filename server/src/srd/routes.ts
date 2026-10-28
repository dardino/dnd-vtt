import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import type {
  SrdClass,
  SrdItem,
  SrdMonster,
  SrdSpell,
} from '@dnd-vtt/shared';
import {
  SrdVersionUnknownError,
  availableSrdVersions,
  currentSrdVersion,
  loadSrdCatalog,
} from './load.js';

interface VersionParams {
  version: string;
}

interface CollectionQuery {
  q?: string;
}

interface SpellQuery extends CollectionQuery {
  level?: string;
  class?: string;
}

interface ItemQuery extends CollectionQuery {
  category?: string;
}

interface MonsterQuery extends CollectionQuery {
  cr?: string;
  type?: string;
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const sendError = (
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply => reply.status(status).send({ error: { code, message } });

const includesQuery = (value: string, query: string | undefined): boolean =>
  query === undefined || query.trim() === '' || value.toLowerCase().includes(query.trim().toLowerCase());

const catalogOr404 = (version: string, reply: FastifyReply) => {
  try {
    return loadSrdCatalog(version);
  } catch (error) {
    if (error instanceof SrdVersionUnknownError) {
      sendError(reply, 404, 'srd_version_unknown', error.message);
      return undefined;
    }
    throw error;
  }
};

export const srdRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get('/srd/meta', (_request, reply) => {
    const version = currentSrdVersion();
    const catalog = catalogOr404(version, reply);
    if (catalog === undefined) {
      return reply;
    }
    return reply
      .header('cache-control', IMMUTABLE_CACHE)
      .send({
        version,
        versions: availableSrdVersions(),
        license: catalog.meta.license,
        source: catalog.meta.source,
        updatedAt: catalog.meta.source.importedAt,
        counts: catalog.meta.counts,
      });
  });

  app.get<{ Params: VersionParams }>('/srd/:version/classes', (request, reply) => {
    const catalog = catalogOr404(request.params.version, reply);
    if (catalog === undefined) {
      return reply;
    }
    return reply.header('cache-control', IMMUTABLE_CACHE).send(catalog.classes satisfies SrdClass[]);
  });

  app.get<{ Params: VersionParams }>('/srd/:version/species', (request, reply) => {
    const catalog = catalogOr404(request.params.version, reply);
    if (catalog === undefined) {
      return reply;
    }
    return reply.header('cache-control', IMMUTABLE_CACHE).send(catalog.species);
  });

  app.get<{ Params: VersionParams }>('/srd/:version/backgrounds', (request, reply) => {
    const catalog = catalogOr404(request.params.version, reply);
    if (catalog === undefined) {
      return reply;
    }
    return reply.header('cache-control', IMMUTABLE_CACHE).send(catalog.backgrounds);
  });

  app.get<{ Params: VersionParams }>('/srd/:version/feats', (request, reply) => {
    const catalog = catalogOr404(request.params.version, reply);
    if (catalog === undefined) {
      return reply;
    }
    return reply.header('cache-control', IMMUTABLE_CACHE).send(catalog.feats);
  });

  app.get<{ Params: VersionParams; Querystring: SpellQuery }>(
    '/srd/:version/spells',
    (request, reply) => {
      const catalog = catalogOr404(request.params.version, reply);
      if (catalog === undefined) {
        return reply;
      }
      const { level, class: classId, q } = request.query;
      const parsedLevel = level === undefined ? undefined : Number(level);
      if (parsedLevel !== undefined && (!Number.isInteger(parsedLevel) || parsedLevel < 0 || parsedLevel > 9)) {
        return sendError(reply, 400, 'bad_request', 'Il livello dell incantesimo deve essere tra 0 e 9');
      }
      const spells = catalog.spells.filter((spell: SrdSpell) =>
        (parsedLevel === undefined || spell.level === parsedLevel)
        && (classId === undefined || spell.classes.includes(classId))
        && includesQuery(spell.name, q));
      return reply.header('cache-control', IMMUTABLE_CACHE).send(spells);
    },
  );

  app.get<{ Params: VersionParams; Querystring: ItemQuery }>(
    '/srd/:version/items',
    (request, reply) => {
      const catalog = catalogOr404(request.params.version, reply);
      if (catalog === undefined) {
        return reply;
      }
      const { category, q } = request.query;
      const items = catalog.items.filter((item: SrdItem) =>
        (category === undefined || item.category === category)
        && includesQuery(item.name, q));
      return reply.header('cache-control', IMMUTABLE_CACHE).send(items);
    },
  );

  app.get<{ Params: VersionParams; Querystring: MonsterQuery }>(
    '/srd/:version/monsters',
    (request, reply) => {
      const catalog = catalogOr404(request.params.version, reply);
      if (catalog === undefined) {
        return reply;
      }
      const { cr, type, q } = request.query;
      const monsters = catalog.monsters.filter((monster: SrdMonster) =>
        (cr === undefined || monster.cr === cr)
        && (type === undefined || monster.creatureType.toLowerCase() === type.toLowerCase())
        && includesQuery(monster.name, q));
      return reply.header('cache-control', IMMUTABLE_CACHE).send(monsters);
    },
  );

  done();
};
