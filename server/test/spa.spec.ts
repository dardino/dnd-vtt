import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../src/http/spa.js';
import { closeTestApp, createTestApp, createTestEnv } from './helpers.js';

const NONCE = 'nonce-di-test';

const directives = (csp: string): Map<string, string[]> => new Map(
  csp.split('; ').map((directive) => {
    const [name = '', ...sources] = directive.split(' ');
    return [name, sources];
  }),
);

const sources = (csp: string): string[] => [...directives(csp).values()].flat();

const cspFor = (publicUrl: string): string =>
  contentSecurityPolicy(NONCE, createTestEnv({ PUBLIC_URL: publicUrl }));

describe('CSP per ambiente', () => {
  it('in HTTP consente solo il WebSocket della stessa origine', () => {
    const csp = cspFor('http://localhost:3000');

    expect(directives(csp).get('connect-src')).toEqual(["'self'", 'ws://localhost:3000']);
    expect(csp).not.toContain('ws: wss:');
    expect(sources(csp)).not.toContain('ws:');
    expect(sources(csp)).not.toContain('wss:');
  });

  it('in HTTPS usa wss sulla stessa origine', () => {
    const csp = cspFor('https://dnd.lan');

    expect(directives(csp).get('connect-src')).toEqual(["'self'", 'wss://dnd.lan']);
    expect(csp).not.toContain('ws: wss:');
    expect(sources(csp)).not.toContain('ws:');
    expect(sources(csp)).not.toContain('wss:');
  });

  it('mantiene la porta non standard di PUBLIC_URL', () => {
    expect(directives(cspFor('http://localhost:8080')).get('connect-src'))
      .toEqual(["'self'", 'ws://localhost:8080']);
    expect(directives(cspFor('https://dnd.lan:8443')).get('connect-src'))
      .toEqual(["'self'", 'wss://dnd.lan:8443']);
  });

  it('include il nonce e blocca il framing', () => {
    const csp = cspFor('http://localhost:3000');

    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${NONCE}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });
});

describe('header CSP su GET /', () => {
  let clientDist = '';

  beforeAll(() => {
    clientDist = mkdtempSync(join(tmpdir(), 'dnd-vtt-spa-'));
    writeFileSync(join(clientDist, 'index.html'), [
      '<!doctype html>',
      '<html lang="it"><head>',
      '<meta name="ngCspNonce" content="__CSP_NONCE__">',
      '<script src="main.js"></script>',
      '<style>body { margin: 0; }</style>',
      '</head><body><app-root></app-root></body></html>',
    ].join('\n'), 'utf8');
  });

  afterAll(() => {
    rmSync(clientDist, { recursive: true, force: true });
  });

  it.each([
    ['http://localhost:3000', 'ws://localhost:3000'],
    ['https://dnd.lan', 'wss://dnd.lan'],
  ])('serve index.html con nonce e connect-src ristretta per %s', async (publicUrl, wsOrigin) => {
    const testApp = await createTestApp({
      PUBLIC_URL: publicUrl,
      CLIENT_DIST: clientDist,
    });
    try {
      const response = await testApp.app.inject({ method: 'GET', url: '/' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');

      const header = response.headers['content-security-policy'];
      expect(typeof header).toBe('string');
      const csp = typeof header === 'string' ? header : '';
      expect(directives(csp).get('connect-src')).toEqual(["'self'", wsOrigin]);
      expect(csp).toContain("frame-ancestors 'none'");

      const nonce = /nonce="([^"]+)"/.exec(response.body)?.[1];
      expect(nonce).toBeDefined();
      expect(csp).toContain(`'nonce-${nonce}'`);
      expect(response.body).not.toContain('__CSP_NONCE__');
    } finally {
      await closeTestApp(testApp);
    }
  });
});
