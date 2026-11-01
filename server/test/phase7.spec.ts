import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ProgramState } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import WebSocket from 'ws';
import type { RawData } from 'ws';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign, createScene, sendAction } from './factories.js';

const rawText = (raw: RawData): string => {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  return Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8');
};

describe('fase 7: program e schermo', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ LOG_LEVEL: 'error' });
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('proietta solo i token visibili e scoperti', async () => {
    const campaignId = await createCampaign(app, { name: 'Regia' });
    const sceneId = await createScene(app, campaignId, {
      name: 'Palco',
      widthPx: 1000,
      heightPx: 800,
      fogBase: 'revealed',
    });
    const visibleToken = {
      id: uuidv7(), label: 'Visibile', x: 1, y: 1, size: 1, rotation: 0, elevation: 0,
      hp: { current: 5, max: 5, temp: 0 }, conditions: [], visible: true,
    };
    const hiddenToken = {
      ...visibleToken, id: uuidv7(), label: 'Nascosto', x: 2, y: 2, visible: false,
    };
    const coveredToken = {
      ...visibleToken, id: uuidv7(), label: 'Coperto', x: 10, y: 10,
    };
    await sendAction(app, campaignId, sceneId, { type: 'token.add', token: visibleToken }, {
      expectStatus: 200,
    });
    await sendAction(app, campaignId, sceneId, { type: 'token.add', token: hiddenToken }, {
      expectStatus: 200,
    });
    await sendAction(app, campaignId, sceneId, { type: 'token.add', token: coveredToken }, {
      expectStatus: 200,
    });
    await sendAction(app, campaignId, sceneId, {
      type: 'fog.apply',
      op: {
        id: 'cover',
        op: 'hide',
        shape: { type: 'rect', x: 500, y: 500, width: 400, height: 300 },
        softness: 0,
      },
    }, { expectStatus: 200 });

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/displays`,
      payload: { label: 'TV' },
    });
    expect(created.statusCode).toBe(201);
    const display = created.json<{ code: string }>();
    const stateResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/displays/${display.code}`,
    });
    expect(stateResponse.statusCode).toBe(200);
    const state = stateResponse.json();
    expect(state.state.composition.base.type).toBe('map');
    const labels = state.state.composition.base.scene.tokens.map((token: { label: string }) => token.label);
    expect(labels).toContain('Visibile');
    expect(labels).not.toContain('Nascosto');
    expect(labels).not.toContain('Coperto');
  });

  it('pubblica il program e invia lo snapshot al WebSocket display', async () => {
    const campaignId = await createCampaign(app, { name: 'Regia' });
    const sceneId = await createScene(app, campaignId, {
      name: 'Palco',
      widthPx: 1000,
      heightPx: 800,
      fogBase: 'revealed',
    });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/displays`,
      payload: {},
    });
    const display = created.json<{ code: string }>();
    const program = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/program`,
    });
    const version = program.json<{ version: number; state: ProgramState }>();
    const state: ProgramState = {
      ...version.state,
      base: {
        ...version.state.base,
        content: {
          type: 'map',
          sceneId,
          viewport: { x: 500, y: 400, zoom: 1 },
          fog: true,
          cameraLocked: false,
        },
      },
    };
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('indirizzo server non disponibile');
    }
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?role=display&code=${display.code}`);
    const first = await new Promise<{ type: string }>((resolve, reject) => {
      socket.once('message', (raw) => resolve(JSON.parse(rawText(raw)) as { type: string }));
      socket.once('error', reject);
    });
    expect(first.type).toBe('hello');
    const updated = new Promise<string>((resolve, reject) => {
      socket.once('message', (raw) => resolve((JSON.parse(rawText(raw)) as { type: string }).type));
      socket.once('error', reject);
    });
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${campaignId}/program`,
      payload: { version: version.version, state },
    });
    expect(response.statusCode).toBe(200);
    expect(await updated).toBe('display.updated');
    socket.close();
  });
});
