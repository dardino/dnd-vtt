import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import {
  actorListSchema,
  campaignExportSchema,
  campaignListSchema,
  displayStateEnvelopeSchema,
  sceneSnapshotSchema,
} from '@dnd-vtt/shared';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import {
  createCampaign,
  createDisplay,
  createMonster,
  createScene,
} from './factories.js';

/**
 * Contract test: le risposte HTTP reali devono superare gli stessi schemi Zod
 * che il client usa per i DTO. Una divergenza fallisce qui, non a runtime.
 */
const expectContract = (schema: ZodType, body: unknown, endpoint: string): void => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(
      `[contratto] ${endpoint} non rispetta lo schema condiviso:\n`
      + JSON.stringify(result.error.issues, null, 2),
    );
  }
};

describe('contratti HTTP client/server', () => {
  let testApp: TestApp;
  let app: FastifyInstance;
  let campaignId: string;
  let sceneId: string;
  let displayCode: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    campaignId = await createCampaign(app, { name: 'Campagna di contratto' });
    sceneId = await createScene(app, campaignId, { name: 'Sala del contratto' });
    await createMonster(app, campaignId, { name: 'Goblin di contratto' });
    displayCode = await createDisplay(app, campaignId, { label: 'TV contratto' });
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('GET /api/v1/campaigns rispetta campaignListSchema', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/campaigns?limit=10' });
    expect(response.statusCode).toBe(200);
    expectContract(campaignListSchema, response.json(), 'GET /api/v1/campaigns');
  });

  it('GET /api/v1/scenes/:id rispetta sceneSnapshotSchema', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(response.statusCode).toBe(200);
    expectContract(sceneSnapshotSchema, response.json(), 'GET /api/v1/scenes/:id');
  });

  it('GET /api/v1/actors rispetta actorListSchema', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/actors?campaignId=${campaignId}`,
    });
    expect(response.statusCode).toBe(200);
    expectContract(actorListSchema, response.json(), 'GET /api/v1/actors');
  });

  it('GET /api/v1/displays/:code rispetta displayStateEnvelopeSchema', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/displays/${displayCode}` });
    expect(response.statusCode).toBe(200);
    // La route restituisce l'envelope { display, state }: lo state interno è DisplayState.
    expectContract(displayStateEnvelopeSchema, response.json(), 'GET /api/v1/displays/:code');
  });

  it('GET /api/v1/campaigns/:id/export rispetta campaignExportSchema', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/export`,
    });
    expect(response.statusCode).toBe(200);
    expectContract(campaignExportSchema, response.json(), 'GET /api/v1/campaigns/:id/export');
  });
});
