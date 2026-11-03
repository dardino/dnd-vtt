# TODO — D&D VTT

Derivata da `CODE_REVIEW.md` il 1 novembre 2026. Contiene **solo i punti ancora aperti**: le correzioni già applicate (sezione 11 della review) non sono ripetute.

**Legenda**

- **P1** = debito che frena le prossime feature; **P2** = manutenzione/refactor pianificabile.
- **Sforzo:** S ≤ 1 giorno, M 2–4 giorni, L ≥ 1 settimana.
- `Dx` = decisione tracciata nella tabella sotto.

## Decisioni registrate — 1 novembre 2026

| ID | Decisione | Scelta | Stato |
|---|---|---|---|
| D1 | Prossimo blocco di lavoro | **Architettura realtime/azioni** | deciso |
| D2 | Strategia realtime | **`RealtimeService` unico** | deciso |
| D3 | Modello ad azioni | **`token-sync` come azioni + rimozione `PUT`** | deciso |
| D4 | History editor mappa | **comandi/patch** | deciso |
| D5 | Allineamento `PLAN.md` | **adottare Signal Forms + `resource()` + `@defer` (opzione B)** | deciso |
| D6 | Tooling e qualità | **coverage progressiva, fixtures, `max-len` 110, contract test** | deciso |
| D7 | Sicurezza | **tutti i livelli S0–S6 + predisposizione internet S7–S9** | deciso |
| D8 | Ordine split god component | **`DmShellPage`** | deciso |
| D9 | Distribuzione | **Docker Compose + sorgente; GHCR pubblico; server `linux/amd64`/`linux/arm64`; Pi 1 solo display** | deciso |

**Blocco attivo:** B5, S7 e Pi 1. B4 è completato (B1, B4a-B4f); B5 è in corso con B5b (pannello AI). Restano input non-form wall/light/spawn transient. Completati S0-S9 (tranne verifica TLS S7), A1-A4, R1-R3, P1-P7, Q1-Q6, T1-T3, R0, SR1-SR7, C1-C7 e B1-B4. Suite E2E completa verde (39/39).

**Policy nuova:** un file oltre **350–400 righe** va considerato candidato allo split. La soglia diventa operativa nella task **R0**.

---

## 1. Architettura e modello dati (P1)

Ordine di esecuzione: **A3 → A2 → A1 → A4**. A3 isola lo stato, A2 rende le azioni l'unico writer, A1 può quindi veicolarle sul WebSocket, A4 centralizza gli errori.

- [x] **A1 — `RealtimeService` unico** · L · D2 — ✅ 2 novembre 2026
  - **Prerequisito:** **S0** (Origin check e rate limit sul WebSocket): A1 non deve veicolare azioni su un canale senza controllo di origine.
  - **Problema:** tre meccanismi (WS display, WS presenza DM, polling azioni ogni 2 s) e due copie di riconnessione/backoff.
  - **Proposta:** `client/src/app/core/realtime.service.ts` con `connect(role, campaignId)`, parsing envelope, backoff, `seq` e dispatch a `ActionStore`/program/presence. Il polling resta solo come fallback dietro flag per una release.
  - **Fatto quando:** una sola connessione per tab; azioni convergenti senza `setInterval`; test su reconnect e gap di `seq`.

- [x] **A2 — `token-sync` dentro `action_log`; `PUT /scenes/:id/state`** · L · D3 — ✅ 1 novembre 2026
  - **Problema:** `updateTokensForActor` scrive `scenes.state` e `stateVersion` fuori dal log; l'undo non copre quelle modifiche. `PUT /scenes/:id/state` è usato solo dai test.
  - **Proposta:** emettere `token.update` (uno per token cambiato) nella stessa transazione; migrare i test all'endpoint azioni e **rimuovere** `PUT /scenes/:id/state`.
  - **Fatto quando:** nessuna scrittura di stato fuori dal log; undo/redo copre la sync; test aggiornati.

- [x] **A3 — Stato di modulo → servizi iniettati** · M — ✅ 1 novembre 2026
  - **Problema:** `hub.ts` (`clients`, `database`), `dice/service.ts` (`idempotency`), `roll-stats.ts` (`rolls`) sono singleton di modulo: due `buildApp` nello stesso processo condividono stato.
  - **Proposta:** `RealtimeHub` come classe creata in `buildApp` e passata alle route; `IdempotencyCache`/`RollStats` come istanze con TTL e `dispose()`.
  - **Fatto quando:** due app in un test sono isolate; cleanup deterministico.

- [x] **A4 - `ErrorHandler` globale e toast** · M — ✅ 3 novembre 2026
  - **Problema:** `messageFor` è ancora duplicato in store/feature; gli errori non gestiti non hanno un punto unico.
  - **Proposta:** `ToastService` signal-based + container in `app.html`; `ErrorHandler` globale che usa `http-error.ts`; gli store smettono di mappare i messaggi.
  - **Fatto quando:** un errore non gestito mostra un toast; un solo punto di traduzione HTTP.
  - **Stato:** `ToastService` + container e `GlobalErrorHandler` fatti (1 novembre 2026); le mappature locali di `action.store`, `dice.store`, `scene.store`, `dm-shell`, `auth.service`, `player`, `actor-sheet`, `map-editor` e `maps` ora passano tutte da `httpMessage` (3 novembre 2026).

- [x] **A5 — Regole di dominio residue in `shared`** · M
  - **Problema:** `buildFeatures`/`classFeatures`, slot incantesimo, `startView`/`mapView`/`viewport`, envelope paginato, lista skill, `mime` immagini e viste `DmSheetView`/`PlayerSheetView` hanno ancora copie.
  - **Proposta:** estrarre `classFeaturesFor`, `spellSlotsFor`, `viewSchema`, `paginatedSchema(item)`, `skillsTuple`, `imageMimeSchema`; derivare le due viste da una base comune.
  - **Fatto quando:** una sola implementazione per regola, con test condivisi.
  - **Stato:** `classFeaturesFor`/`spellSlotsFor` condivisi con test; viste, envelope paginato, skill e `mime` estratti e coperti da test (A5b, 3 novembre 2026); `DmSheetView`/`PlayerSheetView` derivano da `sheetViewBaseSchema` con mapper comune (A5c, 3 novembre 2026).
  - **A5b — Test condivisi per viste, envelope, skill e `mime`** · S — ✅ 3 novembre 2026
    - `shared/src/schemas/common.spec.ts`: default/validazione di `viewSchema`, `paginatedSchema(item)`, 18 skill in ordine canonico con bonus, `imageMimeSchema` con rifiuto di SVG.
  - **A5c — Base comune per le viste scheda** · S — ✅ 3 novembre 2026
    - `sheetViewBaseSchema` con campi condivisi; DM aggiunge `dmNotes`, il giocatore `playerNotes`/`editingEnabled`/`editable`/`autoApprove`; mapper `server/src/actors/sheet-view.ts` usato da entrambi i service, con test shared/server.

## 2. Performance (P1)

- [x] **P1 — `projectDisplay`/`publicScene`: eliminare l'N+1 residuo** · M
  - **Problema:** la cache per scena copre i token, ma `projectDisplay` continua a risolvere asset per layer/contenuto; con 30 token e 3 display restano centinaia di query sincrone.
  - **Proposta:** batch loader per richiesta (`actorsById`, `assetsById`) con una query `IN (...)` per tabella, passato a `publicScene` e `projectDisplay`; cache per singolo broadcast.
  - **Fatto quando:** una `getActorsByIds` e una `getAssetsByIds` per proiezione, indipendenti da token/layer/display; nessuna `getActor`/`getAsset` per elemento; test con 30 token, 30 attori e 3 display.

- [x] **P2 — `updateTokensForActor` mirato** · M — ✅ 2 novembre 2026
  - **Problema:** scandisce tutte le scene della campagna a ogni modifica di scheda.
  - **Proposta:** pre-filtro SQL (`json_each` su `scenes.state`) e parse solo delle scene candidate; alternativa: tabella indice `scene_tokens(actor_id, scene_id)` aggiornata in transazione.
  - **Esito:** `json_each`/`json_extract` con guardia `json_valid` seleziona solo le scene candidate; fallback `LIKE` con wildcard escapate se JSON1 non è disponibile. Test con 50 scene (3 candidate, 10 con JSON corrotto) in `token-sync.spec.ts`, incluso il percorso di fallback.

- [x] **P3 — History editor mappa a comandi/patch** · M · D4 — ✅ 2 novembre 2026
  - **Problema:** 50 `structuredClone` completi del documento; con 4.000 muri e 500 spawn la history pesa centinaia di MB.
  - **Proposta:** `MapCommand` con `apply`/`invert` (o patch JSON) e limite 50 invariato; snapshot completo solo per operazioni strutturali.
  - **Fatto quando:** 1.000 modifiche senza crescita MB; undo/redo coperti da test.
  - **Esito:** `MapHistory` + `MapCommand` integrati in `map-editor.page.ts`; tutti gli handler usano
    `arrayInsert`/`arrayRemove`/`replaceFields`/`replaceBackground`; undo/redo riallineano `image` e mantengono
    dirty/selezione. Budget 200 comandi / 32 MB condiviso tra undo e redo. Test pagina sulla sequenza mista e test
    history con 1.000 edit su 4.000 muri e 500 spawn senza accumulo del documento.
  - **Nota (2 novembre 2026):** con la risoluzione immutabile, `replaceBackground` non deve più cambiare
    `widthPx`/`heightPx`; aggiorna solo asset e trasformazione (vedi `docs/scene-resolution-background-design.md`).

- [x] **P4 — Rendering canvas incrementale** · M
  - **Problema:** `renderAll()` a ogni wheel/pointermove; griglia editor con un `Konva.Line` per cella; `getComputedStyle` a ogni render.
  - **Proposta:** ridisegnare solo il layer toccato, `requestAnimationFrame` + throttle sugli input, griglia come singolo `Konva.Shape`, cache colori invalidata su `data-theme`/resize.
  - **Fatto quando:** 60 fps con 4.000 muri; nessun `renderAll` su move.
  - **Esito:** `renderAll` separato in `renderScene` (sfondo/griglia) e `renderOverlays` (muri, luci,
    spawn/start, bozza); wheel e pan passano da `scheduleRender` → `renderCameraFrame` (solo griglia e,
    se attiva, bozza), senza ridisegnare lo sfondo. Gli overlay usano `strokeScaleEnabled(false)` (e
    `perfectDrawEnabled(false)` dove c'è fill+stroke+opacity), quindi seguono la trasformazione dello stage
    senza essere ricreati. Griglia già a singola `Konva.Shape` e colori già in cache; test su coalescing,
    wheel/pan senza `renderMap`, aggiornamento bozza e conteggio shape per layer.

- [x] **P5 — Cache immagini con limite** · S — ✅ 2 novembre 2026
  - **Problema:** `loadingImages`/`portraitImages` crescono per tutta la sessione.
  - **Esito:** `LruCache` (estende `Map`, hit che riporta in fondo) con limite 100 per `loadingImages` e 50 per
    `portraitImages`; eviction della entry più vecchia a ogni `set`. Test in `lru-cache.spec.ts`.
    Il clear su cambio campagna/scena non è stato aggiunto: l'LRU basta al limite di memoria.

- [x] **P6 — Indici di paginazione** · S
  - **Problema (corretto):** gli indici compositi per il cursore `createdAt+id` esistevano già; mancava solo una verifica automatica.
  - **Esito:** `campaigns_created_at_idx (created_at, id)`, `scenes_campaign_idx (campaign_id, created_at, id)`,
    `actors_campaign_idx (campaign_id, created_at, id)` e `actors_kind_idx (kind, created_at, id)` sono usati
    dai piani (`EXPLAIN QUERY PLAN`) senza `TEMP B-TREE`: nessuna migrazione necessaria. Regressione coperta da
    `server/test/query-plan.spec.ts`. Nota: il predicato `createdAt < ? OR (createdAt = ? AND id < ?)` non
    produce un range seek sulla tupla; per campagne il piano è uno scan dell'indice, per scene/attori il seek
    usa solo `campaign_id`/`kind`. Un confronto row-value `(created_at, id) < (?, ?)` sarebbe più selettivo,
    ma è un cambio di query fuori dallo scope di questo passo.

- [x] **P7 — `applySceneAction`: misurare prima di ottimizzare** · S
  - **Problema:** riserializza e ri-valida l'intero `SceneState` a ogni azione.
  - **Proposta:** misurare payload/parse su scene reali; se > 50 ms passare a patch JSON con `stateVersion`, altrimenti documentare e chiudere.
  - **Fatto quando:** decisione registrata con numeri.
  - **Esito:** misurato, sotto soglia. `npm run bench:scene-action` (DB temporaneo migrato, 1.000 token,
    2.000 fog ops, stato 368,6 KiB): su tre esecuzioni `token.update` mediana 4,28-5,30 ms,
    `grid.update` mediana 3,79-4,40 ms (max osservato 9,98 ms). Nessuna patch JSON necessaria;
    lo script resta come regressione manuale.

## 3. Qualità e test (P1)

- [x] **Q1 — Coverage configurata** · S · D6
  - **Proposta:** `@vitest/coverage-v8` su `shared`/`server`; soglia progressiva (60% ora, ratchet a 80/75) e report in CI.
  - **Fatto quando:** `npm run test:coverage` produce coverage e fallisce sotto soglia; step dedicato in CI.
  - **Esito:** coverage v8 (`text` + `json-summary`) su `shared`/`server`, script `test:coverage` e step CI.
    Soglie attuali (globali): `shared` 70 statements / 60 branches / 70 functions / 70 lines,
    `server` 60 / 50 / 60 / 60. Misurato: `shared` 76,4 stmts · 64,9 branch · 81,6 fn · 76,1 lines;
    `server` 69,7 stmts · 52,7 branch · 68,4 fn · 69,6 lines (entrypoint/CLI a 0% esclusi).
    Il target 80/75 non passa su `shared` (branch 64,9) né su `server` (branch 52,7), quindi si parte
    dal primo gradino previsto (70/60 e 60/50) con un margine minimo sul misurato; debito: alzare a
    80/75 quando `shared/src/schemas` e `server/src/sessions` saranno coperti.

- [x] **Q2 — Test componenti client critici** · M
  - **Proposta:** TestBed + vitest per `Dialog` (Esc singolo, `aria-labelledby`), `Button` (ARIA), `ActionStore` (TTL/guard), `SceneCanvas` (smoke render/fog), `ActorSheet` (patch HP).
  - **Fatto quando:** i cinque componenti hanno test di regressione.

- [x] **Q3 — Contract test client/server** · M
  - **Proposta:** test server che validano le risposte con gli schemi `shared`; in alternativa generazione tipi da OpenAPI (c'è già `fastify-type-provider-zod`).
  - **Fatto quando:** una divergenza di DTO fallisce nei test, non a runtime.
  - **Esito:** `server/test/contracts.spec.ts` valida con `safeParse` le risposte reali di campagne, scene,
    attori, display (`displayStateEnvelopeSchema`: la route restituisce l'envelope) ed export.
    Fixture create via API; gli errori riportano `error.issues`.

- [x] **Q4 — Fixtures condivise** · S · D6
  - **Proposta:** `client/e2e/fixtures.ts` (`openCampaign`, `campaignId`, `ensureScene`, `createGoblin`) e `server/test/factories.ts` (`createCampaign`, `createScene`, `sendAction`, `createPc`).
  - **Fatto quando:** ~200 righe duplicate rimosse.
  - **Esito:** `server/test/factories.ts` esporta `createCampaign`, `createScene`, `createDisplay`, `createMonster`,
    `sendAction`, `createPc`, `fighterBuild`; `client/e2e/fixtures.ts` esporta `campaignId`, `openCampaign`,
    `ensureScene`, `createScene`, `createGoblin`, `createStageFixture` e `sceneSnapshot`. Migrati i test residui
    (contracts, realtime, realtime-actions, services, build, phase-7) e mantenute le dimensioni 800×600 in
    `phase6.spec.ts`. ~960 righe duplicate rimosse dalle spec, ~450 al netto delle fixture condivise.

- [x] **Q5 - Accessibilità automatica** · S
  - **Proposta:** `@axe-core/playwright` sulle route principali; controlli su dialog, toolbar e fallback canvas.
  - **Fatto quando:** nessuna violazione critical/serious.
  - **Esito:** `client/e2e/phase-99-accessibility.spec.ts` (nome scelto per girare dopo `phase-9` e non
    dipendere dal DB vuoto) scansiona `/dm`, `/dm` con dialog "Scegli campagna", `/maps` e
    `/display/:code` con `AxeBuilder` sui tag WCAG 2.0/2.1/2.2 A/AA e fallisce su `serious`/`critical`
    (nessuna esclusione: i canvas hanno già `role="img"` e `aria-label`). Nota: axe-core 4.14 non espone
    `wcag22a`; i criteri 2.2 A sono coperti da `wcag22aa`. Violazioni corrette: contrasto di `.eyebrow` e
    `.campaign-card__meta` (`--color-text-muted`), nomi accessibili di brand e accordion senza `aria-label`
    disallineato dal testo visibile, e toolbar scena con `flex: 0 0 auto` per non schiacciare i target
    sotto 24px. Test eseguito con `npx playwright test e2e/phase-99-accessibility.spec.ts` (4/4).

- [x] **Q6 — Triage E2E preesistenti** · M — ✅ 3 novembre 2026
  - **Problema:** la suite completa aveva 6 fallimenti storici (`phase-4`, `phase-6`, `phase-9`) che
    mascheravano eventuali regressioni.
  - **Esito:** `ensureScene` in `client/e2e/fixtures.ts` ora seleziona/crea la scena **con il nome
    richiesto** invece di riusare la scena attiva di un altro test (era la causa dei fallimenti
    `phase-6`: una scena esagonale/visione disattivata ereditata da `phase-4`). `phase-4` verifica che
    la sostituzione sfondo mantenga le dimensioni (SR1/SR5), non più che le cambi a 1024×512, e attende
    il comando di sostituzione prima di salvare; `phase-9` crea la mappa 1400×1400 coerente con il
    documento, evitando il 400 "dimensioni immutabili"; `phase-2` campiona colonne e altezza nella stessa
    poll (era flaky). Suite completa: **39/39 verde** per due esecuzioni consecutive (`npx playwright test`).

## 4. Sicurezza (P1) — **attiva (D7): tutti i livelli**

> **Contesto:** il VTT gira in LAN e non è pensato per internet, ma va costruito come se lo fosse. Ogni controllo viene implementato ora, così un'eventuale esposizione futura non richiede una rincorsa. **S0 è bloccante per A1**; S1–S9 completano la postura "internet-ready".

### Già in ordine (verificato)

- Sessione DM firmata HMAC con TTL 7 giorni e refresh su attività, cookie `httpOnly` + `sameSite=strict` + `secure` auto; segreto ≥ 32 caratteri persistito con permessi `0600`.
- Login con rate limit 5/min e password obbligatoria fuori dal loopback.
- Host allowlist e controllo `Origin` su tutte le richieste non-GET.
- CSP con nonce per `index.html` e `CSP_NONCE` in Angular; `frame-ancestors 'none'`.
- Upload: solo PNG/JPEG/WebP, ri-codifica sharp, EXIF rimosso dal WebP servito, limite 100 MP e 20 MB; `originals/` non servito.
- Link giocatore: token da 24 byte casuali, hash SHA-256 a riposo, revoca e editing toggle.
- Codici display CSPRNG (8 caratteri, alfabeto 32) e lookup HTTP rate-limited.
- Export note private opt-in; import transazionale; idempotenza azioni legata a campagna/scena.
- Query Drizzle parametrizzate; nessuna CORS wildcard.

### Da chiudere, in ordine di rischio

- [x] **S0 — Origin check sul WebSocket + anti-brute-force** · M · **bloccante per A1** — ✅ 1 novembre 2026
  - **Problema:** `/ws` è una GET, quindi non passa il controllo `Origin` dell'hook; con il bypass loopback una pagina malevola può aprire `ws://localhost:3000/ws?role=dm&...`. Oggi espone solo presence/hello, ma A1 ci farà passare azioni e stato. Inoltre `/ws` è esente dal rate limit: i codici display sono provabili senza freno.
  - **Implementato:** `Origin` validato su ogni upgrade in `app.ts`; il ruolo `dm` richiede l'header; `WsAttemptLimiter` per IP (default 60/min, `WS_RATE_LIMIT_MAX`); socket raw chiuso sui rifiuti; test CSWSH, DM senza Origin, rate limit e unit test del limiter.
  - **Fatto quando:** test CSWSH (Origin esterno → chiusura/403) e test brute-force (soglia → 429/chiusura).

- [x] **S1 — CSP per ambiente** · S — ✅ 1 novembre 2026
  - **Problema:** `connect-src 'self' ws: wss:` consente connessioni verso qualunque host.
  - **Proposta:** costruire la CSP da `env`: produzione `connect-src 'self'`; sviluppo aggiunge gli `allowedOrigins` (http/ws). Verificare che `'self'` copra il WS same-origin nei browser target, altrimenti elencare esplicitamente `ws(s)://host`.
  - **Implementato:** `contentSecurityPolicy(nonce, env)` deriva da `PUBLIC_URL` l'origine WS esplicita (`ws://` per http, `wss://` per https, porta inclusa); restano `connect-src 'self'` e nessun `ws:`/`wss:` generico. Test unitari sulle direttive e test end-to-end dell'header su `GET /` con un `index.html` temporaneo.
  - **Fatto quando:** header verificato in test e build prod.

- [x] **S2 — Password DM con hash e policy** · M — ✅ 1 novembre 2026
  - **Problema:** `passwordMatches` confronta due plaintext con HMAC a chiave costante; non esiste `DM_PASSWORD_HASH`; minimo 8 caratteri.
  - **Proposta:** supportare `DM_PASSWORD_HASH` (scrypt PHC) e usarlo se presente; fallback plaintext solo in dev/test; minimo 12 caratteri fuori loopback; documentare in `.env.example`.
  - **Implementato:** `DM_PASSWORD_HASH` nel formato `scrypt$<saltBase64>$<hashBase64>` validato in `createEnv` (salt ≥ 16 byte, hash 64 byte); se presente ha precedenza e la verifica usa `scrypt` + `timingSafeEqual`, altrimenti resta il confronto HMAC del plaintext. Fuori dal loopback serve almeno una credenziale e il plaintext richiede 12 caratteri (8 sul loopback). Script `npm run hash:password` (`server/scripts/hash-password.mjs`) con prompt nascosto o stdin; `.env.example` e `docs/deploy-docker.md` aggiornati.
  - **Fatto quando:** hash e policy sono applicati e coperti da test; in produzione l'hash è la scelta consigliata, il plaintext resta accettato con minimo 12 caratteri.

- [x] **S3 — TTL breve e revoca sessione** · M
  - **Proposta:** TTL 7 giorni con refresh su attività, oppure `jti` + versione sessione revocabile al logout; valutare il costo rispetto a D27.
  - **Implementato (parziale, 1 novembre 2026):** TTL ridotto da 30 a 7 giorni; `refreshSessionIfNeeded` nell'hook `onRequest` su `/api/v1` riemette il cookie con nuova scadenza quando il token è valido e `iat` è più vecchio di 1 giorno. Gli accessi loopback senza cookie non creano sessioni.
  - **Implementato (3 novembre 2026):** revoca per-device con `jti`. Login → riga in `auth_sessions` (UA/IP, `lastSeenAt` toccato al massimo ogni 60 s); token legacy senza `jti` restano validi; token con riga revocata vale `none` subito; refresh mantiene lo stesso `jti` e sposta `expiresAt`; logout revoca il jti corrente. Route `GET /auth/sessions` e `DELETE /auth/sessions/:id` (204, cancella il cookie se è la corrente) protette da `requireDm`. Percorso UI: accordion "Dispositivi" nella console DM con elenco, badge "Questo dispositivo" e revoca delle altre sessioni.
  - **Fatto quando:** esiste un percorso di revoca per-device.

- [x] **S4 — Rate limit e limiti corpo** · S — ✅ 1 novembre 2026
  - **Problema:** l'allowList esenta tutte le GET tranne i display (export e actions incluse); `MAX_JSON_MB` è usato solo dal PUT state, mentre Fastify applica il default di 1 MB al resto.
  - **Proposta:** allowList ristretta a uploads/health/azioni in polling/SRD; rate limit su export; `bodyLimit` esplicito per import/export e rimozione di `maxJsonBytes` quando D3 elimina il PUT.
  - **Implementato:** `bodyLimit: env.maxJsonBytes` a livello di istanza Fastify, così `MAX_JSON_MB` (default 2 MB) vale per tutti i body JSON, import compreso; l'`allowList` vive in `server/src/http/rate-limit.ts` (`isRateLimitExempt`) ed esenta solo `/uploads/`, `GET /api/v1/health`, `GET /api/v1/srd*` e `GET /api/v1/campaigns/:id/actions` (polling ogni 2 s). Export, player sheet, snapshot e display lookup passano dal limite globale, che resta 300/min (100.000 in test); rate limit display e login invariati. Test: 413 `payload_too_large` oltre `MAX_JSON_MB` e unit test della allowList.
  - **Fatto quando:** export limitato e limiti documentati.

- [x] **S5 — Originali su disco** · S — ✅ 1 novembre 2026
  - **Problema:** gli originali con EXIF restano in `uploads/originals/` indefinitamente; non sono serviti, ma sono un residuo sensibile.
  - **Proposta:** non scriverli affatto (la deduplica usa l'hash nel DB) oppure `KEEP_ORIGINALS=false` di default con cleanup.
  - **Implementato:** `KEEP_ORIGINALS` (default `false`) in `AppEnv`. Con il default `storeAsset` non crea `uploads/originals/`, non scrive il buffer e salva `original_path=''`: la deduplica resta sull'hash SHA-256 nel DB. Con `true` il comportamento è quello precedente. Nessuna migrazione, gli originali già presenti non vengono cancellati. Static continua a non servire `originals/`. Test: default senza file e 404, `KEEP_ORIGINALS=true` con originale presente.
  - **Fatto quando:** il default non lascia metadati EXIF su disco.

- [x] **S6 — Codici display e URL** · S — ✅ 1 novembre 2026
  - **Problema:** il codice è salvato in chiaro e finisce in URL/history; un dump del DB espone i display attivi.
  - **Proposta:** documentare il rischio, oppure ruotare il codice alla revoca e abbreviare la validità del link; valutare hash a riposo se il DM non deve rileggerlo.
  - **Implementato:** codice portato a 8 caratteri (32^8 combinazioni) per rendere impraticabile il brute-force via `/ws?role=display&code=…`; alfabeto e CSPRNG invariati, lookup compatibile con i codici a 6 caratteri già emessi. Decisione: il codice resta in chiaro perché il DM deve poterlo rileggere e riaprire lo schermo; rischio accettato per un deploy in LAN. Test su lunghezza e alfabeto in `server/test/displays.spec.ts`.
  - **Fatto quando:** decisione registrata.

- [ ] **S7 — HTTPS e reverse proxy** · M
  - **Problema:** oggi `trustProxy: false`; dietro un proxy TLS il rate limit vedrebbe l'IP del proxy e i cookie `secure` dipendono da `PUBLIC_URL`. In LAN HTTP va bene solo su rete fidata.
  - **Proposta:** aggiungere `TRUST_PROXY` esplicito (default `false`) e configurare Fastify; documentare Caddy/nginx con `PUBLIC_URL=https://...`, `COOKIE_SECURE=true`, `ALLOWED_ORIGINS=https://...`; verificare che gli header di forwarding disattivino il bypass loopback; testare HSTS e IP reale nel rate limit.
  - **Fatto quando:** un test con header `X-Forwarded-Proto`/`X-Forwarded-For` dimostra IP e cookie corretti.

- [x] **S8 — Suite di regressione sicurezza** · M — ✅ 1 novembre 2026
  - **Proposta:** test dedicati per matrice autorizzazioni (route DM senza cookie → 401), CSWSH, rate limit login/display, header CSP/HSTS/nosniff, upload SVG/polyglot rifiutato, export senza note private di default, `originals/` 404.
  - **Implementato:** `server/test/security.spec.ts` copre la matrice DM senza sessione da IP non loopback (`X-Forwarded-For` + Host ammesso → 401 su letture e scritture), rate limit login dietro proxy (`TRUST_PROXY=1`, sesto tentativo → 429 per IP reale senza bloccare altri client), header helmet (`nosniff`, `referrer-policy`, HSTS) su `/api/v1/health`, upload non immagine e polyglot GIF+HTML → 415, export senza `playerNotes` di default e con `includePrivateNotes=true`. CSWSH, 404 su `originals/`, SVG e 5 login falliti restano coperti dai test esistenti e non sono duplicati.
  - **Fatto quando:** la suite gira in CI e fallisce su regressioni.

- [x] **S9 — Dipendenze e dati a riposo** · S — ✅ 1 novembre 2026
  - **Proposta:** `npm audit` in CI con soglia high/critical e Dependabot/Renovate; documentare backup cifrati del DB (contiene note private e link giocatore) e permessi dei file.
  - **Implementato:** script root `audit` = `npm audit --omit=dev --audit-level=high`, eseguito come step **bloccante** in CI (rimossi `continue-on-error` e il vecchio audit senza `--omit=dev`); gli avvisi moderate vengono riportati senza fermare la build, high/critical falliscono. `.github/dependabot.yml` con aggiornamenti settimanali per npm (root, workspace inclusi), `github-actions` e `docker` (raggruppa minor/patch npm). `docs/backup.md` documenta contenuto sensibile dell'archivio (DB con note private, link giocatore, upload, `.session-secret`), cifratura con 7-Zip AES-256, age o GPG, restore e permessi/archiviazione (`chmod 600/700` o ACL Windows, copia fuori sede, test di restore).
  - **Nota:** `npm audit` oggi passa con 3 moderate (`glob`/`minimatch` via `@fastify/static`); il fix richiede un downgrade breaking e non è applicato. La scansione Trivy in `release.yml` resta advisory (fuori scope di questo passo).
  - **Fatto quando:** CI controlla le dipendenze e la procedura di backup è scritta.

### Checklist "internet-ready"

- [x] S0 Origin WS + rate limit tentativi
- [x] S1 CSP `connect-src` ristretta
- [x] S2 `DM_PASSWORD_HASH` + minimo 12 caratteri
- [x] S3 TTL breve e revoca sessione (TTL 7 giorni + refresh + revoca per-device con pannello Dispositivi)
- [x] S4 AllowList GET e `bodyLimit` espliciti
- [x] S5 Nessun originale con EXIF su disco
- [x] S6 Codici display documentati e allungati a 8 caratteri
- [ ] S7 HTTPS, proxy e cookie `secure`
- [x] S8 Test di regressione sicurezza in CI
- [x] S9 Audit dipendenze e backup cifrati

## 5. Refactor god component (P2)

- [x] **R0 — Policy dimensione file: target 350, cap 400** · S — ✅ 1 novembre 2026
  - **Problema:** 18 file superano le 400 righe e mescolano responsabilità diverse; senza una soglia il problema si riforma dopo ogni split.
  - **Proposta:** regola ESLint `max-lines` a 400 (`skipBlankLines`, `skipComments`) con override temporanei per i file attuali; ogni split rimuove un override. Aggiungere `npm run files:report` per elencare i file oltre soglia; **350 righe** è il target per i nuovi file.
  - **Implementato:** `max-lines` (`error`, 400, `skipBlankLines`/`skipComments`) su `client/src/**/*.{ts,html}`, `server/src/**/*.ts`, `shared/src/**/*.ts`; override `max-lines: off` per i 12 file `.ts`/`.html` oltre il cap. Gli `.scss` non passano da ESLint e restano tracciati solo dal report. `npm run files:report` (`scripts/files-report.mjs`) elenca i file sopra il cap 400 e la fascia 350–400 in `client/src`, `server/src`, `shared/src` (`.ts`/`.html`/`.scss`, esclusi `*.spec.ts` e `dist`) con lo stesso conteggio della regola, ed è uno step CI non bloccante (`continue-on-error`).
  - **Fatto quando:** nessun nuovo file supera 400 righe; gli override esistenti scendono a zero.
  - **File in override (oltre 400 righe effettive, come `max-lines`):**

    | Righe | File | Override |
    |---:|---|---|
    | 1499 | `client/src/app/features/dm/dm-shell.page.ts` | `max-lines: off` |
    | 1168 | `client/src/app/features/dm/dm-shell.page.html` | `max-lines: off` |
    | 1055 | `client/src/app/features/scene/scene-canvas.component.ts` | `max-lines: off` |
    | 965 | `client/src/app/features/dm/dm-shell.page.scss` | solo report |
    | 887 | `client/src/app/features/maps/map-editor-canvas.component.ts` | `max-lines: off` |
    | 826 | `client/src/app/features/actor/actor-sheet.page.ts` | `max-lines: off` |
    | 745 | `shared/src/lib/sheet/validate.ts` | `max-lines: off` |
    | 655 | `client/src/app/features/maps/map-editor.page.ts` | `max-lines: off` |
    | 617 | `client/src/app/features/character/character-wizard.page.html` | `max-lines: off` |
    | 602 | `client/src/app/features/character/character-wizard.store.ts` | `max-lines: off` |
    | 460 | `client/src/app/features/character/character-wizard.page.scss` | solo report |
    | 453 | `shared/src/lib/sheet/__fixtures__/catalog.ts` | `max-lines: off` |
    | 446 | `shared/src/schemas/sheet.ts` | `max-lines: off` |
    | 408 | `client/src/app/features/maps/map-editor.page.html` | `max-lines: off` |

  - **Fascia 350–400 (nessun override: candidati al prossimo split):**

    | Righe | File |
    |---:|---|
    | 391 | `shared/src/schemas/scene.ts` |
    | 364 | `client/src/app/features/character/character-wizard.page.ts` |
    | 359 | `server/src/program/service.ts` |
    | 355 | `server/src/actions/service.ts` |

    Righe effettive = non vuote e non di solo commento, come `max-lines`; per rigenerare le tabelle: `npm run files:report`.

- [ ] **R1 — `DmShellPage`** · L · D8
  - **Proposta:** prima gli store (`CampaignShellStore`, `RegiaStore`, `SceneToolsStore`) senza cambiare il template; poi `SidebarSection`, `SceneList`, `ActorList`, `ScreenList`, `SessionCard`, `DmToolbar`, `DmStatusbar`; infine il template.
  - **Fatto quando:** tutti i file coinvolti scendono sotto 400 righe (obiettivo 350), test sugli store, E2E invariati.
  - **Stato (store Regia, 1 novembre 2026):** `RegiaStore` estratto in `regia.store.ts` (+ `regia-viewport.ts` e `regia-summary.ts`), con test su program, display e viewport; `dm-shell.page.ts` scende a 1.498 righe effettive. Restano componenti e template.
  - **Stato (R1a, 3 novembre 2026):** `SidebarSection` estratto (`sidebar-section.ts/html/scss` + spec); le 10 sezioni accordion della sidebar usano il componente, con `aria-controls`/`aria-expanded`, contatori e slot azioni invariati; stili `.accordion*` spostati dal page SCSS. Restano le liste (`SceneList`, `ActorList`, `ScreenList`, `SessionCard`) e toolbar/statusbar.
  - **Stato (R1b, 3 novembre 2026):** `SceneList` estratto (`scene-list.ts/html/scss` + spec) con input `scenes`/`activeSceneId`/`busy`, output `selectScene`/`openMapPicker`; la sezione "Scene" usa `<app-scene-list>` e "Crea scena" resta nello slot azioni; stili `.scene-actions`/`.scene-list*` spostati dal page SCSS (`.icon-button` locale per l'encapsulation). Restano `ActorList`, `ScreenList`, `SessionCard` e toolbar/statusbar.
  - **Stato (R1c, 3 novembre 2026):** `ActorList` estratto (`actor-list.ts/html/scss` + spec) con input `actors`/`campaignId`/`tokens`/`canAdd`/`readOnly`/`subtitle` e output `addActor`/`dragStart`; i conteggi token sono un `computed` per attore, la sezione "Attori" usa `<app-actor-list>` e `.available-actor*` è passato al componente (link e `.icon-button` locali per l'encapsulation). Restano `ScreenList`, `SessionCard` e toolbar/statusbar.
  - **Stato (R1d, 3 novembre 2026):** `SessionCard` (`session`/`label`/`busy` → `start`/`stop`) e `ScreenList` (`screens`/`projectionLabel`/`lastSeen` → `selectScreen`) estratti con spec; la sezione campagna usa `<app-session-card>` e "Schermi" usa `<app-screen-list>` con `regia.projectionLabel`/`regia.lastSeen`. `.session-card*` e `.screen-row__projection` vivono nei componenti, le regole di lista condivise con i dialog "Manda in onda"/"Avvia da mappa" stanno in `screen-list.shared.scss`; `.badge`/`.dock-button` sono locali per l'encapsulation. Restano statusbar.
  - **Stato (R1e, 3 novembre 2026):** `SceneToolbar` estratto (`scene-toolbar.ts/html/scss` + spec) con `SceneToolsStore` iniettato per tool/griglia, input `canUndo`/`canRedo` e output `openDice`/`exportPng`/`undo`/`redo`/`settings`/`zoomIn`/`zoomOut`/`fitMap`; il template ripete la `<nav class="scene-toolbar">` con gli stessi `aria-label`/`title`/divisori/`disabled`, e `.scene-toolbar`/`.tool`/`.tool-divider` vivono nel componente (`:host { display: contents }` per restare figlia flex della workspace). Resta la statusbar.
  - **Stato (R1f, 3 novembre 2026):** `DmStatusbar` estratto (`dm-statusbar.ts/html/scss` + spec) con input `message`/`syncStatus`/`syncLabel`/`version`/`tokenCount`/`zoomLabel`/`measureLabel`/`selectedToken`/`sessionLabel` e output `sync`; il `<footer class="statusbar">` vive nel componente con `role="status"`/`aria-live`, item di stato, token selezionato opzionale, sessione e "Riallinea", e `.statusbar*` è migrato dal page SCSS (`:host { display: contents }` per restare figlia della griglia). **Bilancio R1:** tutti i componenti previsti dalla proposta (`SidebarSection`, `SceneList`, `ActorList`, `ScreenList`, `SessionCard`, `DmToolbar`, `DmStatusbar`) sono estratti; `dm-shell.page.html` è sceso a ~950 righe e `.ts` a ~1515, quindi il criterio "<400 righe" resta aperto. Prossimi slice: dock (iniziativa/dadi/azioni), dialoghi (login/crea/scegli/fog/impostazioni/schermo) e slot personaggi.
  - **Stato (R1g, 3 novembre 2026):** `TokenList` estratto dal pannello destro (`token-list.ts/html/scss` + spec) con input `tokens`/`selectedTokenId` e output `center`/`changeHp`/`toggleVisibility`/`remove`; la sezione "In mappa" usa `<app-token-list>` con gli stessi simboli, `aria-label`/`title` e `is-selected`, e `.token-list`/`.token-row*` sono migrati dal page SCSS. E2E `phase-2`/`phase-5`/`phase-6` invariati.
  - **Stato (R1h, 3 novembre 2026):** `DmDock` estratto (`dm-dock.ts/html/scss` + spec) con tab/iniziativa/dadi/azioni, `DiceStore`/`ActionStore` iniettati e output per le azioni di pagina; `.dock*`/`.initiative*`/`.action-history*` vivono nel componente, `.initiative__actions` in `initiative-actions.shared.scss` condiviso con la pagina. `dm-shell.page.html` scende a ~854 righe, `.ts` a ~1665; restano dialoghi e slot.
  - **Stato (R1i, 3 novembre 2026):** `CharacterSlots` estratto (`character-slots.ts/html/scss` + spec) con input `slots`/`campaignId`/`readOnly`/`portraitFor`/`subtitle`/`hpRatio` e output `dragStart`/`selectActor` (`select` è vietato dalla regola `no-output-native`, stesso pattern `selectScene` di `SceneList`); il template replica la `<section class="slots">` con `role`/`tabindex`/`aria-label` e `.slots`/`.slot*` migrano dal page SCSS (`:host { display: contents }`). `dm-shell.page.html` scende a 784 righe, `.ts` a 1522, `.scss` a 442; restano i dialoghi e la logica di orchestrazione.
  - **Stato (R1j, 3 novembre 2026):** estratti `LoginDialog` (`open`/`error`/`busy` → `login`), `CreateCampaignDialog` (`open`/`busy`/`dismissible` → `create`/`closed`) e `ChooseCampaignDialog` (`open`/`campaigns`/`dismissible` → `selectCampaign`/`create`/`closed`), tutti con Signal Forms, reset all'apertura, `aria-invalid`/`aria-describedby` dopo touched e spec dedicate; `dm-shell.page.ts` perde i signal del form e `submitLogin`/`submitCampaign`, il template usa i tre componenti e `.campaign-list`/`.campaign-card*` migrano nel dialogo di scelta. Gli output `submit` e `select` sono rinominati `login`/`selectCampaign` perché vietati da `@angular-eslint/no-output-native` (precedente R1i). `dm-shell.page.html` scende a 719 righe, `.ts` a 1506, `.scss` a 411.
  - **Stato (R1k, 3 novembre 2026):** estratti `FogConfirmDialog` (`open`/`mode`/`overrideActive` → `confirm`/`dismiss`), `MapSettingsDialog` (`open`/`unit`/`brushCells`/`pencilTenths`/`brushDiameterPx`/`pencilWidthPx` → `unitChange`/`brushChange`/`pencilChange`/`clearHistory`/`resetFog`/`closed`) e `TakeTargetDialog` (`open`/`screens`/`projectionLabel` → `take`/`dismiss`) con spec dedicate; titolo/testo fog, markup impostazioni e righe schermo invariati, `screen-list.shared.scss` riusato dal target. Gli output `cancel` e `close` sono rinominati `dismiss`/`closed` perché vietati da `@angular-eslint/no-output-native` (precedente R1i/R1j); `dm-shell.page.ts` perde gli handler `setMeasurementUnit`/`setBrushCells`/`setPencilTenths`. `dm-shell.page.html` scende a 679 righe, `.ts` a 1641.
  - **Stato (R1l, 3 novembre 2026):** estratti `MapPickerDialog`, `PrepareSceneDialog` e `ScreenViewerDialog` con spec; il viewer inietta `RegiaStore` e possiede zoom/pan/reset/close (metodi rimossi dal page), picker e prepare mappano input/output 1:1. `.screen-viewer*`/`.prepare-list` migrati, `.screen-list.shared.scss` include anche il badge accent per i dialog. `dm-shell.page.html` scende a 579 righe, `.ts` a 1612, `.scss` a 440. Restano solo i frammenti di orchestrazione nel page.
  - **Stato (R1m, 3 novembre 2026):** `DmLayoutStore` (`dm-layout.store.ts` + spec) estrae `leftOpen`/`rightOpen`/`dockOpen`/`dockTab`/`sections` con `SidebarSectionId`/`DEFAULT_SECTIONS`/`toggle*`/`setDockTab`/`restore`/`persist` (`dnd-vtt:panels:<id>`, fallback ai default su payload assente o corrotto); il page inietta lo store, espone alias readonly alle signal e delega i toggle, mentre `restore`/`persist` sostituiscono `restorePanels`/`persistPanels`; il tab del dock è persistito per non tornare a iniziativa al cambio scena. `dm-shell.page.ts` scende a 1547 righe (579 HTML, 440 SCSS). E2E `phase-2`/`phase-6` verdi (16/16).
  - **Stato (R1n, 3 novembre 2026):** `DmUiStore` (`dm-ui.store.ts` + spec) estrae `statusMessage`/`notice`/`busy`/`selectedTokenId`/`zoom` con patch helper; `DmSessionStore` (`dm-session.store.ts` + spec) estrae `sessionSeconds`/`sessionBusy`/`sessionLabel` con `sync`/`start`/`stop`/`stopTimer` e timer interno fermato alla distruzione. Il page inietta `ui`/`session`, espone alias readonly, delega `sync` all'ingresso campagna e rimuove timer e metodi sessione; il template resta invariato salvo i binding `start`/`stop` verso lo store.
  - **Stato (R1o, 3 novembre 2026):** `DmAuxStore` (`dm-aux.store.ts` + spec) estrae `aiEnabled`/`aiMessage`/`aiText`/`aiBusy`/`aiPreview`/`aiName`/`includePrivateNotes` con `load`/`analyze`/`createMonster`/`export`/`import` e i setter; il page inietta `aux`, espone alias readonly, delega gli handler e `enterCampaign` carica lo stato IA dallo store. Export/import invariati (Blob + download, parse JSON, `addCampaign`/`enterCampaign` nel page); `dm-shell.page.ts` scende a 1438 righe (579 HTML, 440 SCSS). E2E `phase-2`/`phase-7`/`phase-8` verdi (15/15).
  - **Stato (R1p, 3 novembre 2026):** `SceneTokensStore` (`scene-tokens.store.ts` + spec) estrae token e iniziativa (`send`, hp, select/remove/visibilità, move/drop/spawn, roll/next/sort/end/setInitiative) con `focusRequest`/`consumeFocus`; il page delega, consuma il focus in un `effect` verso il canvas e mantiene `centerToken`. `dm-shell.page.ts` scende a 1323 righe. E2E `phase-4`/`phase-5`/`phase-6` verdi (13/13).
  - **Stato (R1q, 3 novembre 2026):** `SceneFogStore` (`scene-fog.store.ts` + spec) estrae fog, griglia e history (`toggleDoor`/`toggleLight`/`toggleVision`, `changeGridType`/`changeGridSize`, `clearHistory`/`resetFog`, fog apply/drawing, `revealAll`/`hideAll`/`confirm`/`clearOverride`/`cancel`, `undoLast`/`undoThrough`/`redoLastBatch`) con `state`/`grid`/`sceneDoors`/`sceneLights`/`fogOverrideActive`/`undoneActions`/`lastAppliedAction`/`canUndo`/`canRedo`; il page inietta `fog`, espone alias readonly e delega i metodi. `dm-shell.page.ts` scende a 1192 righe.
  - **Stato (R1r, 3 novembre 2026):** `DmCampaignStore` (`dm-campaign.store.ts` + mapper + spec/fixtures) estrae autenticazione iniziale, apertura/scelta/creazione campagna, ingresso, cambio scena, `loadMapAsset`, creazione scena, map picker e preparazione scena; il page inietta `campaign`, espone alias e delega. `reset()` allo destroy evita stato stantio tra sessioni. `dm-campaign.store.ts` 393 righe, `dm-shell.page.ts` 913. E2E `phase-2`/`phase-3b`/`phase-4`/`phase-9` verdi (20/20).
  - **Stato (R1s, 3 novembre 2026):** `DmScreensStore` (`dm-screens.store.ts` + spec) estrae `takeTargetOpen`, apertura display, scelta target, invio scena con `startView` e blackout; `DmCanvasController` (`dm-canvas.controller.ts` + spec, injectable root) espone `attach`/zoom/fit/export e propaga camera/misura agli store. Il page inietta entrambi, collega il canvas nel costruttore, mantiene alias e metodi omonimi per il template invariato. `dm-screens.store.ts` 119 righe, `dm-canvas.controller.ts` 56, `dm-shell.page.ts` 874. `npm run check` verde; E2E `phase-4`/`phase-7`/`phase-9` verdi (12/12).
  - **Stato (R1t, 3 novembre 2026):** `DmRightSidebar` estratto (`dm-right-sidebar.ts/html/scss` + spec) con pannello "Scena", sezioni token/schermi/dispositivi (`@defer` on idle), `DmLayoutStore`/`RegiaStore`/`SceneTokensStore`/`DmUiStore` iniettati e `persistActive()`/`center(token)` aggiunti agli store; `.dm-panel`/`.panel-head`/`.panel-toggle` condivisi in `dm-panel.shared.scss`. `dm-shell.page.ts` perde alias/metodi del pannello destro (`toggleRight`, `centerToken`, `changeTokenHp`, visibilità/rimozione) e scende a 844 righe, `dm-shell.page.html` a 522, `.scss` a 357; `dm-right-sidebar.ts` 65, `.html` 62, `.scss` 20. `npm run check` verde; E2E `phase-2`/`phase-5`/`phase-7` verdi (15/15).
  - **Stato (R1u, 3 novembre 2026):** `DmLeftSidebar` estratto (`dm-left-sidebar.ts/html/scss` + spec) con campagna, scene, griglia, fog, scenografia, attori e AI; `changeAdvancementMode` in `DmCampaignStore`, helper `dm-actor.ts`, `skeleton.shared.scss`. `dm-shell.page.html` scende a 264 righe, `.scss` a 237, `.ts` a 635. E2E `phase-2`/`phase-3b`/`phase-5`/`phase-6` verdi (21/21).
  - **Stato (R1v, 3 novembre 2026):** `DmViewStore` (`dm-view.store.ts` + spec) estrae computed di vista (slots, doors, visionGrid, label, portraitFor, ecc.); `DmKeyboardController` (`dm-keyboard.controller.ts` + spec) sposta Ctrl/Cmd+Z/Y con attach/detach. `dm-shell.page.ts` scende a 519 righe; resta solo la facciata della pagina.
  - **Stato (R1w, 3 novembre 2026):** rimossi i metodi delegati della pagina e il template chiama direttamente gli store (`campaign.*`, `tokensStore.*`, `fog.*`, `screens.*`) passando `campaign.activeScene()`; i metodi di `SceneTokensStore` che ricevevano `Scene` ora accettano `Scene | null` e fanno no-op come già faceva `SceneFogStore`. Restano i wrapper con logica extra (`enterCampaign`, `login`, `setDockTab`, `openSettings`/`closeSettings`, `clearHistory`/`resetFog` che chiudono il dialog, `selectActor`, `onActorDragStart`, `toggleDock`, `syncNow`, `openCreate`/`openChoose`/`close*`) e quelli del canvas. `dm-shell.page.ts` 378 righe (<400), HTML 264, SCSS 237. `npm run check` verde; E2E `phase-2`/`phase-4`/`phase-5`/`phase-6`/`phase-9` verdi (26/26).


- [x] **R2 — `SceneCanvasComponent`** · L
  - **Proposta:** `KonvaStageService`, `MapLayerRenderer`, `GridRenderer`, `FogRenderer`, `TokenRenderer`, `CanvasInputController`; la matematica resta in `shared`.
  - **Fatto quando:** ogni renderer è testabile in isolamento e nessun file supera 400 righe.
  - **Stato (R2a, 1 novembre 2026):** `GridRenderer` estratto in `grid-renderer.ts` con test dedicati (quadrata, esagonale, visibilità, clip); `scene-canvas.component.ts` scende a 1.458 righe effettive. Restano mappa, fog, token e input.
  - **Stato (R2b, 1 novembre 2026):** `FogRenderer` estratto in `fog-renderer.ts` con test su base hidden/revealed, visione a celle, operazioni manuali, draft, lazo e pulizia layer; il componente conserva visione, input e orchestrazione e scende a 1.381 righe effettive. Restano mappa, token e input.
  - **Stato (R2c, 1 novembre 2026):** `TokenRenderer` estratto in `token-renderer.ts` con test su token senza/con ritratto, nascosto, selezione, label/PF e draggable; il componente conserva stage, input, visione, orchestrazione e collegamento degli handler, e scende a 1.197 righe effettive. Restano mappa e input.
  - **Stato (R2d, 1 novembre 2026):** `MapLayerRenderer` estratto in `map-layer-renderer.ts` con test su immagine singola, tile/LOD scelto, preview, fallback e caricamento fallito; il componente conserva stage, cache immagini, input e orchestrazione, e scende a 1.112 righe effettive. Resta l'input.
  - **Stato (R2e, 1 novembre 2026):** `SceneCamera` estratto in `scene-camera.ts` con test su fit, limiti di zoom, zoom verso un punto, pan, viewport salvato e conversioni schermo↔mondo; il componente delega camera/zoom/pan/fit e conserva stage, layer, input e renderer, e scende a 1.089 righe effettive. Resta l'input.
  - **Stato (R2f, 2 novembre 2026):** `CanvasInputController` estratto in `canvas-input-controller.ts` con test su wheel verso il puntatore, limiti di zoom, pan centrale/destro con pointer capture, drag pan e detach; il componente delega i gesti camera e conserva stage, layer, tool, fog/misura/token, e scende a 1.055 righe effettive.

- [x] **R3 — `ActorSheetPage`** · M
  - **Proposta:** `SheetHeader`, `SheetTabs`, `CombatPanel`, `SpellPanel`, `InventoryPanel`, `NotesPanel`, `PortraitEditor`, `LevelUpDialog`, `PlayerLinkPanel`.
  - **Fatto quando:** la pagina orchestra solo input/output e nessun file supera 400 righe.
  - **Stato (R3a, 2 novembre 2026):** `ActorSheetCombatPanel` estratto in `actor-sheet-combat-panel.*` con input (`conditions`, `character`, `busy`, `restBusy`) e output (`hpPatch`, `conditionAdd`, `conditionToggle`, `deathSave`, `hitDice`, `rest`); la pagina conserva handler/HTTP (con `addCondition` idempotente) e proietta il blocco Risorse. Test dedicati su rendering, emit e stati busy. Restano header, tab e gli altri pannelli.
  - **Stato (R3b, 2 novembre 2026):** estratti `ActorSheetSpellPanel` (`slots`, `pactSlots`, `spells` → `slotChange`, `pactSlotChange`), `ActorSheetInventoryPanel` (`items`, `currency`) e `ActorSheetNotesPanel` (`notes`, `saving`, `saved` → `notesChange`, `save`); la pagina conserva handler/HTTP e proiezione (metadati incantesimi, gittate, valuta). Test dedicati su rendering, emit e stati vuoti/salvataggio. Restano header, tab, editor ritratto, level-up e player link.
  - **Stato (R3c, 2 novembre 2026):** estratti `ActorSheetPortraitEditor` (`url`, `focusX`, `focusY`, `zoom`, `busy` → `upload`, `focusChange`, `zoomChange`, `save`), `ActorSheetLevelUpDialog` (`form`, `preview`, `error`, `busy`… → `formChange`, `previewRequest`, `confirmRequest`, `closed`) e `ActorSheetPlayerLink` (`url`, `editing`, `busy`, `error` → `copyRequest`, `toggleEditing`); la pagina conserva handler/HTTP e proiezione. Test dedicati su rendering, emit e stati vuoti/busy/errore. `actor-sheet.page.html` scende sotto il cap e esce dall'override `max-lines`; restano header e tab.

## 6. CSS e UI (P2)

- [x] **C1 — Scala dei raggi** · S — ✅ 2 novembre 2026
  - **Proposta:** `control` = `--radius-sm`, card = `--radius-md`, overlay = `--radius-lg`; rimuovere gli override locali.
  - **Fatto quando:** nessun `border-radius` hardcoded fuori dai token.
  - **Esito:** `.surface` e i pannelli usano `--radius-md`; controlli, field e pulsanti `--radius-sm`; dialog/overlay `--radius-lg`; rimossi gli override `field`/`control`/`button-base` con `--radius-md`. Restano solo pill `999px` e cerchi `50%` per forma, non per raggio.

- [x] **C2 — Catena `:host`/fill-height** · S — ✅ 2 novembre 2026
  - **Proposta:** usare `mx.fill-height` sui `:host` di pagina; rimuovere `@mixin fill-height` da `_layout.scss` se resta inutilizzato.
  - **Fatto quando:** tutte le route hanno altezza coerente.
  - **Esito:** `dm-shell`, `character-wizard`, `actor-sheet` e `actor-wizard` usano `mx.fill-height`; rimosso il duplicato morto da `_layout.scss` (resta il mixin attivo in `_mixins.scss`).

- [x] **C3 — Animazioni, motion e hover** · S — ✅ 2 novembre 2026
  - **Proposta:** `_animations.scss` con `shimmer`/`spin`; `prefers-reduced-motion` globale; hover solo dentro `@media (hover: hover)`.
  - **Fatto quando:** spinner, dado e skeleton rispettano la preferenza.
  - **Esito:** keyframes centralizzati in `_animations.scss` (rimossi dai componenti), regola globale `prefers-reduced-motion` per animazioni/transizioni, mixin `mx.hover` applicato a tutti gli stati hover.

- [x] **C4 — Ultimi colori hardcoded** · S — ✅ 2 novembre 2026
  - **Proposta:** sostituire i residui `#hex`/`rgb()` con `--editor-*`, `--overlay-*`, `--fog-color`; fallback solo nei default TS del canvas.
  - **Fatto quando:** grep senza literal nelle feature SCSS.
  - **Esito:** `screen-viewer` e `screen-preview` usano `--display-bg` (rimosso il fallback `#000`); la maschera
    del ritaglio ritratto usa il nuovo token `--overlay-scrim` (28% nero). Nessun `#hex`/`rgb()` residuo nelle
    SCSS delle feature; i default TS dei canvas non sono stati toccati.

- [x] **C5 — `display: contents` documentato** · S — ✅ 2 novembre 2026
  - **Proposta:** commento in `dialog.scss`/`dice-overlay` e test che `aria-labelledby` continua a funzionare.
  - **Fatto quando:** il motivo è scritto accanto alla regola.
  - **Esito:** commento accanto ai due `:host` (nessuna scatola nel flusso/flex del genitore); `dialog.spec.ts`
    già copriva `aria-labelledby`, aggiunto `dice-overlay.component.spec.ts` che verifica la catena
    overlay → dialog → titolo.

- [x] **C6 — Container query** · M · B3 — ✅ 3 novembre 2026
  - **Decisione:** non adottate. Il layout usa classi di larghezza esplicite e grid/flex; le media query centralizzate bastano. Requisito rimosso da `PLAN.md` con motivazione.

- [x] **C7 — Accessibilità canvas** · M — ✅ 2 novembre 2026
  - **Proposta:** `role="img"` + `aria-label` descrittivo sullo stage, scorciatoie tastiera per pan/zoom/selezione, conferma esplicita per azioni distruttive.
  - **Fatto quando:** le azioni principali sono raggiungibili da tastiera e testate.
  - **Esito:** scene e map editor hanno host `role="img"`, `tabindex="0"`, `aria-label` con strumento e scorciatoie;
    `canvas-keyboard.ts` centralizza frecce (pan), `+`/`-` (zoom) ed `Esc` (deselezione), ignorando i campi
    editabili. `Delete` nel map editor resta sulla pagina (`removeSelected()`), documentato nel componente.

## 7. Tooling e allineamento al piano (P2)

- [x] **T1 — `max-len` a 110** · S · D6
  - **Proposta:** commit separato di sola formattazione (`eslint --fix`), poi abbassare la regola.
  - **Fatto quando:** `max-len` 110 senza modifiche funzionali.

- [x] **T2 — `PLAN.md`: registrare l'adozione di B** · S · D5 — ✅ 3 novembre 2026
  - **Proposta:** aggiungere al piano una sezione "stato migrazione" con B1–B5 e i criteri di uscita; gli obiettivi del piano restano validi, non vanno riscritti.
  - **Esito:** aggiunta la sezione 21 con lo stato reale: Signal Forms, `resource()`/`httpResource()` e `@defer` **non ancora adottati** (B1–B5 tutte aperte). Annotate le affermazioni contraddette: `PUT /scenes/:id/state` rimosso (A2/D3), `uuid v7` solo server, snippet `check` e `tsconfig` allineati. Verificati e confermati `max-len` 110 e budget 700 kB/1.2 MB.

- [x] **T3 — Pulizia configurazioni** · S — ✅ 3 novembre 2026
  - **Proposta:** verificare dipendenze duplicate (`jsdom` root/client), mixin morti, budget e `tsconfig`; rimuovere ciò che non è usato.
  - **Esito:** `jsdom` rimosso dal root (resta solo in `client`, dove serve al runner); rimossi i mixin morti `row` e `panel`; `_layout.scss`/`grid-12` restano usati. `tsconfig`, budget e `npm ls` verificati; nessun file sorgente morto (i tre CLI sono entrypoint). Test client con `isolate: true` (i mock di `konva` non si contaminano più tra file, eliminando un flake latente).

## 8. Migrazione B — Signal Forms, `resource()`, `@defer` (P1/P2)

> D5 = **B**. Il piano non va riscritto: va eseguito a tappe, con misurazioni e senza bloccare l'architettura realtime già attiva.

- [x] **B1 — Spike e prerequisiti** · S — ✅ 3 novembre 2026
  - **Proposta:** verificare nella versione Angular 22.2.4 lo stato di Signal Forms (`@angular/forms/signals`), l'adattatore Standard Schema/Zod e `resource()`/`httpResource()`. Reintrodurre `@angular/forms` come dipendenza diretta: oggi è presente in `node_modules` solo come residuo. Fare un PoC su un form piccolo (`dice-overlay`) con test.
  - **Fatto quando:** decision record con API confermate e PoC verde.
  - **Esito:** `@angular/forms` 22.2.4 (stessa versione di `@angular/core`) aggiunto al client; entrypoint `@angular/forms/signals` verificato nelle typings installate (`@publicApi 22.0`). PoC su `dice-overlay`: modello `form(signal({ formula }))`, `required` + `validate` con `parseFormula` condiviso, submit via `submit()`; direttiva reale `[formField]`. `validateStandardSchema` provato con `diceRollRequestSchema.shape.formula` (Zod 4.6.7), `resource()` verificato con cambio `params`, `@defer` verificato con rendering esplicito. API, limiti e raccomandazioni in `docs/b1-signal-forms-spike.md`. Test: `b1-spike.spec.ts` e `dice-overlay.component.spec.ts`.

- [x] **B2 — `resource()` sui servizi di lettura** · M — ✅ 3 novembre 2026
  - **Proposta:** inventariare `campaign.service`, `actor.service`, `scene.service`, `srd-catalog.service` e `program.service`; usare `resource({ params, loader })` o `httpResource` per le letture, lasciando le mutazioni nei servizi. Integrare `status()`/`error()` con `ErrorHandler`/toast (A4) e con gli store.
  - **Fatto quando:** le letture principali hanno loading/error uniformi; test su cambio scena e race condition.
  - **Esito:** nuovo helper `client/src/app/core/read-resource.ts` (`readResource<T, P>`) su `resource()` con params reattivi (`undefined` = idle), `value`/`status`/`error`, `isLoading`/`isIdle`/`hasError`, `reload`, deduplica dei toast per stato+messaggio (un retry con una nuova `HttpErrorResponse` non duplica) e nessun passaggio dall'`ErrorHandler` per gli errori HTTP, che restano tradotti nel toast contestuale; gli errori non-HTTP restano al `GlobalErrorHandler`. Migrati `SrdCatalogService` (forkJoin + `srdCatalogSchema.parse`, `load()` idempotente e `catalog`/`loading`/`error` con `httpMessage`), la lista attori di `MapEditorPage` (params = `campaignId` della mappa) e `SceneStore.load` (`requestedSceneId` come params, `reload()` sulla stessa scena, stato/azioni ottimistiche invariati, risposte superate scartate). Test in `read-resource.spec.ts` (idle, caricamento, errore HTTP+toast, errori non-HTTP, cambio params, risposta vecchia scartata, retry senza toast duplicato), `srd-catalog.service.spec.ts`, map editor sul cambio campagna e `scene.store.spec.ts` (404, cambio scena con risposta vecchia, reload). Restano da migrare le letture di campaign/program.


- [x] **B3 — `@defer` sui componenti pesanti** · M — ✅ 3 novembre 2026
  - **Proposta:** applicarlo a pannelli editor mappa, pannelli console, tab della scheda e step dei wizard; aggiungere `@placeholder`/`@loading`/`@error` e prefetch `on idle` dove serve. Misurare il bundle con `ng build --stats-json` prima/dopo.
  - **Fatto quando:** bundle iniziale misurato e ridotto, E2E aggiornati.
  - **Esito:** misura con `ng build --stats-json` prima/dopo. Il guadagno principale viene dal barrel `shared`: un export dedicato `@dnd-vtt/shared/id` (usato da `ToastService`) più `sideEffects: false` toglie Zod e i locale dal chunk iniziale. Bundle iniziale **801.01 kB → 299.87 kB** (-63%), poi 308.95 kB (+9 kB di runtime defer). `@defer` applicato a: dado (`when diceOpen()`, prefetch idle, `@placeholder` nascosto + `@loading`), anteprima schermo (`on immediate`), pannelli incantesimi/equipaggiamento/note della scheda (`on immediate`) e dialog livello (`when levelUpOpen()`, prefetch idle, placeholder nascosto). Ritratto e link giocatore restano eager per evitare layout shift above-the-fold. Route ridotte: dm-shell 191 → 123 kB, actor-sheet 71 → 54.65 kB; dado (68.55 kB) e pannello incantesimi (4.93 kB) in chunk separati. E2E mirati fase 3b/5/7/8 (11/11) e axe (4/4) verdi; nessun warning di budget.

- [ ] **B4 — Signal Forms, form per form** · L — in corso
  - **Proposta:** ordine `dice-overlay` (fatto in B1) → inspector editor mappa → editing `actor-sheet` → `actor-wizard` → `character-wizard`. Riusare la validazione di dominio in `shared`, senza duplicarla nel template.
  - **Dipende da R1–R3:** i form dentro i god component vanno migrati dopo lo split, per non riscriverli due volte.
  - **Fatto quando:** i form migrati usano `form()`/field signal, hanno test su validazione, dirty/touched, submit e accessibilità.
  - [x] **B4a — Dialog "Nuova mappa"** — ✅ 3 novembre 2026: modello unico, `form()`/`[formField]`, required/blank/max 120, preset valido, orientamento coerente; `submit()` blocca l'invalid, errori server nel dialog, aria dopo touched; test su vuoto, blur/a11y, dirty/touched, max 120, submit e cambio preset reattivo.
  - [x] **B4b — Note della scheda** — ✅ 3 novembre 2026: `form()` con `maxLength` 20000, textarea con `[formField]`, contatore caratteri, `aria-invalid`/`aria-describedby` dopo touched; `saveNotes()` mantiene `patchSheet`/`patchActor` esistenti. Test su valore iniziale, modifica, limite, dirty/touched e a11y.
  - [x] **B4c — Dialog level-up** — ✅ 3 novembre 2026: `levelUpModel` + `form()` con validazione `hpRoll` (min 1, max dado quando `hpMethod === 'roll'`) e sottoclasse obbligatoria quando serve; `FieldTree` passato al dialog, `[formField]` su metodo/tiro/sottoclasse/talento/ASI, `reset()` all'apertura e rimozione di `setLevelUpForm`/`formChange`. Test su valore iniziale, cambio metodo/tiro, dirty/touched, validazione, preview/confirm e a11y.
  - [x] **B4d — Actor wizard** — ✅ 3 novembre 2026: modello unico `ActorWizardFormModel` con `form()`; `[formField]` su identità, taglia, HP/CA/velocità, lingue, note, caratteristiche e sensi; validazione nome/hp/ac/speed, `reset()` in init/import SRD, conversione unità mantenuta; liste tratti/azioni/reazioni ancora signal. Test su nome vuoto/blank, hp/ac/speed, payload, import e a11y; E2E fase 3b 3/3.
  - [x] **B4e — Character wizard** — ✅ 3 novembre 2026: `character-identity-form.ts` con modello `{ name, alignment, notes }`, `form()` required/max 120/max 120/max 20000 e `syncCharacterIdentity` (effect guardati form→store e store→form con letture `untracked`, così reset/restore non si sovrascrivono). Step identità e dettagli usano `[formField]` con `aria-invalid`/`aria-describedby` dopo touched ed errori `role="alert"`; `canSave` unisce build valida, form valido e nome non vuoto, il salvataggio resta sullo store. Test su nome vuoto/limiti, dirty/touched, sync su restore/reset e a11y; E2E fase 3b e 2 (12/12).
  - [x] **B4f - Inspector editor mappa** - ✅ 3 novembre 2026: `map-properties.form.ts` con `form()` per nome/note/fogBase/griglia/terreno, validatori (nome, note, cella 16–400, piedi ≥ 0.5, vista ≥ 1 e ≤ max, offset finiti), `[formField]` sui campi live, commit a comandi history al `change`, `effect` doc→form per undo/load, vision disabilitata fuori dalla griglia quadrata, errori `role="alert"` e `.field-error` a tutta larghezza. Wall/light/spawn restano a handler transiente. Test su validatori e commit/undo; E2E fase 4/6/9 (15/15).
  - **Stato:** completato con B1 (dado), B4a (nuova mappa), B4b (note), B4c (level-up), B4d (actor wizard), B4e (identità character wizard) e B4f (inspector mappa). Restano fuori solo input non-form: wall/light/spawn transient e selettori di stato (il testo AI è passato a Signal Forms in B5b).

- [ ] **B5 — Pulizia finale** · S
  - **Proposta:** rimuovere stato form manuale e handler ridondanti; aggiornare `PLAN.md` allo stato "adottato".
  - **Fatto quando:** non restano form legacy nei componenti migrati.
  - [x] **B5b — `DmAiPanel` con Signal Forms** — ✅ 3 novembre 2026: estratto `dm-ai-panel.ts/html/scss` con modello `{ text, name }` (`maxLength` 20000/120) e `[formField]`; sync bidirezionale guardata con `DmAuxStore` (`setText`/`setName` form→store, reset del testo pulito da `createMonster` store→form), `aria-invalid`/`aria-describedby` dopo touched ed errori `role="alert"`. `dm-left-sidebar` usa `<app-dm-ai-panel />` e perde `analyzeStatblock`/`createParsedMonster`/`setAiText`/`setAiName`. Spec dedicata su sync, pulsante disabilitato, limiti e a11y; E2E fase 2/7 verdi (13/13).

## 9. Distribuzione (D9) — **Docker scelto**

### Opzioni

| Opzione | Pro | Contro |
|---|---|---|
| **A. Solo sorgente** | nessun artefatto da mantenere; massima trasparenza per chi sviluppa | richiede Node 26, build nativa (`better-sqlite3`, `sharp`), migrazioni e `.env` a mano; UX scarsa per chi vuole solo giocare |
| **B. Docker Compose** | ambiente riproducibile, un comando, volumi per DB/upload, upgrade versionato, multi-arch | richiede Docker; immagine ~250–400 MB per le dipendenze native; permessi volume e backup da documentare |
| **C. App desktop (Electron/Tauri)** | doppio click, niente terminale | non risolve display e link giocatore multi-dispositivo; duplica il server; manutenzione alta |
| **D. Client statico + API separati** | CDN per il client | complica CORS, CSP, WebSocket e auth; in LAN perde il vantaggio same-origin; due deploy da coordinare |

### Raccomandazione

**B + A**: Docker Compose per chi usa il VTT, sorgente npm per sviluppo e contributi. Un solo container Fastify che serve anche il client compilato mantiene same-origin, semplifica CSP/WebSocket e riduce i pezzi da configurare.

Struttura proposta:

- `Dockerfile` multi-stage su `node:26-bookworm-slim` (glibc, prebuild di `sharp`/`better-sqlite3`), runtime non-root.
- Entrypoint: migrazioni automatiche con `dist/db/migrate-cli.js`, poi `node dist/index.js`; seed demo opzionale.
- `docker-compose.yml` con volume `./data:/app/data` (DB, upload e `.session-secret`), healthcheck su `/api/v1/health`, `restart: unless-stopped`, `no-new-privileges`.
- Profilo `tls` opzionale con Caddy per S7, così la LAN può passare a HTTPS senza cambiare l'app.
- CI che pubblica su GHCR multi-arch (amd64/arm64), con tag semver e `latest`; scansione Trivy/SBOM.
- Documentazione `docs/deploy-docker.md`, `docs/backup.md`, `docs/upgrade.md`.

**Non consiglio** Electron/Tauri: il VTT è multi-dispositivo per natura (DM, display, telefoni dei giocatori) e un'app desktop non risolve la distribuzione del server. Non consiglio nemmeno di separare client statico e API: in LAN il same-origin è un vantaggio, non un limite.

### Registry: GHCR

Il repository è già su GitHub (`github.com/dardino/dnd-vtt`), quindi **GitHub Container Registry** è la scelta naturale:

- immagine `ghcr.io/dardino/dnd-vtt`, **package pubblico** (il repo è pubblico, quindi il pull resta anonimo);
- piattaforme `linux/amd64` e `linux/arm64`;
- autenticazione nelle Actions con `GITHUB_TOKEN`, senza secret aggiuntivi;
- multi-arch OCI, SBOM e provenance con `docker/build-push-action`;
- nessun rate limit di pull paragonabile a Docker Hub;
- retention e visibilità gestite dal package GitHub.

Tag proposti: `latest` per l'ultima stabile, `vX.Y.Z` immutabile per le release, `edge` o `sha-<short>` per `main`. Docker Hub resta un'alternativa solo se serve discoverability pubblica; un registry locale ha senso solo per LAN air-gapped.

### Hardware: attenzione al Pi 1

Il **Raspberry Pi 1 è ARMv6 a 32 bit**: non può eseguire un'immagine `arm64`. Node 26 non ha build ufficiali per ARMv6 e `sharp`/`better-sqlite3` non hanno prebuild affidabili; adattare l'immagine sarebbe un lavoro instabile e fuori standard. Quindi:

- **server:** PC/NAS `amd64` (Docker Desktop su Windows va bene) oppure Pi 4/5 `arm64` con almeno 2–4 GB;
- **display:** il Pi 1 può fare da client browser, ma è "best effort": Angular + Konva su 700 MHz e 512 MB vanno testati a 720p in kiosk mode. Se non regge, meglio un Pi 4/5/Zero 2 W o un client display leggero dedicato.

Verifica sul dispositivo:

```sh
uname -m        # armv6l = Pi 1; armv7l = 32-bit; aarch64 = 64-bit
cat /proc/cpuinfo | grep -i model
```

Se esce `armv6l`, il target `arm64` non è utilizzabile su quella macchina. Se esce `aarch64`, l'immagine `linux/arm64` va bene.

### Ruoli nella LAN

| Ruolo | Dove | Note |
|---|---|---|
| Server | PC Windows con Docker Desktop (confermato) | volume persistente per DB/upload; porta 3000 o 80/443 con Caddy |
| Display | Raspberry Pi 1 in browser kiosk | test rimandato a "poi"; se lento/vecchio, hardware più recente o client leggero |
| Giocatori | telefoni/tablet in browser | link `/play/:token` |

### Da fare dopo D9

- [x] Compilare anche `migrate-cli`/`seed-cli` in `tsup` (`dist/db/migrate-cli.js`, `dist/db/seed-cli.js`).
- [x] Dockerfile + `.dockerignore` + entrypoint.
- [x] Compose base e profilo TLS Caddy.
- [x] Workflow CI per GHCR multi-arch + scan, con tag `latest`/`vX.Y.Z`/`edge`/`sha-<short>`.
- [x] Visibilità del package: pubblico (coerente con D9); retention lasciata al default GitHub, da rivedere quando crescono le release.
- [x] Documentare requisiti hardware (arm64, RAM minima) e verifica `uname -m`.
- [ ] Validare `/display/:code` su Pi 1: versione Chromium, avvio Angular, kiosk a 720p. Se browser troppo vecchio o fps inaccettabili, valutare un renderer display leggero o hardware diverso.
- [x] Preferire un **named volume** per `/app/data` su Windows (SQLite su bind mount può avere locking lento); documentare il backup.
- [x] Documentare host server, IP LAN, firewall e `PUBLIC_URL`/`ALLOWED_ORIGINS`.
- [x] Documentare backup, restore e upgrade delle migrazioni.

> **Nota D9 (1 novembre 2026):** l'immagine **non è stata verificata con `docker build` in questo ambiente** (Docker assente). Sono stati eseguiti `npm run check` (lint, typecheck, test, build, `db:check`, `check:bundles`) e l'ispezione statica di `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `deploy/Caddyfile`, `.github/workflows/release.yml` e degli script. La prima build multi-arch va validata su Docker Desktop (o in CI) prima di considerare la release affidabile. Restano aperti: validazione display su Pi 1 e resa bloccante della scansione Trivy (follow-up, oggi advisory).


## 10. Modello risoluzione e sfondo (P1)

Design: `docs/scene-resolution-background-design.md`. Passi 1–2 completati nel commit `a41abe8`.

- [x] **SR1 — Schema preset e backgroundTransform**
  - `sceneDimensions`, `SCENE_PRESETS`, `backgroundTransformSchema`, `imageAssetId` opzionale, `backgroundTransform` in map/scene/public scene.
- [x] **SR2 — Migrazione e persistenza**
  - migrazione `0008_past_vin_gonzales.sql`, mapper/repository/export/import, copia mappa→scena, dimensioni scena immutabili.
- [x] **SR3 — UI creazione e sfondo** — ✅ 3 novembre 2026
  - dialog mappa/scena con preset e orientamento; upload/rimozione, cover, drag e scala; nessun cambio di `widthPx/heightPx`.
  - [x] **SR3b — Controlli sfondo nell'editor**: Carica/Sostituisci, Rimuovi, Adatta cover; nessun cambio di `widthPx/heightPx`.
- [x] **SR4 — Rendering con trasformazione** — ✅ 2 novembre 2026
  - `SceneCanvasComponent`, `DisplayLayerComponent` e canvas editor disegnano lo sfondo a `x/y/scale` clippato alla scena.
- [x] **SR5 — Downscale e asset** — ✅ 2 novembre 2026
  - ridimensionamento server-side secondo `f = min(1, scene.width/asset.width, scene.height/asset.height)`; sostituzione asset solo se esclusivo, altrimenti derivato; `newScale` per preservare la resa.
  - **Stato:** downscale fatto — `putMap` asincrono riduce il WebP con `sharp` secondo
    `f = min(1, widthPx/asset.width, heightPx/asset.height)`, crea un asset derivato con `storeAsset`,
    aggiorna `imageAssetId` e `backgroundTransform.scale = scale/f`, senza toccare `widthPx/heightPx`.
  - **Stato:** replace-in-place completato — dopo il downscale l'asset precedente viene eliminato
    (riga + WebP/preview/thumb/tile/originale) solo se non più referenziato da mappe, scene, attori o programmi
    (`countAssetReferences`); se condiviso resta intatto. Cleanup file in `deleteAssetFiles` con path
    validati dentro `uploadDir`. Test in `server/test/maps-downscale.spec.ts`.
- [x] **SR6 — Background nella history P3** — ✅ 2 novembre 2026
  - `replaceBackground` copre attach/remove/transform di asset e trasformazione; nessun aggiornamento di
    `widthPx`/`heightPx` nella history.
- [x] **SR7 - Immutabilità completa**
  - PUT mappa non deve cambiare `widthPx/heightPx`; test e validazione.

---
## Sequenza consigliata

1. **S0, D9, A1-A3**: completati; A4 ha toast/ErrorHandler ma restano mappature locali.
2. **R1-R3**: completati (R1 chiuso con page sotto 400 righe);
3. **P1/P2/P3/P5/P6/P7/P4**: completati (P4 con rendering per-layer).
4. **Q1-Q5, T1-T3, R0**: completati (T3 con eventuali follow-up minori).
5. **SR3-SR7 e C1-C5/C7**: completati.
6. **C6**: chiuso — container query non adottate, requisito rimosso dal piano.
7. **S3, S7**: S3 completato (revoca per-device); S7 richiede verifica TLS/proxy reale.
8. **B1-B5**: B1-B4 completati; resta B5 (pulizia finale).
9. **Pi 1**: validazione display in kiosk.

---

## Appendice A — Signal Forms, `resource()`, `@defer`: cosa sono e pro/contro

### Signal Forms

API di Angular per gestire i form come un grafo di signal. `form()` definisce modello e schema di validazione; i campi espongono `value()`, `errors()`, `touched()`, `dirty()` e si collegano al template senza `ReactiveFormsModule`/`FormControl`.

**Pro**

- type-safe: il modello TypeScript guida campi e validazione;
- validazione dichiarativa e componibile, senza `setValue`/`patchValue`;
- aggiornamenti granulari: notifica solo i campi cambiati;
- si integra con i signal/computed già usati nel progetto.

**Contro**

- API relativamente recente: possibili breaking change e documentazione ridotta;
- migrare i wizard (character, actor, map editor) significa riscrivere i form;
- i casi dinamici (equipaggiamento, incantesimi, spawn) sono i più delicati;
- oggi il progetto non usa `@angular/forms`: non c'è un'emergenza da risolvere.

### `resource()` / `httpResource()`

`resource({ params, loader })` è un contenitore signal per dati asincroni: espone `value()`, `status()`, `error()`, `isLoading()`, `reload()` e ricarica quando `params` cambia. `httpResource()` è la variante per `HttpClient`, con parsing e validazione.

**Pro**

- elimina il boilerplate `firstValueFrom` + signal manuale;
- stati loading/error/refresh uniformi;
- ricarica automatica al cambio campagna/scena;
- cancellazione e race condition gestite dal framework.

**Contro**

- API nuova: da verificare su retry, refresh ottimistico e dipendenze multiple;
- le mutazioni (POST/PATCH) restano fuori: serve comunque un pattern per l'update ottimistico;
- la migrazione tocca tutti i servizi;
- rischio di mescolare `resource` e store senza regole chiare.

### `@defer`

Rimanda il rendering di un componente pesante finché non serve (`on viewport`, `on idle`, `on interaction`, `when`).

**Pro**

- bundle iniziale più piccolo e TTI migliore;
- adatto a editor mappa, pannelli console e dialog pesanti;
- placeholder ed error block espliciti.

**Contro**

- aggiunge stati di caricamento e complessità E2E;
- se il componente serve subito, peggiora la UX;
- con canvas e regia il timing diventa critico.

### Container query

`@container` adatta un componente alla larghezza del contenitore, non del viewport.

**Pro**

- pannelli riutilizzabili in sidebar larghe e strette;
- meno media query duplicate per i breakpoint globali.

**Contro**

- richiede `container-type` e può cambiare il layout;
- debugging meno immediato;
- il progetto ha già breakpoint centralizzati in `_functions.scss`.

### Opzioni valutate per D5 (scelta: B)

| Opzione | Costo | Rischio | Beneficio |
|---|---|---|---|
| **A. Aggiornare `PLAN.md` all'architettura attuale** | S | basso | documentazione vera, nessuna migrazione |
| **B. Adottare Signal Forms + `resource()` + `@defer`** | L | alto | coerenza col piano, meno boilerplate |
| **C. Ibrido: `resource()` + `@defer`, Signal Forms dopo** | M | medio | migliora dati e bundle senza toccare i form |
| **D. Rinviare** | S | basso | nessun beneficio immediato |

**Scelta registrata: B.** La mitigazione del rischio è nell'ordine delle task: **B1** spike per confermare API e stabilità, **B2** `resource()` per primo (basso accoppiamento), **B3** `@defer` con misura del bundle, **B4** Signal Forms solo dopo gli split R1–R3. Il rischio principale è migrare i form prima dei refactor e doverli riscrivere due volte: per questo B4 è vincolata ai god component.
