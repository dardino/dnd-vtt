// Zod compila gli schemi con `new Function`: sotto una CSP stretta il probe
// genera un evento `securitypolicyviolation`. Disattivare il JIT prima che il
// bundle Angular carichi gli schemi mantiene la CSP senza `unsafe-eval`.
globalThis.__zod_globalConfig = Object.assign(
  {},
  globalThis.__zod_globalConfig,
  { jitless: true },
);
