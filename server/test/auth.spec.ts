import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  createSessionToken,
  decodeSessionToken,
  verifyDmPassword,
  verifySessionToken,
  passwordHashMatches,
  passwordMatches,
} from '../src/auth/auth.js';
import { createEnv, parseScryptPasswordHash } from '../src/config/env.js';
import { getAuthSession, revokeAuthSession } from '../src/db/auth-sessions.repository.js';
import { closeTestApp, createTestApp, createTestEnv, type TestApp } from './helpers.js';

const VALID_HASH = 'scrypt$BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=$'
  + '7xz8PiBhjHMsfWzy+b1INs+QhZTfyCx6R+c0FmNafORuV04wf2/YuBlpbl4Jl0xPFkVSNpcFpiKJuIY8k3K6zA==';
const PASSWORD = 'correct-horse-battery';

describe('hash password DM', () => {
  it('riconosce il formato scrypt e i byte decodificati', () => {
    const parsed = parseScryptPasswordHash(VALID_HASH);
    expect(parsed?.salt).toHaveLength(32);
    expect(parsed?.hash).toHaveLength(64);
  });

  it('accetta la password corretta e rifiuta quella errata', async () => {
    await expect(passwordHashMatches(VALID_HASH, PASSWORD)).resolves.toBe(true);
    await expect(passwordHashMatches(VALID_HASH, `${PASSWORD}-sbagliata`)).resolves.toBe(false);
  });

  it('tratta un hash malformato come non corrispondenza', async () => {
    await expect(passwordHashMatches('non-un-hash', PASSWORD)).resolves.toBe(false);
  });

  it('preferisce l’hash alla password plaintext quando entrambi sono configurati', async () => {
    const env = createTestEnv({ DM_PASSWORD: 'plaintext-diversa', DM_PASSWORD_HASH: VALID_HASH });
    await expect(verifyDmPassword(env, PASSWORD)).resolves.toBe(true);
    await expect(verifyDmPassword(env, 'plaintext-diversa')).resolves.toBe(false);
    expect(passwordMatches('plaintext-diversa', 'plaintext-diversa')).toBe(true);
  });

  it('senza credenziali configurate non autentica', async () => {
    const env = createEnv({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PUBLIC_URL: 'http://localhost:3000',
      SESSION_SECRET: 'a'.repeat(64),
      DATABASE_PATH: ':memory:',
    });
    await expect(verifyDmPassword(env, PASSWORD)).resolves.toBe(false);
  });

  it('usa il login con hash fuori dal loopback', async () => {
    const testApp = await createTestApp({ DM_PASSWORD: '', DM_PASSWORD_HASH: VALID_HASH });

    const wrong = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/dm',
      remoteAddress: '192.168.1.50',
      payload: { password: 'sbagliata' },
    });
    expect(wrong.statusCode).toBe(401);

    const login = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/dm',
      remoteAddress: '192.168.1.50',
      payload: { password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.cookies[0]?.name).toBe('dm_session');

    await closeTestApp(testApp);
  });
});

interface SessionPayload {
  v: number;
  jti?: string;
  iat: number;
  exp: number;
}

const DAY_SECONDS = 24 * 60 * 60;

const decodeSession = (token: string): SessionPayload =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as SessionPayload;

const sessionCookieValue = (
  cookies: { name: string; value: string }[],
): string | undefined => cookies.find((cookie) => cookie.name === 'dm_session')?.value;

const closeCode = (socket: WebSocket): Promise<number> =>
  new Promise((resolve) => {
    socket.once('close', (code) => resolve(code));
  });

describe('TTL e refresh della sessione DM', () => {
  it('firma token con scadenza a 7 giorni', () => {
    const env = createTestEnv();
    const token = createSessionToken(env);
    const payload = decodeSession(token);
    expect(payload.exp - payload.iat).toBe(7 * DAY_SECONDS);
    expect(verifySessionToken(env, token, Date.now() + 7 * DAY_SECONDS * 1000 - 1000)).toBe(true);
    expect(verifySessionToken(env, token, Date.now() + 7 * DAY_SECONDS * 1000 + 1000)).toBe(false);
  });

  it('rinnova il cookie quando il token ha più di un giorno', async () => {
    const testApp = await createTestApp();
    const oldToken = createSessionToken(testApp.env, Date.now() - 2 * DAY_SECONDS * 1000);

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: oldToken },
    });

    expect(response.statusCode).toBe(200);
    const refreshed = sessionCookieValue(response.cookies);
    expect(refreshed).toBeDefined();
    expect(refreshed).not.toBe(oldToken);
    const payload = decodeSession(refreshed ?? '');
    expect(payload.exp - payload.iat).toBe(7 * DAY_SECONDS);
    expect(Date.now() / 1000 - payload.iat).toBeLessThan(60);

    await closeTestApp(testApp);
  });

  it('non rinnova un token fresco', async () => {
    const testApp = await createTestApp();

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: createSessionToken(testApp.env) },
    });

    expect(response.statusCode).toBe(200);
    expect(sessionCookieValue(response.cookies)).toBeUndefined();

    await closeTestApp(testApp);
  });

  it('non emette cookie per un accesso loopback senza sessione', async () => {
    const testApp = await createTestApp();

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '127.0.0.1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ role: 'dm' });
    expect(sessionCookieValue(response.cookies)).toBeUndefined();

    await closeTestApp(testApp);
  });

  it('al logout emette solo il cookie di clear, senza refresh', async () => {
    const testApp = await createTestApp();
    const oldToken = createSessionToken(testApp.env, Date.now() - 2 * DAY_SECONDS * 1000);

    const response = await testApp.app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/dm',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: oldToken },
    });

    expect(response.statusCode).toBe(204);
    expect(response.cookies).toHaveLength(1);
    expect(response.cookies[0]).toMatchObject({ name: 'dm_session', value: '', maxAge: 0 });

    await closeTestApp(testApp);
  });

  it('al login con cookie vecchio imposta un solo cookie di sessione', async () => {
    const testApp = await createTestApp();
    const oldToken = createSessionToken(testApp.env, Date.now() - 2 * DAY_SECONDS * 1000);

    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/dm',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: oldToken },
      payload: { password: 'correct-horse-battery' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies).toHaveLength(1);
    const loginCookie = sessionCookieValue(response.cookies);
    expect(loginCookie).toBeDefined();
    expect(loginCookie).not.toBe(oldToken);
    const payload = decodeSession(loginCookie ?? '');
    expect(payload.exp - payload.iat).toBe(7 * DAY_SECONDS);

    await closeTestApp(testApp);
  });

  it('scarta token scaduti o con firma invalida senza rinnovarli', async () => {
    const testApp = await createTestApp();
    const expired = createSessionToken(testApp.env, Date.now() - 8 * DAY_SECONDS * 1000);
    const valid = createSessionToken(testApp.env, Date.now() - 2 * DAY_SECONDS * 1000);
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;

    for (const token of [expired, tampered]) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        remoteAddress: '192.168.1.50',
        cookies: { dm_session: token },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ role: 'none' });
      expect(sessionCookieValue(response.cookies)).toBeUndefined();
    }

    await closeTestApp(testApp);
  });

  it('non rinnova le richieste fuori da /api/v1', async () => {
    const testApp = await createTestApp();
    const oldToken = createSessionToken(testApp.env, Date.now() - 2 * DAY_SECONDS * 1000);

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: oldToken },
    });

    expect(sessionCookieValue(response.cookies)).toBeUndefined();

    await closeTestApp(testApp);
  });
});

const loginAsDm = async (testApp: TestApp): Promise<string> => {
  const login = await testApp.app.inject({
    method: 'POST',
    url: '/api/v1/auth/dm',
    remoteAddress: '192.168.1.50',
    headers: { 'user-agent': 'vitest-agent' },
    payload: { password: 'correct-horse-battery' },
  });
  expect(login.statusCode).toBe(200);
  const token = sessionCookieValue(login.cookies);
  expect(token).toBeDefined();
  return token ?? '';
};

describe('sessioni DM per-device', () => {
  it('il login crea una riga auth_sessions con jti e UA/IP', async () => {
    const testApp = await createTestApp();
    const token = await loginAsDm(testApp);
    const payload = decodeSessionToken(testApp.env, token);

    expect(payload?.jti).toBeDefined();
    const session = getAuthSession(testApp.database.db, payload?.jti ?? '');
    expect(session).not.toBeNull();
    expect(session?.revokedAt).toBeNull();
    expect(session?.userAgent).toBe('vitest-agent');
    expect(session?.ip).toBe('192.168.1.50');
    expect(session?.expiresAt).toBe(new Date((payload?.exp ?? 0) * 1000).toISOString());

    await closeTestApp(testApp);
  });

  it('la lista mostra la sessione corrente', async () => {
    const testApp = await createTestApp();
    const token = await loginAsDm(testApp);
    const jti = decodeSessionToken(testApp.env, token)?.jti;

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{
        id: jti,
        current: true,
        userAgent: 'vitest-agent',
      }],
    });

    await closeTestApp(testApp);
  });

  it('la revoca invalida subito il cookie del dispositivo', async () => {
    const testApp = await createTestApp();
    const token = await loginAsDm(testApp);
    const jti = decodeSessionToken(testApp.env, token)?.jti ?? '';

    const revoke = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${jti}`,
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: token },
    });
    expect(revoke.statusCode).toBe(204);
    expect(getAuthSession(testApp.database.db, jti)?.revokedAt).not.toBeNull();

    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: token },
    });
    expect(me.json()).toEqual({ role: 'none' });

    const campaigns = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: token },
    });
    expect(campaigns.statusCode).toBe(401);

    await closeTestApp(testApp);
  });

  it('la lista esclude le sessioni revocate', async () => {
    const testApp = await createTestApp();
    const firstToken = await loginAsDm(testApp);
    const secondToken = await loginAsDm(testApp);
    const firstJti = decodeSessionToken(testApp.env, firstToken)?.jti ?? '';
    const secondJti = decodeSessionToken(testApp.env, secondToken)?.jti ?? '';

    const revoke = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${firstJti}`,
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: secondToken },
    });
    expect(revoke.statusCode).toBe(204);

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: secondToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ id: secondJti, current: true }],
    });

    await closeTestApp(testApp);
  });

  it('il refresh di una sessione revocata non rinnova il cookie', async () => {
    const testApp = await createTestApp();
    const token = await loginAsDm(testApp);
    const jti = decodeSessionToken(testApp.env, token)?.jti ?? '';
    revokeAuthSession(testApp.database.db, jti);
    expect(getAuthSession(testApp.database.db, jti)?.revokedAt).not.toBeNull();

    const oldToken = createSessionToken(
      testApp.env,
      Date.now() - 2 * DAY_SECONDS * 1000,
      jti,
    );
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: oldToken },
    });

    expect(response.json()).toEqual({ role: 'none' });
    expect(sessionCookieValue(response.cookies)).toBe('');
    expect(response.cookies).toEqual([
      expect.objectContaining({ name: 'dm_session', value: '', maxAge: 0 }),
    ]);

    await closeTestApp(testApp);
  });

  it('un upgrade WS DM con sessione revocata viene chiuso con 4401', async () => {
    const testApp = await createTestApp();
    await testApp.app.listen({ port: 0, host: '127.0.0.1' });
    const address = testApp.app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    const token = await loginAsDm(testApp);
    const jti = decodeSessionToken(testApp.env, token)?.jti ?? '';
    revokeAuthSession(testApp.database.db, jti);

    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?role=dm&campaignId=test`, {
      headers: {
        Origin: 'http://localhost:4200',
        Cookie: `dm_session=${token}`,
        // Un header di forwarding disattiva il bypass loopback.
        'x-forwarded-for': '203.0.113.9',
      },
    });

    await expect(closeCode(socket)).resolves.toBe(4401);

    await closeTestApp(testApp);
  });

  it('un token legacy senza jti continua a valere', async () => {
    const testApp = await createTestApp();
    const legacy = createSessionToken(testApp.env);
    expect(decodeSessionToken(testApp.env, legacy)?.jti).toBeUndefined();

    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: legacy },
    });
    expect(me.json()).toEqual({ role: 'dm' });

    await closeTestApp(testApp);
  });

  it('il refresh mantiene lo stesso jti e aggiorna la scadenza', async () => {
    const testApp = await createTestApp();
    const token = await loginAsDm(testApp);
    const jti = decodeSessionToken(testApp.env, token)?.jti ?? '';
    const oldToken = createSessionToken(
      testApp.env,
      Date.now() - 2 * DAY_SECONDS * 1000,
      jti,
    );

    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: oldToken },
    });
    expect(response.json()).toEqual({ role: 'dm' });

    const refreshed = sessionCookieValue(response.cookies);
    expect(refreshed).toBeDefined();
    expect(refreshed).not.toBe(oldToken);
    const refreshedPayload = decodeSessionToken(testApp.env, refreshed ?? '');
    expect(refreshedPayload?.jti).toBe(jti);
    expect(getAuthSession(testApp.database.db, jti)?.expiresAt)
      .toBe(new Date((refreshedPayload?.exp ?? 0) * 1000).toISOString());

    await closeTestApp(testApp);
  });

  it('il logout revoca il jti corrente', async () => {
    const testApp = await createTestApp();
    const token = await loginAsDm(testApp);
    const jti = decodeSessionToken(testApp.env, token)?.jti ?? '';

    const logout = await testApp.app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/dm',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: token },
    });
    expect(logout.statusCode).toBe(204);
    expect(getAuthSession(testApp.database.db, jti)?.revokedAt).not.toBeNull();

    const me = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '192.168.1.50',
      cookies: { dm_session: token },
    });
    expect(me.json()).toEqual({ role: 'none' });

    await closeTestApp(testApp);
  });
});
