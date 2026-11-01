import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import {
  actorListSchema,
  campaignExportSchema,
  campaignListSchema,
  displayStateEnvelopeSchema,
  sceneSnapshotSchema,
  type MonsterStatblock,
} from '@dnd-vtt/shared';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';

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

const createCampaign = async (app: FastifyInstance, name: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

const createScene = async (app: FastifyInstance, campaignId: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/scenes`,
    payload: { name: 'Sala del contratto', widthPx: 1920, heightPx: 1080 },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

const createMonster = async (app: FastifyInstance, campaignId: string): Promise<string> => {
  const statblock: MonsterStatblock = {
    kind: 'monster',
    size: 'medium',
    abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 8 },
    hp: { current: 7, max: 7, temp: 0 },
    speed: { walk: 30 },
    senses: {},
    languages: ['common'],
    conditions: [],
    creatureType: 'goblinoid',
    cr: '1/4',
    tags: [],
    ac: 13,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    traits: [],
    actions: [],
    reactions: [],
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/actors',
    payload: { campaignId, kind: 'monster', name: 'Goblin di contratto', statblock },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

const createDisplay = async (app: FastifyInstance, campaignId: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/displays`,
    payload: { label: 'TV contratto' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ code: string }>().code;
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
    campaignId = await createCampaign(app, 'Campagna di contratto');
    sceneId = await createScene(app, campaignId);
    await createMonster(app, campaignId);
    displayCode = await createDisplay(app, campaignId);
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
