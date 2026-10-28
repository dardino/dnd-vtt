import { describe, expect, it } from 'vitest';
import { createEnv } from '../src/config/env.js';

const base = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PUBLIC_URL: 'http://localhost:3000',
  SESSION_SECRET: 'a'.repeat(64),
  DATABASE_PATH: ':memory:',
};

describe('configurazione env', () => {
  it('accetta il loopback senza password', () => {
    const env = createEnv(base);
    expect(env.dmPassword).toBeUndefined();
    expect(env.cookieSecure).toBe(false);
  });

  it('rifiuta HOST non loopback senza DM_PASSWORD', () => {
    expect(() => createEnv({ ...base, HOST: '0.0.0.0' })).toThrow(/DM_PASSWORD/);
  });

  it('rifiuta PUBLIC_URL non loopback senza DM_PASSWORD', () => {
    expect(() => createEnv({ ...base, PUBLIC_URL: 'http://192.168.1.10:3000' })).toThrow(/DM_PASSWORD/);
  });

  it('calcola Secure dal protocollo di PUBLIC_URL', () => {
    const env = createEnv({
      ...base,
      PUBLIC_URL: 'https://vtt.example',
      HOST: '0.0.0.0',
      DM_PASSWORD: 'password-lunga',
      ALLOWED_ORIGINS: 'https://vtt.example',
    });
    expect(env.cookieSecure).toBe(true);
    expect(env.allowedOrigins).toContain('https://vtt.example');
  });

  it('rifiuta un SESSION_SECRET troppo corto', () => {
    expect(() => createEnv({ ...base, SESSION_SECRET: 'corto' })).toThrow(/SESSION_SECRET/);
  });
});
