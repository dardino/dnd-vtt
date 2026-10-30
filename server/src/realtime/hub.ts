import type { WebSocket } from 'ws';
import type { AppDatabase } from '../db/client.js';
import { getDisplayByCode } from '../db/displays.repository.js';
import { projectDisplay } from '../program/service.js';

interface RealtimeClient {
  socket: WebSocket;
  role: 'dm' | 'display';
  campaignId: string;
  code?: string;
}

const clients = new Set<RealtimeClient>();
let database: AppDatabase | null = null;

const envelope = (type: string, payload: unknown): string => JSON.stringify({
  v: 1,
  type,
  seq: Date.now(),
  at: new Date().toISOString(),
  payload,
});

export const initRealtime = (db: AppDatabase): void => {
  database = db;
};

export const registerRealtimeClient = (
  socket: WebSocket,
  role: 'dm' | 'display',
  campaignId: string,
  code?: string,
): void => {
  const client: RealtimeClient = { socket, role, campaignId, ...(code === undefined ? {} : { code }) };
  clients.add(client);
  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));
};

export const broadcastDisplays = (campaignId: string): void => {
  if (database === null) {
    return;
  }
  for (const client of clients) {
    if (client.role !== 'display' || client.campaignId !== campaignId || client.code === undefined) {
      continue;
    }
    const display = getDisplayByCode(database, client.code);
    if (display === null) {
      client.socket.close(4403, 'display revoked');
      clients.delete(client);
      continue;
    }
    if (client.socket.readyState !== 1) {
      continue;
    }
    try {
      const state = projectDisplay(database, display);
      client.socket.send(envelope('display.updated', { state }));
    } catch {
      // Un errore di proiezione non deve chiudere le altre console.
    }
  }
};

export const sendDisplayHello = (socket: WebSocket, code: string): boolean => {
  if (database === null) {
    return false;
  }
  const display = getDisplayByCode(database, code);
  if (display === null) {
    return false;
  }
  const state = projectDisplay(database, display);
  socket.send(envelope('hello', { role: 'display', display, state }));
  return true;
};

export const notifyDisplays = broadcastDisplays;
