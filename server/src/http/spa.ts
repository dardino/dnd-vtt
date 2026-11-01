import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppEnv } from '../config/env.js';

const NONCE_PLACEHOLDER = '__CSP_NONCE__';

/**
 * `'self'` in `connect-src` non copre il WebSocket in tutti i browser target,
 * quindi l'origine WS va elencata esplicitamente. Niente `ws:`/`wss:` generici:
 * il client può aprire socket solo verso la stessa origine di `PUBLIC_URL`.
 */
const webSocketOrigin = (publicUrl: URL): string | undefined => {
  if (publicUrl.protocol === 'https:') {
    return `wss://${publicUrl.host}`;
  }
  if (publicUrl.protocol === 'http:') {
    return `ws://${publicUrl.host}`;
  }
  return undefined;
};

export const contentSecurityPolicy = (nonce: string, env: AppEnv): string => {
  const wsOrigin = webSocketOrigin(env.publicUrl);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    wsOrigin === undefined ? "connect-src 'self'" : `connect-src 'self' ${wsOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
};

export interface SpaHandler {
  enabled: boolean;
  sendIndex: (request: FastifyRequest, reply: FastifyReply) => FastifyReply;
}

/**
 * `index.html` non viene mai servito così com'è: a ogni richiesta riceve un
 * nonce nuovo, coerente con la CSP, e `no-store` per non congelare il nonce.
 */
export const createSpaHandler = (env: AppEnv): SpaHandler => {
  const indexPath = join(env.clientDist, 'index.html');
  if (!existsSync(indexPath)) {
    return {
      enabled: false,
      sendIndex: (_request, reply) => reply.status(404).send({
        error: { code: 'not_found', message: 'Client non compilato', requestId: 'spa' },
      }),
    };
  }
  const template = readFileSync(indexPath, 'utf8');
  return {
    enabled: true,
    sendIndex: (_request, reply) => {
      const nonce = randomBytes(16).toString('base64');
      const html = template
        .replaceAll(NONCE_PLACEHOLDER, nonce)
        .replaceAll('<style', `<style nonce="${nonce}"`)
        .replaceAll('<script', `<script nonce="${nonce}"`);
      return reply
        .header('cache-control', 'no-store')
        .header('content-security-policy', contentSecurityPolicy(nonce, env))
        .header('referrer-policy', 'same-origin')
        .type('text/html; charset=utf-8')
        .send(html);
    },
  };
};

export const registerSpaRoute = (app: FastifyInstance, spa: SpaHandler): void => {
  if (!spa.enabled) {
    return;
  }
  app.get('/', async (request, reply) => spa.sendIndex(request, reply));
};
