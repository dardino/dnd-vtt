import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDefaultSceneState, type MonsterStatblock, type TokenState } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { closeTestApp, createTestApp } from './helpers.js';

const monster = (): MonsterStatblock => ({
  kind: 'monster',
  size: 'medium',
  abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 8 },
  hp: { current: 7, max: 7, temp: 0 },
  speed: { walk: 30 },
  senses: {},
  languages: ['common'],
  conditions: [],
  creatureType: 'goblinoid',
  cr: '1/4',
  tags: [],
  ac: 13,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  traits: [],
  actions: [],
  reactions: [],
});

const token = (id: string, label = 'Goblin'): TokenState => ({
  id,
  label,
  x: 1,
  y: 1,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
});

const createCampaign = async (app: FastifyInstance, name = 'La miniera perduta'): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

const createScene = async (app: FastifyInstance, campaignId: string): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/scenes`,
    payload: { name: 'Ingresso', widthPx: 1920, heightPx: 1080 },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

describe('avvio e health', () => {
  it('segnala migration_pending quando il database non è migrato', async () => {
    const testApp = await createTestApp({ DATABASE_PATH: ':memory:' });
    const raw = createDatabase(':memory:');
    const app = buildApp({ env: testApp.env, database: raw });
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().db).toBe('migration_pending');
    await app.close();
    raw.close();
    await closeTestApp(testApp);
  });

  it('risponde ok dopo le migrazioni', async () => {
    const testApp = await createTestApp();
    const response = await testApp.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.json()).toMatchObject({ status: 'ok', db: 'ok' });
    await closeTestApp(testApp);
  });
});

describe('autenticazione DM', () => {
  it('fida del loopback diretto senza password', async () => {
    const testApp = await createTestApp();
    const me = await testApp.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(me.json()).toEqual({ role: 'dm' });

    const list = await testApp.app.inject({ method: 'GET', url: '/api/v1/campaigns' });
    expect(list.statusCode).toBe(200);
    await closeTestApp(testApp);
  });

  it('non fida del loopback quando ci sono header di forwarding', async () => {
    const testApp = await createTestApp();
    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-forwarded-for': '10.0.0.8' },
    });
    expect(me.json()).toEqual({ role: 'none' });

    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { 'x-forwarded-for': '10.0.0.8' },
    });
    expect(list.statusCode).toBe(401);
    await closeTestApp(testApp);
  });

  it('rifiuta un Host non in allowlist con 421', async () => {
    const testApp = await createTestApp();
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { host: 'evil.example' },
    });
    expect(response.statusCode).toBe(421);
    expect(response.json().error.code).toBe('misdirected_request');
    await closeTestApp(testApp);
  });

  it('rifiuta una richiesta cross-origin di scrittura', async () => {
    const testApp = await createTestApp();
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { origin: 'http://evil.example' },
      payload: { name: 'Intrusa' },
    });
    expect(response.statusCode).toBe(403);
    await closeTestApp(testApp);
  });

  it('accetta la password e usa il cookie fuori dal loopback', async () => {
    const testApp = await createTestApp();
    const unauthorized = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      remoteAddress: '192.168.1.50',
    });
    expect(unauthorized.statusCode).toBe(401);

    const login = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/dm',
      remoteAddress: '192.168.1.50',
      payload: { password: 'correct-horse-battery' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0];
    expect(cookie?.name).toBe('dm_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');

    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: cookie?.value ?? '' },
    });
    expect(me.json()).toEqual({ role: 'dm' });
    await closeTestApp(testApp);
  });

  it('rifiuta la password errata e applica il rate limit', async () => {
    const testApp = await createTestApp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/dm',
        remoteAddress: '10.20.30.40',
        payload: { password: 'sbagliata' },
      });
      expect(response.statusCode).toBe(401);
    }
    const limited = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/dm',
      remoteAddress: '10.20.30.40',
      payload: { password: 'sbagliata' },
    });
    expect(limited.statusCode).toBe(429);
    await closeTestApp(testApp);
  });
});

describe('CRUD campagne, scene e attori', () => {
  it('crea, elenca, aggiorna ed elimina una campagna', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const id = await createCampaign(app);

    const get = await app.inject({ method: 'GET', url: `/api/v1/campaigns/${id}` });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ id, name: 'La miniera perduta', autoApprove: true });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${id}`,
      payload: { description: 'Una campagna di prova', advancementMode: 'xp' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ description: 'Una campagna di prova', advancementMode: 'xp' });

    const remove = await app.inject({ method: 'DELETE', url: `/api/v1/campaigns/${id}` });
    expect(remove.statusCode).toBe(204);
    const missing = await app.inject({ method: 'GET', url: `/api/v1/campaigns/${id}` });
    expect(missing.statusCode).toBe(404);
    await closeTestApp(testApp);
  });

  it('pagina con cursore opaco senza duplicati', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    for (const name of ['Alfa', 'Beta', 'Gamma']) {
      await createCampaign(app, name);
    }
    const first = await app.inject({ method: 'GET', url: '/api/v1/campaigns?limit=2' });
    const firstBody = first.json<{ items: { id: string }[]; nextCursor: string | null }>();
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).not.toBeNull();

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns?limit=2&cursor=${firstBody.nextCursor ?? ''}`,
    });
    const secondBody = second.json<{ items: { id: string }[]; nextCursor: string | null }>();
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.nextCursor).toBeNull();
    const ids = new Set([...firstBody.items, ...secondBody.items].map((item) => item.id));
    expect(ids.size).toBe(3);
    await closeTestApp(testApp);
  });

  it('crea una scena con stato di default e la rende attiva', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);

    const campaign = await app.inject({ method: 'GET', url: `/api/v1/campaigns/${campaignId}` });
    expect(campaign.json().activeSceneId).toBe(sceneId);

    const snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      scene: { id: sceneId, stateVersion: 1 },
      stateVersion: 1,
      state: createDefaultSceneState(),
    });
    await closeTestApp(testApp);
  });

  it('crea un mostro di campagna e non espone le note del giocatore', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/actors',
      payload: {
        campaignId,
        kind: 'monster',
        name: 'Goblin',
        statblock: monster(),
        dmNotes: 'Attacca dal buio',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ name: 'Goblin', kind: 'monster', dmNotes: 'Attacca dal buio' });
    expect(body).not.toHaveProperty('playerNotes');

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/actors?campaignId=${campaignId}&kind=monster&q=Gob`,
    });
    expect(list.json().items).toHaveLength(1);

    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/v1/actors',
      payload: { kind: 'npc', name: 'Sbagliato', statblock: monster() },
    });
    expect(mismatch.statusCode).toBe(400);
    await closeTestApp(testApp);
  });
});

describe('azioni e concorrenza', () => {
  it('applica due azioni concorrenti senza conflitti e converge', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);

    const send = (id: string, label: string) => app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload: {
        id: uuidv7(),
        clientId: id,
        sceneId,
        action: { type: 'token.add', token: token(id, label) },
      },
    });
    const [first, second] = await Promise.all([
      send('dm-a', 'Goblin A'),
      send('dm-b', 'Goblin B'),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    const body = snapshot.json<{ stateVersion: number; state: { tokens: TokenState[] } }>();
    expect(body.stateVersion).toBe(3);
    expect(body.state.tokens.map((entry) => entry.label).sort()).toEqual(['Goblin A', 'Goblin B']);
    await closeTestApp(testApp);
  });

  it('è idempotente per id e conserva l inverso', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);
    const id = uuidv7();
    const payload = {
      id,
      clientId: 'console-1',
      sceneId,
      action: { type: 'token.add' as const, token: token('goblin-1') },
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload,
    });
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({
      stateVersion: 2,
      inverse: { type: 'token.remove', tokenId: 'goblin-1' },
      label: 'Token aggiunto: Goblin',
    });

    const log = await app.inject({ method: 'GET', url: `/api/v1/campaigns/${campaignId}/actions` });
    expect(log.json().items).toHaveLength(1);
    await closeTestApp(testApp);
  });

  it('conserva solo le ultime 50 azioni', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);
    for (let index = 0; index < 55; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/actions`,
        payload: {
          id: uuidv7(),
          clientId: 'console-1',
          sceneId,
          action: { type: 'token.move', tokenId: 'missing', x: index, y: index },
        },
      });
      expect(response.statusCode).toBe(409);
    }
    const withToken = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload: {
        id: uuidv7(),
        clientId: 'console-1',
        sceneId,
        action: { type: 'token.add', token: token('goblin-1') },
      },
    });
    expect(withToken.statusCode).toBe(200);
    for (let index = 0; index < 55; index += 1) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/actions`,
        payload: {
          id: uuidv7(),
          clientId: 'console-1',
          sceneId,
          action: { type: 'token.move', tokenId: 'goblin-1', x: index, y: index },
        },
      });
    }
    const log = await app.inject({ method: 'GET', url: `/api/v1/campaigns/${campaignId}/actions` });
    expect(log.json().items).toHaveLength(50);
    await closeTestApp(testApp);
  });

  it('applica hp, condizioni e griglia e li riallinea dal log', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);
    const send = (action: object) => app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload: { id: uuidv7(), clientId: 'console-1', sceneId, action },
    });

    expect((await send({ type: 'token.add', token: token('goblin-1') })).statusCode).toBe(200);
    const damaged = await send({ type: 'token.hp', tokenId: 'goblin-1', delta: -3 });
    expect(damaged.statusCode).toBe(200);
    const conditioned = await send({
      type: 'token.condition',
      tokenId: 'goblin-1',
      op: 'add',
      condition: { name: 'prone' },
    });
    expect(conditioned.statusCode).toBe(200);
    const hex = await send({
      type: 'grid.update',
      grid: { ...createDefaultSceneState().grid, type: 'hex', cellSizePx: 64 },
    });
    expect(hex.statusCode).toBe(200);

    const snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    const state = snapshot.json<{ state: { grid: { type: string }; tokens: TokenState[] } }>().state;
    expect(state.grid).toMatchObject({ type: 'hex', cellSizePx: 64 });
    expect(state.tokens[0]?.hp.current).toBe(4);
    expect(state.tokens[0]?.conditions).toEqual([{ name: 'prone' }]);

    const sync = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/actions?sinceVersion=2&sceneId=${sceneId}`,
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().items.map((entry: { type: string }) => entry.type)).toEqual([
      'token.hp',
      'token.condition',
      'grid.update',
    ]);
    await closeTestApp(testApp);
  });
});

describe('recovery dello stato', () => {
  it('rifiuta uno stateVersion stale con 409 e accetta quello corrente', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actions`,
      payload: {
        id: uuidv7(),
        clientId: 'console-1',
        sceneId,
        action: { type: 'token.add', token: token('goblin-1') },
      },
    });
    expect(first.statusCode).toBe(200);
    const snapshot = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
    const body = snapshot.json<{ state: unknown; stateVersion: number }>();

    const stale = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenes/${sceneId}/state`,
      payload: { stateVersion: 1, state: body.state },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('state_conflict');

    const current = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenes/${sceneId}/state`,
      payload: { stateVersion: body.stateVersion, state: body.state },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().stateVersion).toBe(body.stateVersion + 1);
    await closeTestApp(testApp);
  });

  it('rifiuta uno stato oltre il limite come payload_too_large', async () => {
    const testApp = await createTestApp({ MAX_JSON_MB: '0.001' });
    const app = testApp.app;
    const campaignId = await createCampaign(app);
    const sceneId = await createScene(app, campaignId);
    const state = createDefaultSceneState();
    state.tokens.push(token('goblin-1', 'x'.repeat(3000)));
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/scenes/${sceneId}/state`,
      payload: { stateVersion: 1, state },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('payload_too_large');
    await closeTestApp(testApp);
  });
});

describe('upload asset', () => {
  it('salva originale, WebP e thumb e serve il file con cache immutabile', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const png = await sharp({
      create: { width: 16, height: 12, channels: 3, background: '#ff5500' },
    }).png().toBuffer();
    const boundary = '----dnd-vtt-test';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="mappa.png"\r\n`
        + 'Content-Type: image/png\r\n\r\n',
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(upload.statusCode).toBe(201);
    const asset = upload.json<{
      id: string;
      hash: string;
      url: string;
      thumbUrl: string;
      width: number;
    }>();
    expect(asset.width).toBe(16);
    expect(asset.url).toMatch(/^\/uploads\/webp\/[a-f0-9]{64}\.webp$/);

    const served = await app.inject({ method: 'GET', url: asset.url });
    expect(served.statusCode).toBe(200);
    expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(served.headers['content-type']).toBe('image/webp');

    const thumb = await app.inject({ method: 'GET', url: asset.thumbUrl });
    expect(thumb.statusCode).toBe(200);

    const original = await app.inject({
      method: 'GET',
      url: `/uploads/originals/${asset.hash}.png`,
    });
    expect(original.statusCode).toBe(404);
    await closeTestApp(testApp);
  });

  it('genera preview e piramide di tile per una mappa grande', async () => {
    const testApp = await createTestApp();
    const app = testApp.app;
    const png = await sharp({
      create: { width: 2600, height: 400, channels: 3, background: '#224466' },
    }).png().toBuffer();
    const boundary = '----dnd-vtt-tiles';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="mappa.png"\r\n`
        + 'Content-Type: image/png\r\n\r\n',
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(upload.statusCode).toBe(201);
    const asset = upload.json<{ hash: string; previewUrl: string; width: number }>();
    expect(asset.width).toBe(2600);

    const preview = await app.inject({ method: 'GET', url: asset.previewUrl });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toBe('image/webp');

    const tile = await app.inject({
      method: 'GET',
      url: `/uploads/tiles/${asset.hash}/0/0_0.webp`,
    });
    expect(tile.statusCode).toBe(200);
    const lastLevel = await app.inject({
      method: 'GET',
      url: `/uploads/tiles/${asset.hash}/3/0_0.webp`,
    });
    expect(lastLevel.statusCode).toBe(200);
    await closeTestApp(testApp);
  });

  it('rifiuta un file che non è un immagine', async () => {
    const testApp = await createTestApp();
    const boundary = '----dnd-vtt-test';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="nota.svg"\r\n`
        + 'Content-Type: image/svg+xml\r\n\r\n',
      ),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/assets',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(upload.statusCode).toBe(415);
    await closeTestApp(testApp);
  });
});

describe('snapshot con ETag', () => {
  it('risponde 304 se lo stateVersion non cambia', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const sceneId = await createScene(testApp.app, campaignId);
    const first = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/scenes/${sceneId}/snapshot`,
    });
    const etag = first.headers.etag;
    expect(etag).toBe('"scene-1"');
    const second = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/scenes/${sceneId}/snapshot`,
      headers: { 'if-none-match': etag ?? '' },
    });
    expect(second.statusCode).toBe(304);
    const forced = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/scenes/${sceneId}/snapshot?force=true`,
      headers: { 'if-none-match': etag ?? '' },
    });
    expect(forced.statusCode).toBe(200);
    await closeTestApp(testApp);
  });
});
