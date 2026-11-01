import { describe, expect, it } from 'vitest';
import { verifyDmPassword, passwordHashMatches, passwordMatches } from '../src/auth/auth.js';
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
