import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { RawData } from 'ws';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign, createDisplay, createScene, sendAction } from './factories.js';

const ALLOWED_ORIGIN = 'http://localhost:4200';

interface ActionBroadcast {
  sceneId: string;
  stateVersion: number;
}

const rawText = (raw: RawData): string => {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  return Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw).toString('utf8');
};

const listen = async (app: FastifyInstance): Promise<number> => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('indirizzo server non disponibile');
  }
  return address.port;
};

const dmSocketUrl = (port: number, campaignId: string): string =>
  `ws://127.0.0.1:${port}/ws?role=dm&campaignId=${campaignId}`;

/** Attende il primo envelope `action.applied`; il listener va agganciato prima della POST. */
const waitForActionApplied = (socket: WebSocket): Promise<ActionBroadcast> =>
  new Promise((resolve, reject) => {
    const onMessage = (raw: RawData): void => {
      const parsed = JSON.parse(rawText(raw)) as { type?: string; payload?: unknown };
      if (parsed.type !== 'action.applied') {
        return;
      }
      socket.off('message', onMessage);
      socket.off('error', onError);
      resolve(parsed.payload as ActionBroadcast);
    };
    const onError = (error: Error): void => {
      socket.off('message', onMessage);
      reject(error);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
  });

const waitForHello = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    const onMessage = (raw: RawData): void => {
      const parsed = JSON.parse(rawText(raw)) as { type?: string };
      if (parsed.type !== 'hello') {
        return;
      }
      socket.off('message', onMessage);
      socket.off('error', onError);
      resolve();
    };
    const onError = (error: Error): void => {
      socket.off('message', onMessage);
      reject(error);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
  });

/** Registra i `action.applied` ricevuti; il listener va agganciato prima della POST. */
const collectActionTypes = (socket: WebSocket): string[] => {
  const types: string[] = [];
  socket.on('message', (raw: RawData) => {
    const parsed = JSON.parse(rawText(raw)) as { type?: string };
    if (parsed.type === 'action.applied') {
      types.push(parsed.type);
    }
  });
  return types;
};

describe('realtime: broadcast azioni ai DM', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let port: number;
  let campaignId: string;
  let sceneId: string;

  beforeAll(async () => {
    testApp = await createTestApp({ LOG_LEVEL: 'error' });
    app = testApp.app;
    campaignId = await createCampaign(app, { name: 'Realtime azioni' });
    sceneId = await createScene(app, campaignId, {
      name: 'Realtime scena',
      widthPx: 800,
      heightPx: 600,
    });
    port = await listen(app);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('invia action.applied ai soli client DM dopo una POST azione', async () => {
    // Il listener va agganciato subito: `hello` arriva appena completa l'upgrade.
    const socket = new WebSocket(
      dmSocketUrl(port, campaignId),
      { headers: { Origin: ALLOWED_ORIGIN } },
    );
    const hello = waitForHello(socket);
    await hello;

    const applied = waitForActionApplied(socket);
    const sent = await sendAction(app, campaignId, sceneId, {
      type: 'fog.apply',
      op: {
        id: 'op-realtime',
        op: 'reveal',
        shape: { type: 'rect', x: 10, y: 10, width: 100, height: 100 },
        softness: 10,
      },
    }, { clientId: 'realtime-test', expectStatus: 200 });

    await expect(applied).resolves.toMatchObject({
      id: sent.body.id,
      sceneId,
      stateVersion: sent.body.stateVersion,
    });

    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.close();
    await closed;
  });

  it('invia action.applied con sceneId/stateVersion dopo undo e reset-fog', async () => {
    const socket = new WebSocket(
      dmSocketUrl(port, campaignId),
      { headers: { Origin: ALLOWED_ORIGIN } },
    );
    await waitForHello(socket);

    // Consuma subito il broadcast della POST: il listener successivo deve
    // vedere solo il messaggio di undo, senza gare con l'ordine di arrivo.
    const postedBroadcast = waitForActionApplied(socket);
    const sent = await sendAction(app, campaignId, sceneId, {
      type: 'fog.apply',
      op: {
        id: 'op-undo',
        op: 'reveal',
        shape: { type: 'rect', x: 20, y: 20, width: 50, height: 50 },
        softness: 0,
      },
    }, { clientId: 'realtime-test', expectStatus: 200 });
    const entryId = sent.body.id;
    await postedBroadcast;

    const undone = waitForActionApplied(socket);
    const undoResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions/undo`,
      payload: { entryId },
    });
    expect(undoResponse.statusCode).toBe(200);
    await expect(undone).resolves.toEqual({
      sceneId,
      stateVersion: undoResponse.json<{ snapshot: { stateVersion: number } }>().snapshot.stateVersion,
    });

    const reset = waitForActionApplied(socket);
    const resetResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions/reset-fog`,
      payload: { sceneId },
    });
    expect(resetResponse.statusCode).toBe(200);
    await expect(reset).resolves.toEqual({
      sceneId,
      stateVersion: resetResponse.json<{ snapshot: { stateVersion: number } }>().snapshot.stateVersion,
    });

    const closed = new Promise<number>((resolve) => socket.once('close', resolve));
    socket.close();
    await closed;
  });

  it('non invia action.applied a un display né a un DM di un’altra campagna', async () => {
    const otherCampaignId = await createCampaign(app, { name: 'Altra campagna' });
    const displayCode = await createDisplay(app, campaignId);
    const target = new WebSocket(
      dmSocketUrl(port, campaignId),
      { headers: { Origin: ALLOWED_ORIGIN } },
    );
    const otherDm = new WebSocket(
      dmSocketUrl(port, otherCampaignId),
      { headers: { Origin: ALLOWED_ORIGIN } },
    );
    const display = new WebSocket(
      `ws://127.0.0.1:${port}/ws?role=display&code=${displayCode}`,
      { headers: { Origin: ALLOWED_ORIGIN } },
    );
    await Promise.all([waitForHello(target), waitForHello(otherDm), waitForHello(display)]);

    const received = [collectActionTypes(target), collectActionTypes(otherDm), collectActionTypes(display)];
    const targetApplied = waitForActionApplied(target);
    await sendAction(app, campaignId, sceneId, {
      type: 'fog.apply',
      op: {
        id: 'op-isolation',
        op: 'reveal',
        shape: { type: 'rect', x: 30, y: 30, width: 40, height: 40 },
        softness: 0,
      },
    }, { clientId: 'realtime-test', expectStatus: 200 });
    await targetApplied;
    // Margine per un eventuale invio errato verso gli altri socket.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received[0]).toHaveLength(1);
    expect(received[1]).toHaveLength(0);
    expect(received[2]).toHaveLength(0);

    for (const socket of [target, otherDm, display]) {
      socket.close();
    }
  });
});
