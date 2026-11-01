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

**Blocco attivo:** **S0 completato**, **D9 implementato** (immagine non ancora verificata con Docker), **A3 e A2 completati**. Prossimo passo: **A1 → A4**, con le attività D6 e **S1/S4/S5/S6** in parallelo. La migrazione **B1/B2** può partire in parallelo; **B4 (Signal Forms)** va dopo gli split dei god component.

**Policy nuova:** un file oltre **350–400 righe** va considerato candidato allo split. La soglia diventa operativa nella task **R0**.

---

## 1. Architettura e modello dati (P1) — **blocco attivo**

Ordine di esecuzione: **A3 → A2 → A1 → A4**. A3 isola lo stato, A2 rende le azioni l'unico writer, A1 può quindi veicolarle sul WebSocket, A4 centralizza gli errori.

- [ ] **A1 — `RealtimeService` unico** · L · D2
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

- [ ] **A4 — `ErrorHandler` globale e toast** · M
  - **Problema:** `messageFor` è ancora duplicato in store/feature; gli errori non gestiti non hanno un punto unico.
  - **Proposta:** `ToastService` signal-based + container in `app.html`; `ErrorHandler` globale che usa `http-error.ts`; gli store smettono di mappare i messaggi.
  - **Fatto quando:** un errore non gestito mostra un toast; un solo punto di traduzione HTTP.

- [ ] **A5 — Regole di dominio residue in `shared`** · M
  - **Problema:** `buildFeatures`/`classFeatures`, slot incantesimo, `startView`/`mapView`/`viewport`, envelope paginato, lista skill, `mime` immagini e viste `DmSheetView`/`PlayerSheetView` hanno ancora copie.
  - **Proposta:** estrarre `classFeaturesFor`, `spellSlotsFor`, `viewSchema`, `paginatedSchema(item)`, `skillsTuple`, `imageMimeSchema`; derivare le due viste da una base comune.
  - **Fatto quando:** una sola implementazione per regola, con test condivisi.

## 2. Performance (P1)

- [ ] **P1 — `projectDisplay`/`publicScene`: eliminare l'N+1 residuo** · M
  - **Problema:** la cache per scena copre i token, ma `projectDisplay` continua a risolvere asset per layer/contenuto; con 30 token e 3 display restano centinaia di query sincrone.
  - **Proposta:** batch loader per richiesta (`actorsById`, `assetsById`) con una query `IN (...)` per tabella, passato a `publicScene` e `projectDisplay`; cache per singolo broadcast.
  - **Fatto quando:** query ~costanti (≤ 4) indipendenti da token/display; test con 30 token e 3 display.

- [ ] **P2 — `updateTokensForActor` mirato** · M
  - **Problema:** scandisce tutte le scene della campagna a ogni modifica di scheda.
  - **Proposta:** pre-filtro SQL (`json_each` su `scenes.state`) e parse solo delle scene candidate; alternativa: tabella indice `scene_tokens(actor_id, scene_id)` aggiornata in transazione.
  - **Fatto quando:** O(scene candidate), benchmark con 50 scene.

- [ ] **P3 — History editor mappa a comandi/patch** · M · D4
  - **Problema:** 50 `structuredClone` completi del documento; con 4.000 muri e 500 spawn la history pesa centinaia di MB.
  - **Proposta:** `MapCommand` con `apply`/`invert` (o patch JSON) e limite 50 invariato; snapshot completo solo per operazioni strutturali.
  - **Fatto quando:** 1.000 modifiche senza crescita MB; undo/redo coperti da test.

- [ ] **P4 — Rendering canvas incrementale** · M
  - **Problema:** `renderAll()` a ogni wheel/pointermove; griglia editor con un `Konva.Line` per cella; `getComputedStyle` a ogni render.
  - **Proposta:** ridisegnare solo il layer toccato, `requestAnimationFrame` + throttle sugli input, griglia come singolo `Konva.Shape`, cache colori invalidata su `data-theme`/resize.
  - **Fatto quando:** 60 fps con 4.000 muri; nessun `renderAll` su move.

- [ ] **P5 — Cache immagini con limite** · S
  - **Problema:** `loadingImages`/`portraitImages` crescono per tutta la sessione.
  - **Proposta:** LRU (100 mappe / 50 ritratti) e clear su cambio campagna/scena.
  - **Fatto quando:** memoria stabile in una sessione lunga.

- [ ] **P6 — Indici di paginazione** · S
  - **Problema:** il cursore `createdAt+id` non ha un indice composito verificato.
  - **Proposta:** `EXPLAIN QUERY PLAN` su campaigns/scenes/actors; indice `(campaignId, createdAt, id)` dove serve.
  - **Fatto quando:** i piani usano l'indice, test di query plan.

- [ ] **P7 — `applySceneAction`: misurare prima di ottimizzare** · S
  - **Problema:** riserializza e ri-valida l'intero `SceneState` a ogni azione.
  - **Proposta:** misurare payload/parse su scene reali; se > 50 ms passare a patch JSON con `stateVersion`, altrimenti documentare e chiudere.
  - **Fatto quando:** decisione registrata con numeri.

## 3. Qualità e test (P1)

- [ ] **Q1 — Coverage configurata** · S · D6
  - **Proposta:** `@vitest/coverage-v8` su `shared`/`server`; soglia progressiva (60% ora, ratchet a 80/75) e report in CI.
  - **Fatto quando:** `npm run test` produce coverage e fallisce sotto soglia.

- [ ] **Q2 — Test componenti client critici** · M
  - **Proposta:** TestBed + vitest per `Dialog` (Esc singolo, `aria-labelledby`), `Button` (ARIA), `ActionStore` (TTL/guard), `SceneCanvas` (smoke render/fog), `ActorSheet` (patch HP).
  - **Fatto quando:** i cinque componenti hanno test di regressione.

- [ ] **Q3 — Contract test client/server** · M
  - **Proposta:** test server che validano le risposte con gli schemi `shared`; in alternativa generazione tipi da OpenAPI (c'è già `fastify-type-provider-zod`).
  - **Fatto quando:** una divergenza di DTO fallisce nei test, non a runtime.

- [ ] **Q4 — Fixtures condivise** · S · D6
  - **Proposta:** `client/e2e/fixtures.ts` (`openCampaign`, `campaignId`, `ensureScene`, `createGoblin`) e `server/test/factories.ts` (`createCampaign`, `createScene`, `sendAction`, `createPc`).
  - **Fatto quando:** ~200 righe duplicate rimosse.

- [ ] **Q5 — Accessibilità automatica** · S
  - **Proposta:** `@axe-core/playwright` sulle route principali; controlli su dialog, toolbar e fallback canvas.
  - **Fatto quando:** nessuna violazione critical/serious.

## 4. Sicurezza (P1) — **attiva (D7): tutti i livelli**

> **Contesto:** il VTT gira in LAN e non è pensato per internet, ma va costruito come se lo fosse. Ogni controllo viene implementato ora, così un'eventuale esposizione futura non richiede una rincorsa. **S0 è bloccante per A1**; S1–S9 completano la postura "internet-ready".

### Già in ordine (verificato)

- Sessione DM firmata HMAC, cookie `httpOnly` + `sameSite=strict` + `secure` auto; segreto ≥ 32 caratteri persistito con permessi `0600`.
- Login con rate limit 5/min e password obbligatoria fuori dal loopback.
- Host allowlist e controllo `Origin` su tutte le richieste non-GET.
- CSP con nonce per `index.html` e `CSP_NONCE` in Angular; `frame-ancestors 'none'`.
- Upload: solo PNG/JPEG/WebP, ri-codifica sharp, EXIF rimosso dal WebP servito, limite 100 MP e 20 MB; `originals/` non servito.
- Link giocatore: token da 24 byte casuali, hash SHA-256 a riposo, revoca e editing toggle.
- Codici display CSPRNG (6 caratteri, alfabeto 32) e lookup HTTP rate-limited.
- Export note private opt-in; import transazionale; idempotenza azioni legata a campagna/scena.
- Query Drizzle parametrizzate; nessuna CORS wildcard.

### Da chiudere, in ordine di rischio

- [x] **S0 — Origin check sul WebSocket + anti-brute-force** · M · **bloccante per A1** — ✅ 1 novembre 2026
  - **Problema:** `/ws` è una GET, quindi non passa il controllo `Origin` dell'hook; con il bypass loopback una pagina malevola può aprire `ws://localhost:3000/ws?role=dm&...`. Oggi espone solo presence/hello, ma A1 ci farà passare azioni e stato. Inoltre `/ws` è esente dal rate limit: i codici display sono provabili senza freno.
  - **Implementato:** `Origin` validato su ogni upgrade in `app.ts`; il ruolo `dm` richiede l'header; `WsAttemptLimiter` per IP (default 60/min, `WS_RATE_LIMIT_MAX`); socket raw chiuso sui rifiuti; test CSWSH, DM senza Origin, rate limit e unit test del limiter.
  - **Fatto quando:** test CSWSH (Origin esterno → chiusura/403) e test brute-force (soglia → 429/chiusura).

- [ ] **S1 — CSP per ambiente** · S
  - **Problema:** `connect-src 'self' ws: wss:` consente connessioni verso qualunque host.
  - **Proposta:** costruire la CSP da `env`: produzione `connect-src 'self'`; sviluppo aggiunge gli `allowedOrigins` (http/ws). Verificare che `'self'` copra il WS same-origin nei browser target, altrimenti elencare esplicitamente `ws(s)://host`.
  - **Fatto quando:** header verificato in test e build prod.

- [ ] **S2 — Password DM con hash e policy** · M
  - **Problema:** `passwordMatches` confronta due plaintext con HMAC a chiave costante; non esiste `DM_PASSWORD_HASH`; minimo 8 caratteri.
  - **Proposta:** supportare `DM_PASSWORD_HASH` (scrypt PHC) e usarlo se presente; fallback plaintext solo in dev/test; minimo 12 caratteri fuori loopback; documentare in `.env.example`.
  - **Fatto quando:** in produzione è accettato solo l'hash.

- [ ] **S3 — TTL e revoca sessione** · M
  - **Proposta:** TTL 7 giorni con refresh su attività, oppure `jti` + versione sessione revocabile al logout; valutare il costo rispetto a D27.
  - **Fatto quando:** esiste un percorso di revoca per-device.

- [ ] **S4 — Rate limit e limiti corpo** · S
  - **Problema:** l'allowList esenta tutte le GET tranne i display (export e actions incluse); `MAX_JSON_MB` è usato solo dal PUT state, mentre Fastify applica il default di 1 MB al resto.
  - **Proposta:** allowList ristretta a uploads/health/azioni in polling/SRD; rate limit su export; `bodyLimit` esplicito per import/export e rimozione di `maxJsonBytes` quando D3 elimina il PUT.
  - **Fatto quando:** export limitato e limiti documentati.

- [ ] **S5 — Originali su disco** · S
  - **Problema:** gli originali con EXIF restano in `uploads/originals/` indefinitamente; non sono serviti, ma sono un residuo sensibile.
  - **Proposta:** non scriverli affatto (la deduplica usa l'hash nel DB) oppure `KEEP_ORIGINALS=false` di default con cleanup.
  - **Fatto quando:** il default non lascia metadati EXIF su disco.

- [ ] **S6 — Codici display e URL** · S
  - **Problema:** il codice è salvato in chiaro e finisce in URL/history; un dump del DB espone i display attivi.
  - **Proposta:** documentare il rischio, oppure ruotare il codice alla revoca e abbreviare la validità del link; valutare hash a riposo se il DM non deve rileggerlo.
  - **Fatto quando:** decisione registrata.

- [ ] **S7 — HTTPS e reverse proxy** · M
  - **Problema:** oggi `trustProxy: false`; dietro un proxy TLS il rate limit vedrebbe l'IP del proxy e i cookie `secure` dipendono da `PUBLIC_URL`. In LAN HTTP va bene solo su rete fidata.
  - **Proposta:** aggiungere `TRUST_PROXY` esplicito (default `false`) e configurare Fastify; documentare Caddy/nginx con `PUBLIC_URL=https://...`, `COOKIE_SECURE=true`, `ALLOWED_ORIGINS=https://...`; verificare che gli header di forwarding disattivino il bypass loopback; testare HSTS e IP reale nel rate limit.
  - **Fatto quando:** un test con header `X-Forwarded-Proto`/`X-Forwarded-For` dimostra IP e cookie corretti.

- [ ] **S8 — Suite di regressione sicurezza** · M
  - **Proposta:** test dedicati per matrice autorizzazioni (route DM senza cookie → 401), CSWSH, rate limit login/display, header CSP/HSTS/nosniff, upload SVG/polyglot rifiutato, export senza note private di default, `originals/` 404.
  - **Fatto quando:** la suite gira in CI e fallisce su regressioni.

- [ ] **S9 — Dipendenze e dati a riposo** · S
  - **Proposta:** `npm audit` in CI con soglia high/critical e Dependabot/Renovate; documentare backup cifrati del DB (contiene note private e link giocatore) e permessi dei file.
  - **Fatto quando:** CI controlla le dipendenze e la procedura di backup è scritta.

### Checklist "internet-ready"

- [x] S0 Origin WS + rate limit tentativi
- [ ] S1 CSP `connect-src` ristretta
- [ ] S2 `DM_PASSWORD_HASH` + minimo 12 caratteri
- [ ] S3 TTL breve e revoca sessione
- [ ] S4 AllowList GET e `bodyLimit` espliciti
- [ ] S5 Nessun originale con EXIF su disco
- [ ] S6 Codici display documentati/ruotati
- [ ] S7 HTTPS, proxy e cookie `secure`
- [ ] S8 Test di regressione sicurezza in CI
- [ ] S9 Audit dipendenze e backup cifrati

## 5. Refactor god component (P2)

- [ ] **R0 — Policy dimensione file: target 350, cap 400** · S
  - **Problema:** 18 file superano le 400 righe e mescolano responsabilità diverse; senza una soglia il problema si riforma dopo ogni split.
  - **Proposta:** regola ESLint `max-lines` a 400 (`skipBlankLines`, `skipComments`) con override temporanei per i file attuali; ogni split rimuove un override. Aggiungere `npm run files:report` per elencare i file oltre soglia; **350 righe** è il target per i nuovi file.
  - **Fatto quando:** nessun nuovo file supera 400 righe; gli override esistenti scendono a zero.
  - **Offender attuali (≥ 400 righe):**

    | Righe | File |
    |---:|---|
    | 2198 | `client/src/app/features/dm/dm-shell.page.ts` |
    | 1622 | `client/src/app/features/scene/scene-canvas.component.ts` |
    | 1189 | `client/src/app/features/dm/dm-shell.page.html` |
    | 1124 | `client/src/app/features/dm/dm-shell.page.scss` |
    | 921 | `client/src/app/features/maps/map-editor-canvas.component.ts` |
    | 898 | `client/src/app/features/actor/actor-sheet.page.ts` |
    | 781 | `shared/src/lib/sheet/validate.ts` |
    | 716 | `client/src/app/features/maps/map-editor.page.ts` |
    | 655 | `client/src/app/features/character/character-wizard.page.html` |
    | 646 | `client/src/app/features/character/character-wizard.store.ts` |
    | 574 | `client/src/app/features/actor/actor-sheet.page.html` |
    | 545 | `client/src/app/features/character/character-wizard.page.scss` |
    | 480 | `shared/src/schemas/sheet.ts` |
    | 466 | `shared/src/lib/sheet/__fixtures__/catalog.ts` |
    | 448 | `shared/src/schemas/scene.ts` |
    | 428 | `client/src/app/features/character/character-wizard.page.ts` |
    | 420 | `client/src/app/features/maps/map-editor.page.html` |
    | 418 | `client/src/app/features/actor/actor-sheet.page.scss` |

- [ ] **R1 — `DmShellPage`** · L · D8
  - **Proposta:** prima gli store (`CampaignShellStore`, `RegiaStore`, `SceneToolsStore`) senza cambiare il template; poi `SidebarSection`, `SceneList`, `ActorList`, `ScreenList`, `SessionCard`, `DmToolbar`, `DmStatusbar`; infine il template.
  - **Fatto quando:** tutti i file coinvolti scendono sotto 400 righe (obiettivo 350), test sugli store, E2E invariati.

- [ ] **R2 — `SceneCanvasComponent`** · L
  - **Proposta:** `KonvaStageService`, `MapLayerRenderer`, `GridRenderer`, `FogRenderer`, `TokenRenderer`, `CanvasInputController`; la matematica resta in `shared`.
  - **Fatto quando:** ogni renderer è testabile in isolamento e nessun file supera 400 righe.

- [ ] **R3 — `ActorSheetPage`** · M
  - **Proposta:** `SheetHeader`, `SheetTabs`, `CombatPanel`, `SpellPanel`, `InventoryPanel`, `NotesPanel`, `PortraitEditor`, `LevelUpDialog`, `PlayerLinkPanel`.
  - **Fatto quando:** la pagina orchestra solo input/output e nessun file supera 400 righe.

## 6. CSS e UI (P2)

- [ ] **C1 — Scala dei raggi** · S
  - **Proposta:** `control` = `--radius-sm`, card = `--radius-md`, overlay = `--radius-lg`; rimuovere gli override locali.
  - **Fatto quando:** nessun `border-radius` hardcoded fuori dai token.

- [ ] **C2 — Catena `:host`/fill-height** · S
  - **Proposta:** usare `mx.fill-height` sui `:host` di pagina; rimuovere `@mixin fill-height` da `_layout.scss` se resta inutilizzato.
  - **Fatto quando:** tutte le route hanno altezza coerente.

- [ ] **C3 — Animazioni, motion e hover** · S
  - **Proposta:** `_animations.scss` con `shimmer`/`spin`; `prefers-reduced-motion` globale; hover solo dentro `@media (hover: hover)`.
  - **Fatto quando:** spinner, dado e skeleton rispettano la preferenza.

- [ ] **C4 — Ultimi colori hardcoded** · S
  - **Proposta:** sostituire i residui `#hex`/`rgb()` con `--editor-*`, `--overlay-*`, `--fog-color`; fallback solo nei default TS del canvas.
  - **Fatto quando:** grep senza literal nelle feature SCSS.

- [ ] **C5 — `display: contents` documentato** · S
  - **Proposta:** commento in `dialog.scss`/`dice-overlay` e test che `aria-labelledby` continua a funzionare.
  - **Fatto quando:** il motivo è scritto accanto alla regola.

- [ ] **C6 — Container query** · M · B3
  - **Proposta:** valutare `@container` per i pannelli console/actor sheet durante l'ondata `@defer`; se non porta benefici misurabili, rimuovere il requisito dal piano.
  - **Fatto quando:** decisione registrata e, se adottata, applicata ai pannelli.

- [ ] **C7 — Accessibilità canvas** · M
  - **Proposta:** `role="img"` + `aria-label` descrittivo sullo stage, scorciatoie tastiera per pan/zoom/selezione, conferma esplicita per azioni distruttive.
  - **Fatto quando:** le azioni principali sono raggiungibili da tastiera e testate.

## 7. Tooling e allineamento al piano (P2)

- [ ] **T1 — `max-len` a 110** · S · D6
  - **Proposta:** commit separato di sola formattazione (`eslint --fix`), poi abbassare la regola.
  - **Fatto quando:** `max-len` 110 senza modifiche funzionali.

- [ ] **T2 — `PLAN.md`: registrare l'adozione di B** · S · D5
  - **Proposta:** aggiungere al piano una sezione "stato migrazione" con B1–B5 e i criteri di uscita; gli obiettivi del piano restano validi, non vanno riscritti.
  - **Fatto quando:** il piano indica quali parti di Signal Forms/`resource()`/`@defer` sono già adottate e quali mancano.

- [ ] **T3 — Pulizia configurazioni** · S
  - **Proposta:** verificare dipendenze duplicate (`jsdom` root/client), mixin morti, budget e `tsconfig`; rimuovere ciò che non è usato.
  - **Fatto quando:** `npm ls` pulito e nessun file morto.

## 8. Migrazione B — Signal Forms, `resource()`, `@defer` (P1/P2)

> D5 = **B**. Il piano non va riscritto: va eseguito a tappe, con misurazioni e senza bloccare l'architettura realtime già attiva.

- [ ] **B1 — Spike e prerequisiti** · S
  - **Proposta:** verificare nella versione Angular 22.2.3 lo stato di Signal Forms (`@angular/forms/signals`), l'adattatore Standard Schema/Zod e `resource()`/`httpResource()`. Reintrodurre `@angular/forms` come dipendenza diretta: oggi è presente in `node_modules` solo come residuo. Fare un PoC su un form piccolo (`dice-overlay`) con test.
  - **Fatto quando:** decision record con API confermate e PoC verde.

- [ ] **B2 — `resource()` sui servizi di lettura** · M
  - **Proposta:** inventariare `campaign.service`, `actor.service`, `scene.service`, `srd-catalog.service` e `program.service`; usare `resource({ params, loader })` o `httpResource` per le letture, lasciando le mutazioni nei servizi. Integrare `status()`/`error()` con `ErrorHandler`/toast (A4) e con gli store.
  - **Fatto quando:** le letture principali hanno loading/error uniformi; test su cambio scena e race condition.

- [ ] **B3 — `@defer` sui componenti pesanti** · M
  - **Proposta:** applicarlo a pannelli editor mappa, pannelli console, tab della scheda e step dei wizard; aggiungere `@placeholder`/`@loading`/`@error` e prefetch `on idle` dove serve. Misurare il bundle con `ng build --stats-json` prima/dopo.
  - **Fatto quando:** bundle iniziale misurato e ridotto, E2E aggiornati.

- [ ] **B4 — Signal Forms, form per form** · L
  - **Proposta:** ordine `dice-overlay` → inspector editor mappa → editing `actor-sheet` → `actor-wizard` → `character-wizard`. Riusare la validazione di dominio in `shared`, senza duplicarla nel template.
  - **Dipende da R1–R3:** i form dentro i god component vanno migrati dopo lo split, per non riscriverli due volte.
  - **Fatto quando:** i form migrati usano `form()`/field signal, hanno test su validazione, dirty/touched, submit e accessibilità.

- [ ] **B5 — Pulizia finale** · S
  - **Proposta:** rimuovere stato form manuale e handler ridondanti; aggiornare `PLAN.md` allo stato "adottato".
  - **Fatto quando:** non restano form legacy nei componenti migrati.

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

> **Nota D9 (1 novembre 2026):** l'immagine **non è stata verificata con `docker build` in questo ambiente** (Docker assente). Sono stati eseguiti `npm run check` (lint, typecheck, test, build, `db:check`, `check:bundles`) e l'ispezione statica di `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `deploy/Caddyfile`, `.github/workflows/release.yml` e degli script. La prima build multi-arch va validata su Docker Desktop (o in CI) prima di considerare la release affidabile. Restano aperti: validazione display su Pi 1 e resa bloccante della scansione Trivy (S9).

---

## Sequenza consigliata

1. **Sicurezza WS** (S0): Origin check + rate limit, **prerequisito di A1**. ✅ completato
2. **Docker/Compose** (D9): immagine GHCR, volume, healthcheck; poi **A3 → A2 → A1 → A4**. In parallelo: **S1, S4, S5, S6** (basso rischio).
3. **Tooling in parallelo** (D6): coverage, fixtures, `max-len` 110, contract test; policy **R0**.
4. **Migrazione dati** (D5/B): **B1 spike** durante l'architettura, poi **B2 `resource()`** e **B3 `@defer`**.
5. **Refactor** (D8): `DmShellPage` → `SceneCanvas` → `ActorSheet`, rispettando R0.
6. **Signal Forms** (**B4**): dopo gli split, form per form.
7. **Performance** (D4): N+1, history a comandi, rendering, cache.
8. **Hardening completo** (S2, S3, S7, S8, S9): chiude la checklist "internet-ready" prima di qualsiasi esposizione pubblica.
9. **Distribuzione** (D9): dopo la decisione, Dockerfile/Compose/CI, prima del gate internet-ready.

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
