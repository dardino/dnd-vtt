import { describe, expect, it } from 'vitest';
import { createEnv } from '../src/config/env.js';

const base = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PUBLIC_URL: 'http://localhost:3000',
  SESSION_SECRET: 'a'.repeat(64),
  DATABASE_PATH: ':memory:',
};

const VALID_HASH = 'scrypt$BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=$'
  + '7xz8PiBhjHMsfWzy+b1INs+QhZTfyCx6R+c0FmNafORuV04wf2/YuBlpbl4Jl0xPFkVSNpcFpiKJuIY8k3K6zA==';

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

  it('accetta un DM_PASSWORD_HASH valido fuori dal loopback', () => {
    const env = createEnv({
      ...base,
      HOST: '0.0.0.0',
      PUBLIC_URL: 'http://192.168.1.10:3000',
      DM_PASSWORD_HASH: VALID_HASH,
    });
    expect(env.dmPassword).toBeUndefined();
    expect(env.dmPasswordHash).toBe(VALID_HASH);
  });

  it('rifiuta un DM_PASSWORD_HASH malformato', () => {
    expect(() => createEnv({ ...base, DM_PASSWORD_HASH: 'scrypt$solo-salt' })).toThrow(/DM_PASSWORD_HASH/);
    expect(() => createEnv({ ...base, DM_PASSWORD_HASH: 'bcrypt$c2FsdA==$aGFzaA==' })).toThrow(/DM_PASSWORD_HASH/);
    expect(() => createEnv({ ...base, DM_PASSWORD_HASH: 'scrypt$c2FsdA==$aGFzaA==' })).toThrow(/DM_PASSWORD_HASH/);
  });

  it('rifiuta una DM_PASSWORD corta fuori dal loopback', () => {
    expect(() => createEnv({
      ...base,
      HOST: '0.0.0.0',
      DM_PASSWORD: 'undici-car!',
    })).toThrow(/12 caratteri/);
  });

  it('accetta una DM_PASSWORD di 12 caratteri fuori dal loopback', () => {
    const env = createEnv({ ...base, HOST: '0.0.0.0', DM_PASSWORD: 'dodici-car!!' });
    expect(env.dmPassword).toBe('dodici-car!!');
  });

  it('mantiene il minimo di 8 caratteri sul loopback', () => {
    const env = createEnv({ ...base, DM_PASSWORD: 'otto-car' });
    expect(env.dmPassword).toBe('otto-car');
    expect(() => createEnv({ ...base, DM_PASSWORD: 'sette-c' })).toThrow(/8 caratteri/);
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

  it('disattiva keepOriginals per default', () => {
    expect(createEnv(base).keepOriginals).toBe(false);
    expect(createEnv({ ...base, KEEP_ORIGINALS: '' }).keepOriginals).toBe(false);
    expect(createEnv({ ...base, KEEP_ORIGINALS: 'false' }).keepOriginals).toBe(false);
  });

  it('accetta KEEP_ORIGINALS=true e rifiuta valori non booleani', () => {
    expect(createEnv({ ...base, KEEP_ORIGINALS: 'true' }).keepOriginals).toBe(true);
    expect(() => createEnv({ ...base, KEEP_ORIGINALS: 'yes' })).toThrow(/KEEP_ORIGINALS/);
  });

  it('rifiuta un SESSION_SECRET troppo corto', () => {
    expect(() => createEnv({ ...base, SESSION_SECRET: 'corto' })).toThrow(/SESSION_SECRET/);
  });

  it('disattiva trustProxy per default', () => {
    expect(createEnv(base).trustProxy).toBe(false);
    expect(createEnv({ ...base, TRUST_PROXY: '' }).trustProxy).toBe(false);
    expect(createEnv({ ...base, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
  });

  it('accetta TRUST_PROXY=true', () => {
    expect(createEnv({ ...base, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
  });

  it('accetta un numero di hop tra 1 e 10', () => {
    expect(createEnv({ ...base, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(createEnv({ ...base, TRUST_PROXY: '10' }).trustProxy).toBe(10);
  });

  it('rifiuta un numero di hop fuori intervallo o un valore non valido', () => {
    expect(() => createEnv({ ...base, TRUST_PROXY: '0' })).toThrow(/TRUST_PROXY/);
    expect(() => createEnv({ ...base, TRUST_PROXY: '11' })).toThrow(/TRUST_PROXY/);
    expect(() => createEnv({ ...base, TRUST_PROXY: '2.5' })).toThrow(/TRUST_PROXY/);
    expect(() => createEnv({ ...base, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
