import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrations.js';
import { createTestEnv } from './helpers.js';

interface ProbeApp {
  app: FastifyInstance;
  close: () => Promise<void>;
}

const FORWARDED_A = '203.0.113.7';
const FORWARDED_B = '198.51.100.42';

/**
 * Le route di prova hanno config `rateLimit` locale (max 2) per non dover
 * inviare 300 richieste né avviare l'app in NODE_ENV=production.
 */
const createProbeApp = async (raw: NodeJS.ProcessEnv = {}): Promise<ProbeApp> => {
  const env = createTestEnv(raw);
  const database = createDatabase(':memory:');
  runMigrations(database, env.migrationsDir);
  const app = buildApp({ env, database });
  // eslint-disable-next-line @typescript-eslint/require-await -- plugin Fastify
  await app.register(async (instance) => {
    instance.get('/__test/ip', (request) => ({ ip: request.ip, ips: request.ips }));
    instance.get(
      '/__test/limited',
      { config: { rateLimit: { max: 2, timeWindow: 60_000 } } },
      (request) => ({ ip: request.ip }),
    );
  });
  await app.ready();
  return {
    app,
    close: async () => {
      await app.close();
      database.close();
    },
  };
};

const forwarded = (ip: string): Record<string, string> => ({ 'x-forwarded-for': ip });

describe('S7: trusted proxy e X-Forwarded-For', () => {
  it('con TRUST_PROXY=1 usa X-Forwarded-For come request.ip', async () => {
    const probe = await createProbeApp({ TRUST_PROXY: '1' });
    try {
      const response = await probe.app.inject({
        method: 'GET',
        url: '/__test/ip',
        headers: forwarded(FORWARDED_A),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ip: FORWARDED_A, ips: ['127.0.0.1', FORWARDED_A] });
    } finally {
      await probe.close();
    }
  });

  it('senza TRUST_PROXY ignora X-Forwarded-For', async () => {
    const probe = await createProbeApp();
    try {
      const response = await probe.app.inject({
        method: 'GET',
        url: '/__test/ip',
        headers: forwarded(FORWARDED_A),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ip: '127.0.0.1' });
    } finally {
      await probe.close();
    }
  });

  it('separa i bucket del rate limit per IP forwarded', async () => {
    const probe = await createProbeApp({ TRUST_PROXY: '1' });
    try {
      const request = (ip: string) => probe.app.inject({
        method: 'GET',
        url: '/__test/limited',
        headers: forwarded(ip),
      });

      expect((await request(FORWARDED_A)).statusCode).toBe(200);
      expect((await request(FORWARDED_A)).statusCode).toBe(200);
      const exceeded = await request(FORWARDED_A);
      expect(exceeded.statusCode).toBe(429);
      expect(exceeded.json()).toMatchObject({ error: { code: 'rate_limited' } });

      // Il bucket di B è indipendente: non eredita i due colpi di A.
      expect((await request(FORWARDED_B)).statusCode).toBe(200);
      expect((await request(FORWARDED_B)).statusCode).toBe(200);
      expect((await request(FORWARDED_B)).statusCode).toBe(429);
    } finally {
      await probe.close();
    }
  });
});
