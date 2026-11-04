# Changelog

Modifiche principali del progetto, raggruppate per data e con le più recenti in
alto. Ogni voce riassume uno o più commit; la cronologia completa resta in git.

## 2026-11-04

- **Mappe:** colore di sfondo `rgba` con picker colore e opacità, propagato dalla
  mappa alla `SceneState`, al canvas del tavolo e alla proiezione display;
  anteprime della lista mappe colorate e foglio bianco delle dimensioni scelte
  per le mappe senza immagine.
- **Editor mappe:** inspector a sezioni accordion come la console; spostamento
  degli oggetti selezionati con frecce (una cella o un bordo) e drag & drop con
  snap, sempre tramite history con undo/redo.
- **Scene:** creazione esclusivamente da mappa, eliminazione delle scene non
  attive e non in onda, conferma e refresh degli schermi.
- **Icone:** Material Symbols Outlined self-hosted (subset di 36 KB) e
  sostituzione delle emoji in tutta l'interfaccia.
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
