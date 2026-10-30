import websocket from '@fastify/websocket';
import type { FastifyPluginAsync } from 'fastify';
import { requireDm } from '../auth/auth.js';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { getCampaign } from '../db/campaigns.repository.js';
import { getDisplayByCode } from '../db/displays.repository.js';
import { registerRealtimeClient, sendDisplayHello, sendDmHello } from './hub.js';

const envelope = (type: string, payload: unknown): string => JSON.stringify({
  v: 1,
  type,
  seq: Date.now(),
  at: new Date().toISOString(),
  payload,
});

const rawText = (raw: unknown): string => {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf8');
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw as Buffer[]).toString('utf8');
  }
  return Buffer.from(raw as ArrayBuffer).toString('utf8');
};

export const realtimeRoutes = (env: AppEnv, db: AppDatabase): FastifyPluginAsync => async (app) => {
  await app.register(websocket);
  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as Record<string, string | undefined>;
    const role = query['role'];
    const campaignId = query['campaignId'];
    const code = query['code'];
    if (role === 'display' && code !== undefined) {
      const display = getDisplayByCode(db, code);
      if (display === null) {
        socket.close(4403, 'display revoked');
        return;
      }
      registerRealtimeClient(socket, 'display', display.campaignId, code);
      if (!sendDisplayHello(socket, code)) {
        socket.close(4403, 'display unavailable');
        return;
      }
    } else if (role === 'dm' && campaignId !== undefined) {
      try {
        requireDm(request, env);
      } catch {
        socket.close(4401, 'unauthorized');
        return;
      }
      if (getCampaign(db, campaignId) === null) {
        socket.close(4403, 'campaign not found');
        return;
      }
      registerRealtimeClient(socket, 'dm', campaignId);
      sendDmHello(socket, campaignId);
    } else {
      socket.close(4401, 'invalid role');
      return;
    }
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(rawText(raw)) as { type?: string };
        if (message.type === 'ping') {
          socket.send(envelope('pong', {}));
        }
      } catch {
        socket.send(envelope('error', { code: 'invalid_message', message: 'Messaggio non valido' }));
      }
    });
  });
};
