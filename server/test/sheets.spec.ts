import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign, fighterBuild } from './factories.js';

const SHARED_KEYS = ['actor', 'statblock', 'derived', 'inventory', 'sheetVersion', 'campaign'];

describe('viste scheda DM e giocatore', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('condivide la base e separa note, editing e approvazione per ruolo', async () => {
    const campaignName = 'La miniera perduta';
    const campaignId = await createCampaign(app, { name: campaignName });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actors`,
      payload: {
        name: 'Eroe di prova',
        playerNotes: 'Nota privata del giocatore',
        dmNotes: 'Nota privata del master',
        build: fighterBuild(4),
      },
    });
    expect(created.statusCode).toBe(201);
    const actorId = created.json<{ id: string }>().id;

    const dmResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/actors/${actorId}/sheet`,
    });
    expect(dmResponse.statusCode).toBe(200);
    const dm = dmResponse.json<Record<string, unknown>>();
    for (const key of SHARED_KEYS) {
      expect(dm).toHaveProperty(key);
    }
    expect(dm).toMatchObject({
      dmNotes: 'Nota privata del master',
      sheetVersion: 1,
      campaign: { id: campaignId, name: campaignName },
      actor: { id: actorId, dmNotes: 'Nota privata del master' },
    });
    expect(dm.actor).not.toHaveProperty('playerNotes');
    expect(dm.derived).not.toBeNull();
    expect(dm.inventory).not.toHaveLength(0);

    const linkResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/actors/${actorId}/player-link`,
    });
    expect(linkResponse.statusCode).toBe(201);
    const { token } = linkResponse.json<{ token: string }>();

    const playerResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/play/${token}/sheet`,
    });
    expect(playerResponse.statusCode).toBe(200);
    const player = playerResponse.json<Record<string, unknown>>();
    for (const key of SHARED_KEYS) {
      expect(player).toHaveProperty(key);
    }
    expect(player).toMatchObject({
      playerNotes: 'Nota privata del giocatore',
      editingEnabled: true,
      autoApprove: true,
      campaign: { id: campaignId, name: campaignName },
    });
    expect(player.editable).toEqual(expect.arrayContaining(['hp', 'playerNotes']));
    expect(player).not.toHaveProperty('dmNotes');
    expect(player.actor).not.toHaveProperty('dmNotes');

    expect(player.statblock).toEqual(dm.statblock);
    expect(player.derived).toEqual(dm.derived);
    expect(player.inventory).toEqual(dm.inventory);
    expect(player.sheetVersion).toBe(dm.sheetVersion);
    expect(player.campaign).toEqual(dm.campaign);
  });
});
