export interface RateLimitRequest {
  method: string;
  url: string;
}

const pathOf = (url: string): string => {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
};

const ACTIONS_POLLING_PATH = /^\/api\/v1\/campaigns\/[^/]+\/actions$/;

/**
 * Esenti dal rate limit globale solo gli asset statici e gli endpoint che il
 * client interroga a intervalli regolari (health, SRD, polling azioni). Le
 * altre GET — export della campagna, scheda del giocatore, snapshot — restano
 * contate: sono costose e non devono poter essere ripetute senza freno.
 */
export const isRateLimitExempt = (request: RateLimitRequest): boolean => {
  const path = pathOf(request.url);
  if (path.startsWith('/uploads/')) {
    return true;
  }
  if (request.method !== 'GET') {
    return false;
  }
  return path === '/api/v1/health'
    || path === '/api/v1/srd'
    || path.startsWith('/api/v1/srd/')
    || ACTIONS_POLLING_PATH.test(path);
};
