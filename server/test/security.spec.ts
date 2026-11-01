import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { actors } from '../src/db/schema.js';
import { closeTestApp, createTestApp } from './helpers.js';

/**
 * Regressioni di sicurezza trasversali: matrice autorizzazioni, rate limit
 * login dietro proxy, header helmet, upload polyglot e export con note private.
 * I casi già coperti in `api.spec.ts` (loopback, 5 login falliti, SVG, 404 su
 * `originals/`) non vengono duplicati.
 */

const FORWARDED_ADDRESS = '203.0.113.9';

/** Host consentito + X-Forwarded-For: il peer è loopback ma il bypass non vale. */
const forwardedHeaders = (ip = FORWARDED_ADDRESS): Record<string, string> => ({
  host: 'localhost:3000',
  'x-forwarded-for': ip,
});

const multipartUpload = async (
  app: FastifyInstance,
  filename: string,
  contentType: string,
  data: Buffer,
) => {
  const boundary = '----dnd-vtt-security';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n`
      + `Content-Type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: '/api/v1/assets',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
};

describe('matrice autorizzazioni DM', () => {
  it('rifiuta con 401 le route DM senza sessione da IP non loopback', async () => {
    const testApp = await createTestApp();
    const campaignId = uuidv7();
    try {
      const requests = [
        { method: 'POST' as const, url: '/api/v1/campaigns', payload: { name: 'Intrusa' } },
        { method: 'GET' as const, url: `/api/v1/campaigns/${campaignId}` },
        { method: 'GET' as const, url: `/api/v1/campaigns/${campaignId}/export` },
        { method: 'GET' as const, url: `/api/v1/campaigns/${campaignId}/actions` },
      ];
      for (const request of requests) {
        const response = await testApp.app.inject({
          ...request,
          headers: forwardedHeaders(),
        });
        expect(response.statusCode, `${request.method} ${request.url}`).toBe(401);
        expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
      }
    } finally {
      await closeTestApp(testApp);
    }
  });
});

describe('rate limit login dietro proxy', () => {
  it('blocca il sesto tentativo errato dello stesso IP reale con 429', async () => {
    // TRUST_PROXY=1: request.ip arriva da X-Forwarded-For, come dietro Caddy.
    const testApp = await createTestApp({ TRUST_PROXY: '1' });
    try {
      const attempt = (ip: string) => testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/dm',
        headers: forwardedHeaders(ip),
        payload: { password: 'sbagliata' },
      });

      for (let index = 0; index < 5; index += 1) {
        expect((await attempt(FORWARDED_ADDRESS)).statusCode).toBe(401);
      }
      const limited = await attempt(FORWARDED_ADDRESS);
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ error: { code: 'rate_limited' } });

      // Il bucket è per IP reale, non globale: un altro client non è bloccato.
      expect((await attempt('198.51.100.42')).statusCode).toBe(401);
    } finally {
      await closeTestApp(testApp);
    }
  });
});

describe('header di sicurezza helmet', () => {
  it('imposta nosniff, referrer-policy e HSTS anche sulle risposte API', async () => {
    const testApp = await createTestApp();
    try {
      const response = await testApp.app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['strict-transport-security']).toContain('max-age=');
    } finally {
      await closeTestApp(testApp);
    }
  });
});

describe('upload ostili', () => {
  it.each([
    [
      'file non immagine con estensione PNG',
      'mappa.png',
      'image/png',
      Buffer.from('<html><script>alert(1)</script></html>'),
    ],
    [
      'polyglot GIF+HTML',
      'polyglot.png',
      'image/png',
      Buffer.concat([
        Buffer.from('GIF89a'),
        Buffer.from('<html><script>alert(1)</script></html>'),
      ]),
    ],
  ])('rifiuta con 415 %s', async (_label, filename, contentType, data) => {
    const testApp = await createTestApp();
    try {
      const response = await multipartUpload(testApp.app, filename, contentType, data);
      expect(response.statusCode).toBe(415);
      expect(response.json()).toMatchObject({ error: { code: 'unsupported_media_type' } });
    } finally {
      await closeTestApp(testApp);
    }
  });
});

describe('export e note private', () => {
  it('omette playerNotes di default e le include solo su richiesta', async () => {
    const testApp = await createTestApp();
    try {
      const campaign = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        payload: { name: 'Segreti' },
      });
      const campaignId = campaign.json<{ id: string }>().id;
      const actor = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/actors',
        payload: {
          campaignId,
          kind: 'npc',
          name: 'Informatore',
          statblock: {
            kind: 'npc',
            size: 'medium',
            abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            hp: { current: 4, max: 4, temp: 0 },
            speed: { walk: 30 },
            senses: {},
            languages: [],
            conditions: [],
            creatureType: 'humanoid',
            tags: [],
            ac: 10,
            damageResistances: [],
            damageImmunities: [],
            damageVulnerabilities: [],
            conditionImmunities: [],
            traits: [],
            actions: [],
            reactions: [],
          },
        },
      });
      expect(actor.statusCode).toBe(201);
      const actorId = actor.json<{ id: string }>().id;
      testApp.database.db
        .update(actors)
        .set({ playerNotes: 'Nota privata del giocatore' })
        .where(eq(actors.id, actorId))
        .run();

      const defaultExport = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/export`,
      });
      expect(defaultExport.statusCode).toBe(200);
      const defaultActors = defaultExport.json<{ actors: Record<string, unknown>[] }>().actors;
      expect(defaultActors).toHaveLength(1);
      expect(defaultActors[0]).not.toHaveProperty('playerNotes');

      const withNotes = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/export?includePrivateNotes=true`,
      });
      expect(withNotes.statusCode).toBe(200);
      expect(withNotes.json<{ actors: { playerNotes?: string }[] }>().actors[0]?.playerNotes)
        .toBe('Nota privata del giocatore');
    } finally {
      await closeTestApp(testApp);
    }
  });
});
