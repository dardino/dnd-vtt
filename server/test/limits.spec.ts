import { describe, expect, it } from 'vitest';
import { isRateLimitExempt } from '../src/http/rate-limit.js';
import { closeTestApp, createTestApp } from './helpers.js';

describe('S4: limiti corpo e rate limit', () => {
  it('rifiuta un body JSON oltre MAX_JSON_MB con 413 payload_too_large', async () => {
    // 0.001 MB = 1048 byte: il body supera il limite prima della validazione Zod.
    const testApp = await createTestApp({ MAX_JSON_MB: '0.001' });
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      payload: { name: 'x'.repeat(4096) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: { code: 'payload_too_large' } });
    await closeTestApp(testApp);
  });

  it('accetta un body JSON entro MAX_JSON_MB', async () => {
    const testApp = await createTestApp({ MAX_JSON_MB: '0.001' });
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      payload: { name: 'La miniera perduta' },
    });
    expect(response.statusCode).toBe(201);
    await closeTestApp(testApp);
  });

  it('esenta dal limite solo upload, health, SRD e polling azioni', () => {
    const exempt = [
      { method: 'GET', url: '/uploads/webp/abc.webp' },
      { method: 'GET', url: '/api/v1/health' },
      { method: 'GET', url: '/api/v1/health?probe=1' },
      { method: 'GET', url: '/api/v1/srd' },
      { method: 'GET', url: '/api/v1/srd/meta' },
      { method: 'GET', url: '/api/v1/srd/2014/monsters?q=goblin' },
      { method: 'GET', url: '/api/v1/campaigns/abc/actions' },
      { method: 'GET', url: '/api/v1/campaigns/abc/actions?sinceVersion=3&sceneId=abc' },
    ];
    for (const request of exempt) {
      expect(isRateLimitExempt(request), `${request.method} ${request.url}`).toBe(true);
    }

    // Export, player sheet, snapshot e le scritture sulle azioni sono contate.
    const limited = [
      { method: 'GET', url: '/api/v1/campaigns/abc/export' },
      { method: 'GET', url: '/api/v1/campaigns/abc/export?includePrivateNotes=true' },
      { method: 'GET', url: '/api/v1/play/token/sheet' },
      { method: 'GET', url: '/api/v1/scenes/abc/snapshot' },
      { method: 'GET', url: '/api/v1/campaigns' },
      { method: 'GET', url: '/api/v1/displays/ABC123' },
      { method: 'GET', url: '/api/v1/srdish' },
      { method: 'POST', url: '/api/v1/campaigns/abc/actions' },
      { method: 'GET', url: '/api/v1/campaigns/abc/actions/undo' },
    ];
    for (const request of limited) {
      expect(isRateLimitExempt(request), `${request.method} ${request.url}`).toBe(false);
    }
  });

  // Il limite globale e' 300 richieste/minuto (100.000 in NODE_ENV=test): con la
  // configurazione attuale non esiste un modo pulito di abbassarlo per singolo
  // test, quindi l'integrazione 429 su export e player sheet resta coperta dal
  // test unitario dell'allowList qui sopra. Il test del body limit verifica il
  // percorso 413 end-to-end.
});
