import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { insertDisplay } from '../src/db/displays.repository.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';

// Alfabeto base32 senza caratteri ambigui: niente I, O, 0, 1.
const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

describe('displays: generazione del codice', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let campaignId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      payload: { name: 'Display' },
    });
    campaignId = response.json<{ id: string }>().id;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('genera codici di 8 caratteri dall\'alfabeto atteso', () => {
    const codes = Array.from(
      { length: 50 },
      () => insertDisplay(testApp.database.db, campaignId, 'TV').code,
    );
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect(code).toMatch(CODE_PATTERN);
    }
  });
});
