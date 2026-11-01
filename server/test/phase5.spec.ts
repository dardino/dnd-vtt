import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign, createPc, createScene, sendAction } from './factories.js';

describe('fase 5: dadi, iniziativa, HP, riposi e level-up', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('esegue tiri server-side, li elenca e deduplica requestId', async () => {
    const campaignId = await createCampaign(app, { name: 'Fase 5' });
    const requestId = uuidv7();
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      payload: { formula: '1d20+5', mode: 'advantage', visibility: 'public', requestId },
    });
    expect(first.statusCode).toBe(201);
    const roll = first.json();
    expect(roll.total).toBeGreaterThanOrEqual(6);
    expect(roll.dice).toHaveLength(2);

    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      payload: { formula: '1d20+5', mode: 'advantage', visibility: 'public', requestId },
    });
    expect(retry.json().id).toBe(roll.id);

    const list = await app.inject({ method: 'GET', url: `/api/v1/campaigns/${campaignId}/rolls` });
    expect(list.json().items).toHaveLength(1);

    const dmOnly = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/rolls?visibility=dm`,
    });
    expect(dmOnly.json().items).toHaveLength(0);

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      payload: { formula: 'd20' },
    });
    expect(invalid.statusCode).toBe(422);
  });

  it('gestisce iniziativa, danni specchiati sull attore e undo/redo', async () => {
    const campaignId = await createCampaign(app, { name: 'Fase 5' });
    const actor = await createPc(app, campaignId, { name: 'Sir Fase 5' });
    const sceneId = await createScene(app, campaignId, { name: 'Arena', widthPx: 1000, heightPx: 1000 });
    const added = await sendAction(app, campaignId, sceneId, {
      type: 'token.add',
      token: {
        id: uuidv7(),
        actorId: actor.id,
        label: 'Sir Fase 5',
        x: 1,
        y: 1,
        size: 1,
        rotation: 0,
        elevation: 0,
        hp: { current: actor.hp.max, max: actor.hp.max, temp: 0 },
        conditions: [],
        visible: true,
      },
    });
    expect(added.statusCode).toBe(200);
    const tokenId = (await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` }))
      .json().state.tokens[0].id;

    const entries = [{
      id: 'entry-1', tokenId, label: 'Sir Fase 5', value: 18, tiebreak: 2, hidden: false, defeated: false,
    }];
    await sendAction(app, campaignId, sceneId, {
      type: 'initiative.set',
      initiative: { active: true, round: 1, turnIndex: 0, entries },
    });
    const next = await sendAction(app, campaignId, sceneId, { type: 'initiative.next' });
    expect(next.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` }))
      .json().state.initiative).toMatchObject({ active: true, round: 2, turnIndex: 0 });

    const damaged = await sendAction(app, campaignId, sceneId, { type: 'token.hp', tokenId, delta: -5 });
    expect(damaged.statusCode).toBe(200);
    let sheet = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    expect(sheet.json().statblock.hp.current).toBe(actor.hp.max - 5);

    const undone = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions/undo`,
      payload: { entryId: damaged.body.id },
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json().snapshot.state.tokens[0].hp.current).toBe(actor.hp.max);
    sheet = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    expect(sheet.json().statblock.hp.current).toBe(actor.hp.max);

    const redone = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions/redo`,
    });
    expect(redone.statusCode).toBe(200);
    expect(redone.json().snapshot.state.tokens[0].hp.current).toBe(actor.hp.max - 5);
  });

  it('applica riposi brevi e lunghi agli attori e ai token', async () => {
    const campaignId = await createCampaign(app, { name: 'Fase 5' });
    const actor = await createPc(app, campaignId, { name: 'Sir Fase 5' });
    const sceneId = await createScene(app, campaignId, { name: 'Arena', widthPx: 1000, heightPx: 1000 });
    const token = {
      id: uuidv7(),
      actorId: actor.id,
      label: 'Sir Fase 5',
      x: 1,
      y: 1,
      size: 1,
      rotation: 0,
      elevation: 0,
      hp: { current: actor.hp.max - 10, max: actor.hp.max, temp: 3 },
      conditions: [{ name: 'exhaustion' as const, level: 2 }],
      visible: true,
    };
    await sendAction(app, campaignId, sceneId, { type: 'token.add', token });
    const sheet = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/actors/${actor.id}/sheet`,
      payload: {
        sheetVersion: sheet.json().sheetVersion,
        patch: {
          resources: [{ id: 'short', name: 'Slancio', max: 2, used: 2, recharge: 'short' }],
          hitDice: { die: 10, total: 4, used: 2 },
        },
      },
    });

    const shortRest = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rests`,
      payload: { type: 'short', actorIds: [actor.id] },
    });
    expect(shortRest.statusCode).toBe(200);
    let current = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    expect(current.json().statblock.hp.current).toBe(actor.hp.max - 10);
    expect(current.json().statblock.resources[0].used).toBe(0);
    expect(current.json().statblock.hitDice.used).toBe(2);

    const longRest = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rests`,
      payload: { type: 'long', actorIds: [actor.id] },
    });
    expect(longRest.statusCode).toBe(200);
    current = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    expect(current.json().statblock.hp).toEqual({
      current: actor.hp.max,
      max: actor.hp.max,
      temp: 3,
    });
    expect(current.json().statblock.hitDice.used).toBe(0);
    expect(current.json().statblock.conditions).toEqual([{ name: 'exhaustion', level: 1 }]);
    const snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.json().state.tokens[0].hp.current).toBe(actor.hp.max);
  });

  it('registra la sync dei token come azione annullabile', async () => {
    const campaignId = await createCampaign(app, { name: 'Fase 5' });
    const actor = await createPc(app, campaignId, { name: 'Sir Fase 5' });
    const sceneId = await createScene(app, campaignId, { name: 'Arena', widthPx: 1000, heightPx: 1000 });
    const tokenId = uuidv7();
    const added = await sendAction(app, campaignId, sceneId, {
      type: 'token.add',
      token: {
        id: tokenId,
        actorId: actor.id,
        label: 'Sir Fase 5',
        x: 1,
        y: 1,
        size: 1,
        rotation: 0,
        elevation: 0,
        hp: { current: actor.hp.max, max: actor.hp.max, temp: 0 },
        conditions: [],
        visible: true,
      },
    });
    expect(added.statusCode).toBe(200);

    const sheet = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/actors/${actor.id}/sheet`,
      payload: {
        sheetVersion: sheet.json().sheetVersion,
        patch: {
          hp: { current: actor.hp.max - 7, max: actor.hp.max, temp: 0 },
          conditions: [{ name: 'poisoned' }],
        },
      },
    });
    expect(patched.statusCode).toBe(200);

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/actions`,
    });
    const syncEntry = history.json<{
      items: { id: string; type: string; clientId: string; origin: string; actorId: string | null }[];
    }>().items.find((entry) => entry.type === 'token.update' && entry.clientId === 'token-sync');
    expect(syncEntry).toMatchObject({ origin: 'dm', actorId: actor.id });

    let snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.json().state.tokens[0]).toMatchObject({
      id: tokenId,
      hp: { current: actor.hp.max - 7 },
      conditions: [{ name: 'poisoned' }],
    });

    const undone = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions/undo`,
      payload: { entryId: syncEntry?.id },
    });
    expect(undone.statusCode).toBe(200);
    snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.json().state.tokens[0]).toMatchObject({
      id: tokenId,
      hp: { current: actor.hp.max },
      conditions: [],
    });
    const restored = await app.inject({ method: 'GET', url: `/api/v1/actors/${actor.id}/sheet` });
    expect(restored.json().statblock.hp.current).toBe(actor.hp.max);
    expect(restored.json().statblock.conditions).toEqual([]);
  });

  it('sale di livello con anteprima e aggiorna la scheda', async () => {
    const campaignId = await createCampaign(app, { name: 'Fase 5' });
    const actor = await createPc(app, campaignId, { name: 'Sir Fase 5' });
    const preview = await app.inject({
      method: 'POST',
      url: `/api/v1/actors/${actor.id}/level-up/preview`,
      payload: { hpMethod: 'average' },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ level: 5, hpGain: 9 });

    const applied = await app.inject({
      method: 'POST',
      url: `/api/v1/actors/${actor.id}/level-up`,
      payload: { hpMethod: 'average' },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().sheet.statblock.class.level).toBe(5);
    expect(applied.json().sheet.statblock.hp.max).toBe(actor.hp.max + 9);
    expect(applied.json().sheet.statblock.hitDice.total).toBe(5);
  });

  it('in milestone allinea gli XP e in modalità xp richiede la soglia', async () => {
    const milestone = await createCampaign(app, { name: 'Fase 5' });
    const milestoneActor = await createPc(app, milestone, { name: 'Sir Fase 5' });
    const milestoneUp = await app.inject({
      method: 'POST',
      url: `/api/v1/actors/${milestoneActor.id}/level-up`,
      payload: { hpMethod: 'average' },
    });
    expect(milestoneUp.statusCode).toBe(200);
    expect(milestoneUp.json().sheet.actor.xp).toBe(6500);

    const xpCampaignId = await createCampaign(app, { name: 'Fase 5 XP', advancementMode: 'xp' });
    const xpActor = await createPc(app, xpCampaignId, { name: 'Sir Fase 5' });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/actors/${xpActor.id}/level-up`,
      payload: { hpMethod: 'average' },
    });
    expect(blocked.statusCode).toBe(422);

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/actors/${xpActor.id}`,
      payload: { xp: 6500 },
    });
    const allowed = await app.inject({
      method: 'POST',
      url: `/api/v1/actors/${xpActor.id}/level-up`,
      payload: { hpMethod: 'average' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().sheet.actor.xp).toBe(6500);
  });

  it('esporta e reimporta gli XP del personaggio in una nuova campagna', async () => {
    const campaignId = await createCampaign(app, { name: 'Fase 5' });
    const actor = await createPc(app, campaignId, { name: 'Sir Fase 5' });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/actors/${actor.id}`,
      payload: { xp: 1234 },
    });

    const exported = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/export?includePrivateNotes=true`,
    });
    expect(exported.statusCode).toBe(200);
    const bundle = exported.json();

    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns/import',
      payload: bundle,
    });
    expect(imported.statusCode).toBe(201);
    const importedCampaignId = imported.json<{ campaign: { id: string } }>().campaign.id;

    const actors = await app.inject({
      method: 'GET',
      url: `/api/v1/actors?campaignId=${importedCampaignId}&limit=200`,
    });
    expect(actors.statusCode).toBe(200);
    expect(actors.json().items.some((entry: { xp: number }) => entry.xp === 1234)).toBe(true);
  });
});
