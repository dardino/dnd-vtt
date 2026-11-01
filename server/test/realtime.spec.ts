import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import WebSocket from 'ws';
import type { RawData } from 'ws';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';

const ALLOWED_ORIGIN = 'http://localhost:4200';

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

const createCampaign = async (app: FastifyInstance): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    payload: { name: 'Realtime' },
  });
  return response.json<{ id: string }>().id;
};

const createDisplay = async (app: FastifyInstance, campaignId: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/displays`,
    payload: {},
  });
  return response.json<{ code: string }>().code;
};

const wsUrl = (port: number, query: string): string =>
  `ws://127.0.0.1:${port}/ws?${query}`;

/** Attende l'esito del handshake HTTP: 101 = accettato, altrimenti lo status. */
const rejectedStatus = (
  url: string,
  headers: Record<string, string> = {},
): Promise<number> => new Promise((resolve, reject) => {
  const socket = new WebSocket(url, { headers });
  let settled = false;
  const settle = (action: () => void): void => {
    if (!settled) {
      settled = true;
      action();
    }
  };
  socket.once('unexpected-response', (_request, response) => {
    response.resume();
    settle(() => {
      socket.terminate();
      resolve(response.statusCode ?? 0);
    });
  });
  socket.once('open', () => {
    settle(() => {
      socket.close();
      reject(new Error('connessione accettata inaspettatamente'));
    });
  });
  socket.once('error', (error) => {
    settle(() => reject(error));
  });
});

const connect = (
  url: string,
  headers: Record<string, string> = {},
): Promise<WebSocket> => new Promise((resolve, reject) => {
  const socket = new WebSocket(url, { headers });
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const firstMessageType = (socket: WebSocket): Promise<string> =>
  new Promise((resolve, reject) => {
    socket.once('message', (raw) => {
      resolve((JSON.parse(rawText(raw)) as { type: string }).type);
    });
    socket.once('error', reject);
  });

const closeCode = (socket: WebSocket): Promise<number> =>
  new Promise((resolve) => {
    socket.once('close', (code) => resolve(code));
  });

describe('realtime: origine e rate limit', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let port: number;
  let displayCode: string;
  let campaignId: string;

  beforeAll(async () => {
    testApp = await createTestApp({ LOG_LEVEL: 'error' });
    app = testApp.app;
    campaignId = await createCampaign(app);
    displayCode = await createDisplay(app, campaignId);
    port = await listen(app);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('accetta un display con Origin consentito', async () => {
    // Il listener va agganciato subito: il server invia `hello` appena
    // completa l'upgrade, prima che il test possa attendere `open`.
    const socket = new WebSocket(
      wsUrl(port, `role=display&code=${displayCode}`),
      { headers: { Origin: ALLOWED_ORIGIN } },
    );
    await expect(firstMessageType(socket)).resolves.toBe('hello');
    const closed = closeCode(socket);
    socket.close();
    await closed;
  });

  it('rifiuta un display con Origin esterno', async () => {
    const status = await rejectedStatus(
      wsUrl(port, `role=display&code=${displayCode}`),
      { Origin: 'http://evil.example' },
    );
    expect(status).toBe(403);
  });

  it('rifiuta il WebSocket DM senza Origin', async () => {
    const status = await rejectedStatus(
      wsUrl(port, `role=dm&campaignId=${campaignId}`),
    );
    expect(status).toBe(403);
  });

  it('rifiuta il WebSocket DM con Origin esterno', async () => {
    const status = await rejectedStatus(
      wsUrl(port, `role=dm&campaignId=${uuidv7()}`),
      { Origin: 'http://evil.example' },
    );
    expect(status).toBe(403);
  });
});

describe('realtime: limite tentativi', () => {
  let app: FastifyInstance;
  let testApp: TestApp;
  let port: number;
  let displayCode: string;

  beforeAll(async () => {
    testApp = await createTestApp({ LOG_LEVEL: 'error', WS_RATE_LIMIT_MAX: '1' });
    app = testApp.app;
    const campaignId = await createCampaign(app);
    displayCode = await createDisplay(app, campaignId);
    port = await listen(app);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('accetta il primo upgrade e blocca il successivo con 429', async () => {
    const first = await connect(
      wsUrl(port, 'role=display&code=000000'),
      { Origin: ALLOWED_ORIGIN },
    );
    await expect(closeCode(first)).resolves.toBe(4403);

    const status = await rejectedStatus(
      wsUrl(port, 'role=display&code=000000'),
      { Origin: ALLOWED_ORIGIN },
    );
    expect(status).toBe(429);
    expect(displayCode).not.toBe('000000');
  });
});
