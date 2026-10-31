# D&D VTT

Virtual tabletop locale per D&D 5e: console DM, doppio schermo, mappa con token,
fog of war, dadi e schede SRD 5.2. Il design completo è in [`PLAN.md`](./PLAN.md).

## Requisiti

- Node.js **26.0+** (`<27`), vedi `.nvmrc`
- npm 12

```powershell
nvm use 26.8.1
npm ci
Copy-Item .env.example .env   # opzionale: i default funzionano su localhost
npm run db:migrate
```

`npm run db:migrate` non è mai automatico all'avvio: se manca una migrazione il
server parte comunque e `/api/v1/health` risponde `db: 'migration_pending'`.

## Comandi

| Comando | Effetto |
|---|---|
| `npm run dev` | client su `:4200`, server su `:3000`, `shared` in watch |
| `npm run check` | lint, typecheck, test, build e `db:check` |
| `npm run test` | test unitari e API |
| `npm run test:e2e` | Playwright contro il build di produzione |
| `npm run build` | build di `shared`, `server` e `client` |
| `npm run db:generate` | genera una migrazione Drizzle dallo schema |
| `npm run db:migrate` | applica le migrazioni |
| `npm run db:seed` | inserisce una campagna di prova, una scena e un goblin |
| `npm run db:check` | verifica che schema e migrazioni non divergano |
| `npm run srd:import` | rigenera i cataloghi SRD 5.2 da Open5e (richiede rete) |

I cataloghi SRD sono **committati**: l'import serve solo quando si aggiorna la
versione dei dati. A runtime il server legge i JSON locali, senza chiamate
esterne.

Il repository installa un hook `pre-commit` che esegue `npm run check`:
nessun commit se lint, typecheck, test, build o `db:check` falliscono.

## Struttura

- `client/` - Angular 22 zoneless, Signals e `@ngrx/signals`; console DM con
  avvio su `/dm`, tema light/dark/system, wizard personaggio a 7 step, shell a
  pannelli collassabili e scena Konva con griglia, token e misura
- `shared/` - schemi Zod, tipi, derivazione della scheda (`deriveSheet`),
  validazione delle build (`validatePcBuild`), azioni di scena reversibili,
  geometria quadrata/esagonale `odd-r` e piramide di tile
- `server/` - Fastify, Drizzle/SQLite, API `/api/v1`, auth DM, upload `sharp`
  con preview e tile per mappe grandi, `action_log` e `ActionService`
- `LICENSES/SRD-5.2.md` - attribuzione CC BY 4.0

## Stato

- **Fase 1 completata**: monorepo npm + Turbo, TypeScript strict, ESLint flat,
  CI con E2E, wrapper nativi `app-button`/`app-dialog`, tema e serving con
  nonce CSP per richiesta.
- **Fase 2 completata**: schema Drizzle e migrazioni, CRUD campagne/scene/attori
  con cursore, upload originale + WebP + thumb, `action_log` con inverse e
  transazione, `PUT /scenes/:id/state` solo per recovery, auth DM con loopback
  fidato solo senza header di forwarding, allowlist `Host`, controllo `Origin`
  e rate limit. La console si apre su `/dm` con skeleton, modale di creazione o
  scelta e `lastCampaignId` in `localStorage`.
- **Fase 3a implementata**: cataloghi SRD 5.2 (12 classi, 9 specie, 4 background,
  17 talenti, 339 incantesimi, 195 oggetti, 331 mostri), schemi della scheda,
  valori derivati, validazione delle build ed endpoint di catalogo.
- **Fase 3b completata**: wizard PC a 7 step con creazione persistente,
  equipaggiamento automatico e tiri 4d6kh3 dal server; wizard mostro/NPC a 6
  step con import dal catalogo SRD; scheda console a tab con snapshot,
  `sheetVersion`, inventario, incantesimi e note del DM. I personaggi senza
  campagna sono rifiutati. La scheda ha un ritratto 3:4 con cerchio di ritaglio
  per il thumbnail, visibile sulla mappa e nello slot; mostri e NPC hanno il
  pulsante ✎ Modifica per nome e ritratto.
- **Fase 4 completata**: upload mappe con preview e piramide di tile oltre
  2048 px, griglia quadrata e esagonale pointy-top `odd-r`, scena Konva con
  pan, zoom, drag & drop con snap, token di dimensione variabile e misura
  distanza con la stessa geometria di `shared`. Il pan è sempre disponibile con
  il tasto destro, anche con fog, matita o misura attivi; il pulsante sinistro
  è solo “Seleziona”. Le etichette dei token non spezzano le parole. La shell ha barra del titolo,
  sidebar a sezioni accordion collassabili con stato ricordato, toolbar
  verticale, dock azioni, 10 slot riservati ai PG e statusbar; mostri e NPC
  fuori mappa vivono nell'accordion Attori e passano in “In mappa” quando
  vengono schierati. Le mappe si possono caricare, attivare e sostituire. Le azioni
  `token.*` e `grid.update` passano da `ActionService` con `ActionStore`
  ottimistico (`synced`/`pending`/`offline`/`read-only`). Due console si
  riallineano dal log azioni in attesa del WebSocket della Fase 7.
- **Fase 5 completata**: iniziativa con pareggi, round/turno e tiri dal server;
  scheda operativa con HP/temp, condizioni, death saves, dadi vita, risorse,
  slot incantesimo, riposi breve/lungo e XP. Level-up guidato con anteprima,
  sottoclasse, ASI o talento e HP; modalità milestone/XP con allineamento.
  Motore dadi condiviso con RNG iniettabile, overlay nativo, log dadi con
  visibilità `public`/`dm` e tiri server-side. Dock con Iniziativa, Log dadi e
  Azioni, undo "fino a qui" e redo dell'ultimo batch.
- **Fase 6 completata**: fog vettoriale con base nascosta/rivelata, pennello,
  gomma, rettangolo e lasso; maschera offscreen a risoluzione limitata,
  anteprima durante il tratto, softness e limite di 2.000 operazioni con
  `413`. Il pennello ha diametro di 3 celle e si adatta alla dimensione della
  griglia (circa 7 esagoni o 9 quadrati di area), quindi resta coerente
  cambiando la cella; la matita delle annotazioni è circa un quarto di cella.
  La toolbar ha **Impostazioni mappa** per regolare pennello (in celle) e
  matita (in decimi di cella), con dimensioni ricordate in `localStorage`,
  **Svuota history** (mantiene la scena corrente
  come nuovo punto di partenza) e **Reset FOG** (ricopre tutto e rimuove dalla
  history solo le azioni fog). Undo/redo dell’editor coprono matita, fog e le
  altre azioni di scena, con pulsanti in toolbar e scorciatoie Ctrl+Z /
  Ctrl+Shift+Z; l’inverso di `fog.apply` è `fog.remove`, quindi l’op viene
  rimossa davvero e non sommata come un secondo strato. Azioni
  `fog.apply`/`fog.remove`/`fog.replace` reversibili, fog iniziale scelta
  all’upload, disegni annotativi, undo dal dock e export PNG della scena.
- **Unità di misura**: in **Impostazioni mappa** si sceglie anglosassone (ft) o
  metrica (m), con preferenza salvata in `localStorage`. La griglia, il righello,
  la statusbar, velocità, sensi, gittate delle armi, portate e testi SRD vengono
  convertiti nella UI (1,5 m ogni 5 ft); il server continua a salvare tutto in
  piedi. Anche la scheda giocatore ha un piccolo toggle ft/m.

- **Fase 7 core completato**: regia con `ProgramState` versionato, composizione
  `base + overlay`, pulsanti Apri schermo / Manda in onda / Blackout e pagina
  `/display/:code` senza shell. Lo schermo mostra in basso a destra il proprio
  codice in grigio con contorno nero; un click attiva/disattiva il fullscreen.
  La proiezione è filtrata dal server (`visible` e
  fog) e include il thumbnail del ritratto dell’attore; “Manda in onda”
  reimposta il viewport della mappa annullando eventuali pan/zoom fatti
  dall’anteprima. Il display si aggiorna via WebSocket `/ws?role=display&code=…` con
  fallback polling ogni 5 s e riparte sempre da uno snapshot completo. La
  console tiene un WebSocket `role=dm` e mostra ON AIR/OFF AIR in base ai
  display realmente connessi, con BLACKOUT quando uno schermo è in onda ma
  coperto. Ogni schermo ha una **composizione indipendente**: “Manda in onda”
  con più display online apre la scelta del target, e l’anteprima comanda il
  viewport di quello specifico schermo. La sidebar destra ha l’accordion
  **Schermi** con i soli display online e ciò che stanno proiettando; cliccandone
  uno si apre un’anteprima che usa lo stesso aspect ratio dello schermo
  (orizzontale o verticale) e pan/zooma la proiezione reale. Lo zoom è relativo
  al fit della risoluzione dello schermo: 100% = mappa adattata, anche in
  fullscreen; quando lo schermo cambia dimensioni o entra in fullscreen il fit
  viene ricalcolato mantenendo lo zoom relativo. I salvataggi di viewport sono
  serializzati (l'ultimo gesto vince) e "Manda in onda" attende quelli in corso.
  Le sidebar ridotte diventano una barra stretta con l'etichetta in
  verticale. Restano
  fuori dal core: editor PVW con drag/resize degli overlay, camera live/libera
  e pairing QR.
- **Fase 8 core completato**: link giocatore `/play/:token` con token hashato e
  revoca automatica dei link precedenti, scheda mobile con HP, condizioni e note
  private separate da `dmNotes`, matita DM `editingEnabled`. Avvio/chiusura
  sessioni con durata, export/import JSON della campagna con asset WebP
  incorporati e import sempre come nuova campagna con id rimappati.
  Restano fuori dal core: coda di approvazione con cooldown, QR, dock Bottino,
  tiri dal telefono e realtime della scheda giocatore.
- **Fase 9 implementata con fallback**: chat IA non configurata, endpoint
  `/ai/status`, parser regex locale degli statblock e sezione "Chat IA" nella
  sidebar con anteprima e creazione mostro; la chat risponde `503 ai_disabled`.
  Restano fuori: provider OpenAI-compatible, streaming SSE e cronologia chat.

I gate restano `npm run check` e `npm run test:e2e` prima di ogni commit.
