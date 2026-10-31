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

const displayCount = (campaignId: string): number => {
  let count = 0;
  for (const client of clients) {
    if (client.role === 'display' && client.campaignId === campaignId) {
      count += 1;
    }
  }
  return count;
};

export const broadcastPresence = (campaignId: string): void => {
  const displays = displayCount(campaignId);
  for (const client of clients) {
    if (client.role !== 'dm' || client.campaignId !== campaignId) {
      continue;
    }
    if (client.socket.readyState !== 1) {
      continue;
    }
    client.socket.send(envelope('presence.updated', { displays }));
  }
};

const removeClient = (client: RealtimeClient): void => {
  if (clients.delete(client) && client.role === 'display') {
    broadcastPresence(client.campaignId);
  }
};

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
  socket.on('close', () => removeClient(client));
  socket.on('error', () => removeClient(client));
  if (role === 'display') {
    broadcastPresence(campaignId);
  }
};

export const sendDmHello = (socket: WebSocket, campaignId: string): void => {
  socket.send(envelope('hello', {
    role: 'dm',
    campaignId,
    displays: displayCount(campaignId),
  }));
};

export const onlineDisplayCodes = (campaignId: string): Set<string> => {
  const codes = new Set<string>();
  for (const client of clients) {
    if (client.role === 'display' && client.campaignId === campaignId && client.code !== undefined) {
      codes.add(client.code);
    }
  }
  return codes;
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
      removeClient(client);
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
