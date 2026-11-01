import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  createCampaignSchema,
  diceRollRequestSchema,
} from '@dnd-vtt/shared';
import { buildApp } from '../src/app.js';
import { RollStats } from '../src/actors/roll-stats.js';
import { insertCampaign } from '../src/db/campaigns.repository.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrations.js';
import { DiceService } from '../src/dice/service.js';
import { RealtimeHub } from '../src/realtime/hub.js';
import { closeTestApp, createTestApp, createTestEnv } from './helpers.js';

interface FakeSocket {
  socket: WebSocket;
  sent: string[];
  closed: Array<{ code: number | undefined; reason: string | undefined }>;
}

const createFakeSocket = (): FakeSocket => {
  const sent: string[] = [];
  const closed: Array<{ code: number | undefined; reason: string | undefined }> = [];
  const fake = {
    readyState: 1,
    send: (data: string): void => {
      sent.push(data);
    },
    close: (code?: number, reason?: string): void => {
      closed.push({ code, reason });
    },
    on: (_event: string, _handler: () => void): void => {
      // I listener non vengono invocati direttamente dagli hub nei test.
    },
  };
  return { socket: fake as unknown as WebSocket, sent, closed };
};

const createCampaign = async (app: FastifyInstance): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    payload: { name: 'Isolamento' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

describe('RollStats', () => {
  it('non condivide i tiri tra due istanze', () => {
    const first = new RollStats();
    const second = new RollStats();

    const roll = first.rollAbilityScores();
    expect(roll.values).toHaveLength(6);
    expect(first.resolveRoll(roll.rollId)).toEqual(roll.values);
    expect(second.resolveRoll(roll.rollId)).toBeNull();

    first.dispose();
    expect(first.resolveRoll(roll.rollId)).toBeNull();
  });
});

describe('DiceService', () => {
  it('isola la cache di idempotenza tra due istanze', () => {
    const database = createDatabase(':memory:');
    const env = createTestEnv();
    try {
      runMigrations(database, env.migrationsDir);
      const campaign = insertCampaign(database.db, createCampaignSchema.parse({ name: 'Dadi' }));
      const request = diceRollRequestSchema.parse({ formula: '1d20', requestId: 'req-1' });
      const first = new DiceService(database.db);
      const second = new DiceService(database.db);

      const roll = first.rollForDm(campaign.id, request);
      expect(first.rollForDm(campaign.id, request).id).toBe(roll.id);

      const isolated = second.rollForDm(campaign.id, request);
      expect(isolated.id).not.toBe(roll.id);

      first.dispose();
      expect(first.rollForDm(campaign.id, request).id).not.toBe(roll.id);
    } finally {
      database.close();
    }
  });
});

describe('RealtimeHub', () => {
  it('isola client e broadcast tra due istanze', () => {
    const database = createDatabase(':memory:');
    try {
      const first = new RealtimeHub(database.db);
      const second = new RealtimeHub(database.db);
      const display = createFakeSocket();
      first.registerClient(display.socket, 'display', 'campaign-1', 'ABC123');
      expect([...first.onlineDisplayCodes('campaign-1')]).toEqual(['ABC123']);
      expect(second.onlineDisplayCodes('campaign-1').size).toBe(0);

      const dm = createFakeSocket();
      first.registerClient(dm.socket, 'dm', 'campaign-1');
      second.broadcastPresence('campaign-1');
      expect(dm.sent).toHaveLength(0);

      first.broadcastPresence('campaign-1');
      expect(dm.sent).toHaveLength(1);
      expect(JSON.parse(dm.sent[0] ?? '{}')).toMatchObject({
        type: 'presence.updated',
        payload: { displays: 1 },
      });

      first.close();
      expect(first.onlineDisplayCodes('campaign-1').size).toBe(0);
      expect(display.closed).toEqual([{ code: 1001, reason: 'server shutting down' }]);
    } finally {
      database.close();
    }
  });
});

describe('due buildApp nello stesso processo', () => {
  it('non condividono la cache di idempotenza e il cleanup resta isolato', async () => {
    const primary = await createTestApp();
    const secondary = buildApp({ env: primary.env, database: primary.database });
    await secondary.ready();
    let secondaryClosed = false;
    try {
      const campaignId = await createCampaign(primary.app);
      const payload = { formula: '1d20', requestId: 'shared-request' };
      const first = await primary.app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/rolls`,
        payload,
      });
      const second = await secondary.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/rolls`,
        payload,
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const firstRoll = first.json<{ id: string }>();
      const secondRoll = second.json<{ id: string }>();
      expect(secondRoll.id).not.toBe(firstRoll.id);

      await secondary.close();
      secondaryClosed = true;
      const again = await primary.app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/rolls`,
        payload,
      });
      expect(again.json<{ id: string }>().id).toBe(firstRoll.id);
    } finally {
      if (!secondaryClosed) {
        await secondary.close();
      }
      await closeTestApp(primary);
    }
  });
});
