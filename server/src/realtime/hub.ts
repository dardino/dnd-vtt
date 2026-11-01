import type { WebSocket } from 'ws';
import type { AppDatabase } from '../db/client.js';
import { getDisplayByCode } from '../db/displays.repository.js';
import { projectDisplay } from '../program/service.js';
import { envelope } from './protocol.js';

interface RealtimeClient {
  socket: WebSocket;
  role: 'dm' | 'display';
  campaignId: string;
  code?: string;
}

export class RealtimeHub {
  private readonly clients = new Set<RealtimeClient>();
  private readonly db: AppDatabase;

  constructor(db: AppDatabase) {
    this.db = db;
  }

  private displayCount(campaignId: string): number {
    let count = 0;
    for (const client of this.clients) {
      if (client.role === 'display' && client.campaignId === campaignId) {
        count += 1;
      }
    }
    return count;
  }

  broadcastPresence(campaignId: string): void {
    const displays = this.displayCount(campaignId);
    for (const client of this.clients) {
      if (client.role !== 'dm' || client.campaignId !== campaignId) {
        continue;
      }
      if (client.socket.readyState !== 1) {
        continue;
      }
      client.socket.send(envelope('presence.updated', { displays }));
    }
  }

  /** Notifica le azioni applicate alle sole console DM della campagna (A1). */
  broadcastAction(campaignId: string, payload: unknown): void {
    const message = envelope('action.applied', payload);
    for (const client of this.clients) {
      if (client.role !== 'dm' || client.campaignId !== campaignId) {
        continue;
      }
      if (client.socket.readyState !== 1) {
        continue;
      }
      client.socket.send(message);
    }
  }

  private removeClient(client: RealtimeClient): void {
    if (this.clients.delete(client) && client.role === 'display') {
      this.broadcastPresence(client.campaignId);
    }
  }

  registerClient(
    socket: WebSocket,
    role: 'dm' | 'display',
    campaignId: string,
    code?: string,
  ): void {
    const client: RealtimeClient = { socket, role, campaignId, ...(code === undefined ? {} : { code }) };
    this.clients.add(client);
    socket.on('close', () => this.removeClient(client));
    socket.on('error', () => this.removeClient(client));
    if (role === 'display') {
      this.broadcastPresence(campaignId);
    }
  }

  sendDmHello(socket: WebSocket, campaignId: string): void {
    socket.send(envelope('hello', {
      role: 'dm',
      campaignId,
      displays: this.displayCount(campaignId),
    }));
  }

  onlineDisplayCodes(campaignId: string): Set<string> {
    const codes = new Set<string>();
    for (const client of this.clients) {
      if (client.role === 'display' && client.campaignId === campaignId && client.code !== undefined) {
        codes.add(client.code);
      }
    }
    return codes;
  }

  broadcastDisplays(campaignId: string): void {
    for (const client of this.clients) {
      if (client.role !== 'display' || client.campaignId !== campaignId || client.code === undefined) {
        continue;
      }
      const display = getDisplayByCode(this.db, client.code);
      if (display === null) {
        client.socket.close(4403, 'display revoked');
        this.removeClient(client);
        continue;
      }
      if (client.socket.readyState !== 1) {
        continue;
      }
      try {
        const state = projectDisplay(this.db, display);
        client.socket.send(envelope('display.updated', { state }));
      } catch {
        // Un errore di proiezione non deve chiudere le altre console.
      }
    }
  }

  sendDisplayHello(socket: WebSocket, code: string): boolean {
    const display = getDisplayByCode(this.db, code);
    if (display === null) {
      return false;
    }
    const state = projectDisplay(this.db, display);
    socket.send(envelope('hello', { role: 'display', display, state }));
    return true;
  }

  close(): void {
    for (const client of this.clients) {
      if (client.socket.readyState === 1) {
        client.socket.close(1001, 'server shutting down');
      }
    }
    this.clients.clear();
  }
}
