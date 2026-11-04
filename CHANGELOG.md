# Changelog

Modifiche principali del progetto, raggruppate per data e con le più recenti in
alto. Ogni voce riassume uno o più commit; la cronologia completa resta in git.

## 2026-11-04

- **Scene:** movimento e piazzamento rispettano i muri diagonali: una cella
  attraversata da un muro non ospita attori (editor, drop e `token.add`), mentre
  una porta aperta resta attraversabile; i token intrappolati possono uscire e
  la creazione scena ricolloca spawn e partenze invalidi. Nella console DM le
  frecce muovono il token selezionato, Shift mantiene il pan e Alt forza il
  movimento; l'undo conserva il `force`. Vedi
  [`docs/scene-movement.md`](./docs/scene-movement.md).
- **Mappe, grafiche:** il layer `graphics` accetta anche poligoni chiusi
  allineati alla griglia (3–200 vertici in celle, riempimento esadecimale e
  opacità) e testi (quattro famiglie locali, 8–200 px, colore) oltre alle
  immagini; inserimento, spostamento, hit-test, z-order e undo/redo sono
  condivisi, e poligoni e testi compaiono in editor, thumbnail e composito. Il
  documento resta v2 e le grafiche storiche senza `kind` sono lette come
  `image`. Vedi [`docs/map-layers.md`](./docs/map-layers.md) e
  [#18](https://github.com/dardino/dnd-vtt/issues/18).
- **Mappe a layer:** documento v2 con la tupla fissa background/graphics/
  constraints/elements, migrazione automatica dei documenti v1 in lettura e
  scrittura sempre v2. L'editor espone il pannello layer (visibilità, blocco,
  opacità), la toolbar filtrata per layer, grafica sovrapposta con upload
  multiplo, transform, flip e z-order, aree bloccate rettangolari e poligonali
  con snap sulla griglia quadrata e loot dal catalogo SRD. Vedi
  [`docs/map-layers.md`](./docs/map-layers.md).
- **Anteprime mappe:** al salvataggio il client genera thumbnail 640 e composito
  4096 in WebP, li carica come asset e li invia nel `PUT` insieme al documento;
  un errore di render produce un avviso e non blocca il salvataggio, lasciando i
  riferimenti precedenti. `MapSummary.thumbUrl` usa la thumbnail persistita con
  fallback allo sfondo, gli asset derivati sostituiti vengono raccolti quando
  nessuno li referenzia e la scena creata da mappa usa il composito con
  transform cover copiando il loot in `SceneState.loot`. Export e import
  restano compatibili con i bundle v1.
- **Mappe:** colore di sfondo `rgba` con picker colore e opacità, propagato dalla
  mappa alla `SceneState`, al canvas del tavolo e alla proiezione display;
  anteprime della lista mappe colorate e foglio bianco delle dimensioni scelte
  per le mappe senza immagine.
- **Editor mappe:** inspector a sezioni accordion come la console; spostamento
  degli oggetti selezionati con frecce (una cella o un bordo) e drag & drop con
  snap, sempre tramite history con undo/redo.
- **Scene:** creazione esclusivamente da mappa, eliminazione delle scene non
  attive e non in onda, conferma e refresh degli schermi.
- **Icone:** Material Symbols Outlined self-hosted con subset generato da
  `scripts/material-symbols.mjs` (52 icone, `v2.woff2` da 6 KB) e sostituzione
  delle emoji in tutta l'interfaccia; `icons:check` confronta gli usi letterali
  nei sorgenti. Il subset precedente era incompleto e rendeva come testo le
  icone dell'editor (`lock`, `add_photo_alternate`).
- **Agenti:** workflow Analyzer → Tester → Coder → Reviewer → Committer, con
  regole di test TDD, review read-only e resoconti obbligatori dell'orchestrator.
- **Documentazione:** backlog aperto migrato nelle issue GitHub #14–#17,
  `TODO.md` rimosso, introdotto questo `CHANGELOG.md` e README aggiornato con
  stato, agenti e link utili.

## 2026-11-03

- **Scheda giocatore:** link con QR code, creazione/rotazione con conferma,
  avviso per `PUBLIC_URL` loopback o host non raggiungibile.
- **Form:** adozione di Signal Forms su dado, dialog nuova mappa, note, level-up,
  actor wizard, identità character wizard, inspector mappa e pannello AI;
  `resource()` per letture con params reattivi e `@defer` per pannelli pesanti.
- **Refactor:** `core/` diviso in `api`, `auth`, `realtime`, `stores`, `services`,
  `ui`, `testing`; `DmShellPage` ridotto a facciata con store, sidebar, dialoghi,
  controller e componenti estratti.
- **Performance:** bundle iniziale da ~801 kB a ~309 kB, code splitting e defer;
  caricamento console parallelizzato, cache asset, batch dei ritratti e
  deduplicazione degli asset; suite E2E parallela da ~72 s a ~46 s.
- **Sicurezza:** revoca delle sessioni DM per-device dal pannello Dispositivi;
  messaggi HTTP centralizzati con `httpMessage`.
- **Qualità:** controlli axe, stabilizzazione E2E, coverage, policy file sotto
  400 righe, decisione di non adottare container query e pulizia della review
  obsoleta.
- **Issue:** completate e rimosse `ISSUE_01` (QR scheda) e `ISSUE_02` (icone).

## 2026-11-02

- **Editor mappe:** history a comandi, preset di risoluzione, trasformazione e
  sfondo opzionale, downscale degli asset, sostituzione sicura dello sfondo,
  dimensioni della mappa immutabili al salvataggio.
- **Performance:** cache LRU per immagini, proiezione display con lookup batch,
  prefilter delle scene, griglia editor come singola shape, render coalescati
  con `requestAnimationFrame`, history limitata, query paginate verificate.
- **UI/CSS:** raggi unificati, token per i colori residui, animazioni e
  `prefers-reduced-motion`, navigazione da tastiera dei canvas.
- **Schede:** pannelli combattimento, incantesimi, inventario, note, ritratto,
  level-up e link giocatore estratti dalla pagina.
- **Modello scene:** preset, orientamento, `backgroundTransform` e copia
  mappa→scena.

## 2026-11-01

- **Sicurezza:** CSP con origin WebSocket derivata da `PUBLIC_URL`, rate limit
  mirato, `TRUST_PROXY`, password DM con scrypt, originali EXIF non serviti,
  sessioni più brevi con refresh, codici display a 8 caratteri, audit
  dipendenze, backup documentati e suite di regressione.
- **Realtime:** `RealtimeService` condiviso, azioni di scena via WebSocket con
  fallback polling, token sync registrato come azione annullabile.
- **Distribuzione:** Docker Compose, Dockerfile multi-arch e workflow GHCR con
  tag `latest`/`edge`/`vX.Y.Z`/`sha-<short>`.
- **Qualità:** policy `max-lines` 400 e report dimensioni, `max-len` 110,
  fixture E2E/server condivise, test DTO, coverage e smoke test client.
- **Refactor:** stato Regia, campaign shell e scene tools estratto dalla console;
  correzioni a fog, lista PG e wizard personaggio.

## 2026-10-31

- **Editor mappe:** muri vettoriali, griglia visibile, layout dedicato fuori dai
  wizard, strumenti mappa e impostazioni con dimensioni.
- **Regia:** composizioni indipendenti per schermo, viewport serializzati, zoom
  relativo al fit, anteprima, codice schermo e accordion schermi.
- **UI:** unità di misura ft/m, ritratti attori, pan col tasto destro, nomi interi
  su slot e token.

## 2026-10-30

- **Fog e disegno:** undo/redo rapidi, matita proporzionata alla cella, pennello
  fog di 3 celle e indicatore ON AIR legato ai display connessi.
- **Regia:** blackout, schede giocatore e fallback IA completati.

## 2026-10-29

- **Fog e disegni:** operazioni vettoriali con softness, export PNG e budget di
  operazioni.
- **Combattimento:** iniziativa, dadi, riposi, level-up e avanzamento.
- **Tooling:** migrazione a Node 26.

## 2026-10-28

- **Fondamenta:** monorepo npm/Turbo, TypeScript strict, ESLint, CI, wrapper
  nativi, tema e CSP; schema DB, API di campagne/attori/asset/scene, auth DM e
  azioni transazionali.
- **SRD 5.2:** cataloghi, schemi, derivazione scheda, validazione build, wizard
  personaggio e console con scena Konva, griglia, token e misura.
- **Prima release interna:** upload mappe con tile, accordion sidebar, slot PG,
  test E2E e primo flusso completo di regia.

## Backlog aperto

Le verifiche che richiedono infrastruttura o hardware esterno sono tracciate
come issue GitHub:

- [#14](https://github.com/dardino/dnd-vtt/issues/14) — HTTPS, reverse proxy e
  cookie `secure`.
- [#15](https://github.com/dardino/dnd-vtt/issues/15) — validazione display su
  Raspberry Pi 1.
- [#16](https://github.com/dardino/dnd-vtt/issues/16) — build Docker multi-arch
  su Docker Desktop.
- [#17](https://github.com/dardino/dnd-vtt/issues/17) — scansione Trivy
  bloccante.
