import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  verifyDmPassword,
  verifySessionToken,
  passwordHashMatches,
  passwordMatches,
} from '../src/auth/auth.js';
import { createEnv, parseScryptPasswordHash } from '../src/config/env.js';
import { closeTestApp, createTestApp, createTestEnv } from './helpers.js';

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
  iat: number;
  exp: number;
}

const DAY_SECONDS = 24 * 60 * 60;

const decodeSession = (token: string): SessionPayload =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as SessionPayload;

const sessionCookieValue = (
  cookies: { name: string; value: string }[],
): string | undefined => cookies.find((cookie) => cookie.name === 'dm_session')?.value;

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
