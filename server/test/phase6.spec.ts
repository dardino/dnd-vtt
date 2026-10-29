import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDefaultSceneState, type FogOp, type SceneState } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';

const createCampaign = async (app: FastifyInstance, fogDefault: 'hidden' | 'revealed'): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    payload: { name: 'Fog', fogDefault },
  });
  return response.json<{ id: string }>().id;
};

const createScene = async (app: FastifyInstance, campaignId: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/scenes`,
    payload: { name: 'Fog scene', widthPx: 800, heightPx: 600 },
  });
  return response.json<{ id: string }>().id;
};

const send = async (
  app: FastifyInstance,
  campaignId: string,
  sceneId: string,
  action: object,
): Promise<{ id: string; statusCode: number }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/actions`,
    payload: { id: uuidv7(), clientId: 'fog', sceneId, action },
  });
  return { id: response.json().id as string, statusCode: response.statusCode };
};

const rectOp = (id: string): FogOp => ({
  id,
  op: 'reveal',
  shape: { type: 'rect', x: 10, y: 10, width: 100, height: 100 },
  softness: 10,
});

describe('fase 6: fog e disegni', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('crea scene con il fog default della campagna', async () => {
    const hiddenCampaign = await createCampaign(app, 'hidden');
    const revealedCampaign = await createCampaign(app, 'revealed');
    const hiddenScene = await createScene(app, hiddenCampaign);
    const revealedScene = await createScene(app, revealedCampaign);
    expect((await app.inject({ method: 'GET', url: `/api/v1/scenes/${hiddenScene}` }))
      .json().state.fog).toEqual({ base: 'hidden', ops: [] });
    expect((await app.inject({ method: 'GET', url: `/api/v1/scenes/${revealedScene}` }))
      .json().state.fog).toEqual({ base: 'revealed', ops: [] });
  });

  it('applica fog e disegni e li annulla dal log', async () => {
    const campaignId = await createCampaign(app, 'hidden');
    const sceneId = await createScene(app, campaignId);
    const fog = await send(app, campaignId, sceneId, {
      type: 'fog.apply',
      op: rectOp('op-1'),
    });
    expect(fog.statusCode).toBe(200);
    const drawing = await send(app, campaignId, sceneId, {
      type: 'drawing.add',
      drawing: {
        id: 'drawing-1',
        points: [{ x: 1, y: 2 }, { x: 20, y: 30 }],
        color: '#c9a227',
        width: 3,
        visible: true,
      },
    });
    expect(drawing.statusCode).toBe(200);
    let snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.json().state.fog.ops).toHaveLength(1);
    expect(snapshot.json().state.drawings).toHaveLength(1);

    const undone = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions/undo`,
      payload: { entryId: drawing.id },
    });
    expect(undone.statusCode).toBe(200);
    snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.json().state.drawings).toHaveLength(0);
    expect(snapshot.json().state.fog.ops).toHaveLength(1);

    const replaced = await send(app, campaignId, sceneId, {
      type: 'fog.replace',
      base: 'revealed',
      ops: [],
    });
    expect(replaced.statusCode).toBe(200);
    snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.json().state.fog).toEqual({ base: 'revealed', ops: [] });
  });

  it('rifiuta la 2001esima operazione di fog con 413', async () => {
    const campaignId = await createCampaign(app, 'hidden');
    const sceneId = await createScene(app, campaignId);
    const state: SceneState = createDefaultSceneState();
    state.fog.ops = Array.from({ length: 2000 }, (_, index) => rectOp(`op-${index}`));
    const recovery = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenes/${sceneId}/state`,
      payload: { stateVersion: 1, state },
    });
    expect(recovery.statusCode).toBe(200);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload: {
        id: uuidv7(),
        clientId: 'fog',
        sceneId,
        action: { type: 'fog.apply', op: rectOp('overflow') },
      },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('payload_too_large');
  });
});
