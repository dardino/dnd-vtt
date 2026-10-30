# D&D Browser App — Piano di progetto

## 1. Obiettivo

Applicazione browser per il DM di D&D 5e che permetta di:

- caricare immagini di mappe, mostri e personaggi
- gestire scene e token sulla mappa
- usare griglia quadrata ed esagonale (pointy-top)
- tenere traccia di iniziativa, HP, condizioni e schede personaggio
- creare personaggi **SRD 5.2** con un wizard completo (livelli 1–20), level-up guidato e scheda operativa
- lanciare dadi con un overlay in sovrimpressione sulla mappa
- gestire fog of war e disegni annotativi
- usare **due schermi in due sessioni browser**: schermo A come output di regia, schermo B come console con monitor PGM/PVW
- far vedere al giocatore la scheda del proprio personaggio sul telefono, inquadrando un QR, con alcune parti modificabili
- far tirare i dadi dal telefono, con il risultato visibile sulla console del DM e sullo schermo principale
- decidere cosa va in onda (mappa e quale scena, scheda di un `pc` o di un mostro, immagine, annuncio) come in un regista OBS
- esportare e importare una campagna in JSON
- salvare tutto in un monorepo con backend TypeScript tipizzato

### Non-obiettivi (fuori scope)

- motore di regole che **risolve** attacchi, danni, cure, condizioni e azioni di combattimento: il builder calcola i valori della scheda, ma il tavolo applica gli effetti
- gestione campagne con più DM e permessi granulari
- app mobile nativa
- marketplace / condivisione pubblica di contenuti
- VTT online multi-utente su internet: il doppio schermo funziona su stessa macchina o LAN, non su hosting pubblico
- token controllati dai giocatori in autonomia: il giocatore modifica solo la propria scheda, non mappa, token o scena

## 2. Glossario

Il codice è in **inglese**, la UI in **italiano**. Termini ambigui da non usare:

| Termine | Significato | Vietato |
|---|---|---|
| `actor` | unità persistita con il suo statblock (mostro, `npc`, `pc`) | mostro, scheda |
| `token` | istanza di un attore su una scena, con HP propri | pedina, attore |
| `pc` | personaggio giocante | PG |
| `npc` | personaggio non giocante | PNG, PNJ |
| `player link` | link/QR che dà accesso alla scheda di **un** `pc` | account, login |
| `sheet` | proiezione della scheda di un attore, su console o telefono (`DmSheetView` / `PlayerSheetView`) | scheda completa come tipo generico |
| `statblock` | dati meccanici dell'attore, unione discriminata per `kind` (7.3) | foglio, personaggio |
| `snapshot` | copia congelata di privilegi, incantesimi e oggetti scelti, legata a `rulesVersion` | cache, backup |
| `rulesVersion` | versione del catalogo SRD con cui una scheda è stata creata | versione app |
| `SRD` | System Reference Document 5.2, licenza CC-BY 4.0, base dei cataloghi | manuale, PHB |
| `build` | insieme delle scelte di creazione di un `pc`, validato prima del salvataggio | bozza, template |
| `image` / `asset` | file immagine caricato | PNG (come concetto) |
| `scene` | mappa + stato di gioco | board, tabellone |
| `roll` | tiro di dadi (overlay + log) | tiro dado |
| `action` | modifica atomica dello stato condiviso, applicata dal server con il suo inverso | comando, patch, update |
| `pending action` | azione di un giocatore in attesa di approvazione, in memoria del server | richiesta, proposta |
| `action history` | log persistito delle ultime 50 azioni di scena per campagna (pannello `Azioni`), con undo "fino a qui" | undo stack, audit illimitato |
| `editing enabled` | interruttore per link giocatore, la matita sullo slot (6.6) | permesso, modalità edit |

## 3. Stack e versioni

Frontend
- **Angular 22.x** — ultima stabile (22.2.3 al 14/10/2026), aggiornata alle patch più recenti
- Signals, standalone components, OnPush di default, zoneless (default da v21)
- **Nessuna libreria UI esterna**: componenti nativi (`button`, `dialog`, `table`, `popover`) incapsulati in `client/src/app/components/`, con stile e comportamento custom; niente Angular Material, niente CDK
- **Sass** con design token in CSS custom properties: tema `light`, `dark` e `system`, stile "thin" (linee sottili, superfici piatte, densità compatta)
- **Signal Forms** (stabili in v22) per il wizard di creazione (personaggio e statblock)
- `resource()` / `httpResource` per il data fetching legato ai signals
- **Konva** per stage, layer, zoom, pan, drag e hit-testing
- `@ngrx/signals` (SignalStore) per gli store
- `qrcode` per generare il QR del link giocatore lato client
- `uuid` (v7) per gli id condivisi tra client e server (D6)

Backend
- **Node.js 26 LTS**, minimo **26.0.0** (richiesto da Angular 22; compatibile con ESLint 10)
- **TypeScript 6.0.x** (vincolo Angular 22: `>=6.0 <6.1`)
- Fastify
- `fastify-type-provider-zod` + Zod per validazione e generazione OpenAPI
- `@fastify/websocket` per il realtime
- `@fastify/static` per gli asset
- `@fastify/cookie` + `@fastify/helmet` + `@fastify/rate-limit` per sessione DM, header e limiti
- Drizzle ORM + `drizzle-kit` (migrazioni)
- SQLite (`better-sqlite3`)
- `sharp` per thumbnail e conversione WebP
- `tsup` per il build di `shared`

Qualità
- TypeScript **strict massimo** (D29): `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`
- **ESLint 10 flat config** con `@eslint/js` 10, `typescript-eslint` 8.x **recommendedTypeChecked**, `@stylistic/eslint-plugin` 5.x **recommended** e `angular-eslint` 22.x recommended (TS + template); Stylistic è l'unico formatter, niente Prettier
- Vitest (unit) + Supertest/`app.inject` (API) + Playwright (E2E)
- Component test con Angular `TestBed` sui wrapper nativi: comportamento, focus trap, ARIA e tastiera
- GitHub Actions: lint, typecheck, unit, build e **E2E a ogni PR** (D30)

Tooling monorepo
- npm workspaces + **Turborepo** per orchestrare `build`, `dev`, `lint`, `typecheck`, `test` e `test:e2e`
- **ESM ovunque** (D28): `"type": "module"` in tutti i workspace, nessun dual package
- `shared` esposto con **barrel unico** `@dnd-vtt/shared`, compilato da `tsup` (D7)
- cache locale in `.turbo/` (gitignored). **Niente remote cache**: inutile con un solo sviluppatore, da rivalutare se la CI cresce
- `shared` viene costruito prima di `client` e `server` grazie a `dependsOn: ["^build"]`; dettagli in 5.4

## 4. Decisioni architetturali

| # | Decisione | Motivazione |
|---|---|---|
| D1 | `Actor` (template) separato da `Token` (istanza) | due goblin sulla mappa devono avere HP indipendenti |
| D2 | Stato scena come **documento JSON unico** (`scene.state`) | validato dallo stesso schema del client, export e import banali; le mutazioni passano da azioni (D34), il documento resta la rappresentazione persistita |
| D3 | Concorrenza ottimistica con campo `state_version` | protegge recovery, import e due scritture full-document; nel flusso normale le azioni sono serializzate dal server (D34) |
| D4 | Fog of war come **maschera vettoriale** (`base` + operazioni ordinate) in JSON, rasterizzata a runtime | undo, scalabilità, nessun file enorme per scena; la stessa geometria filtra i token lato server; export PNG opzionale |
| D5 | Realtime via WebSocket come **requisito MVP** (non opzionale), room per campagna | il doppio schermo è parte del flusso base: senza WS non esiste |
| D6 | ID `uuid v7` (ordinabili nel tempo), timestamp ISO 8601 | niente collisioni lato client, ordinamento naturale |
| D7 | `shared` compilato con `tsup`, consumato come pacchetto workspace | un solo artefatto, nessuna dipendenza da Angular o Node |
| D8 | Nessun account: pairing display con codice + PIN; la console DM usa una password locale **solo** se esposta in LAN | il DM apre lo schermo A senza creare utenti; il codice è revocabile; su localhost non c'è attrito |
| D9 | Upload fuori dal codice: directory `data/` configurabile | `uploads/` dentro `server/` finirebbe nel repo e nelle build |
| D10 | Griglia: quadrata con diagonale `5-5-5` (configurabile `5-10-5`), esagoni pointy-top `odd-r` | regola 5e standard, offset esplicito per il calcolo distanze |
| D11 | **Nessuna libreria UI**: wrapper dei componenti nativi in `client/src/app/components/`, stile e comportamento custom con Sass | controllo completo su CSP e design, meno dipendenze; lo stile "thin" resta coerente senza un design system esterno |
| D12 | Motore dadi in `shared` con RNG iniettabile (`crypto` di default) | stesse regole ovunque, test deterministici con seed, niente `Math.random` |
| D13 | Tiri registrati in una tabella `dice_rolls` **append-only**, scritta solo dal server, cap 200 FIFO per campagna | i giocatori non possono scrivere `SceneState` (D17) e il RNG deve girare lato server per essere credibile; il log non è stato della mappa |
| D14 | Export JSON **per campagna**, con `schemaVersion` e asset embedded di default | backup autonomo e portabile; variante slim per campagne con mappe pesanti |
| D15 | Un `ProgramState` per campagna; tutti i display associati mostrano lo stesso output scelto dal DM, non la scena attiva | mantiene semplice la regia; il DM può lavorare su una scena e mandarne in onda un'altra o una scheda |
| D16 | Lo schermo A riceve una **proiezione filtrata** (`DisplayState`) dal server | i token nascosti non escono mai dal backend, non basta nasconderli in UI |
| D17 | Il DM è l'unico scrittore di **scena** e **program**; i giocatori scrivono solo campi whitelisted del proprio attore | separa i permessi per dominio invece di un unico ruolo "scrittore" |
| D18 | Regia in stile OBS: `ProgramState` persistito + monitor PGM/PVW e azione `TAKE` | evita di mandare in onda per errore; il DM vede e controlla ciò che i giocatori vedono |
| D19 | PGM e schermo A riusano lo stesso componente canvas, con input riproiettato | interazione identica sui due schermi, una sola implementazione da mantenere |
| D20 | `window.open` è solo una scorciatoia UX sulla stessa macchina; **nessun `postMessage`** | un solo canale dati (WS) = nessun problema di ordinamento; il display resta apribile via URL/QR/OBS |
| D21 | Link giocatore **per singolo attore**, token nell'URL salvato hashato, revocabile e rigenerabile | il QR dà accesso alla propria scheda senza creare account |
| D22 | Permessi **per campo** (`editable`), non per ruolo | il DM decide cosa il giocatore può toccare; statblock di default sola lettura |
| D23 | Avvio sempre sulla console con skeleton e modali sopra; `lastCampaignId` ricordato | nessuna pagina intermedia, nessun flash bianco |
| D24 | HP modificati con **delta** applicato dal server in transazione, non con PATCH dell'intero attore | due danni concorrenti non si sovrascrivono; il clamp è dell'unico writer |
| D25 | Il telefono **chiede** un tiro, il server lo esegue e lo trasmette a console e schermo A | il client non sceglie mai il risultato; un solo punto di emissione per DM e giocatori |
| D26 | Note **private per ruolo**: `player_notes` visibile solo al giocatore, `dm_notes` solo al DM; nessuna delle due attraversa il confine del ruolo e non esiste condivisione esplicita di `playerNotes` | ognuno scrive senza sentirsi osservato; nessun rischio di leak tra le due viste |
| D27 | Console DM: **loopback fidato solo dalla connessione diretta**; dietro proxy o su LAN serve password con cookie firmato; TTL 30 giorni, più dispositivi ammessi, revoca globale | zero attrito sul PC del DM, senza fidarsi di header proxy non verificabili; niente gestione sessioni per-device nell'MVP |
| D28 | **ESM ovunque** (`"type": "module"`), nessun dual package | Node 26, Fastify, Angular e Vitest sono già ESM; un solo formato evita il classico "due copie della stessa classe" |
| D29 | TypeScript **strict massimo** da subito, non solo `strict: true` | aggiungere `noUncheckedIndexedAccess` dopo significa una valanga di errori; i bug che intercetta sono esattamente quelli di token e fog |
| D30 | CI completa con **E2E a ogni PR** | il doppio schermo è il requisito più fragile: se non è verificato a ogni modifica, si rompe in silenzio |
| D31 | Export **per campagna**, note dei giocatori solo con flag esplicito (`includePrivateNotes`, default `false`) | un backup davvero completo senza trasformare il file in una scorciatoia per leggere ciò che D26 nasconde |
| D32 | Import **sempre come nuova campagna**, nessun `merge` | nessuna sovrascrittura accidentale, nessuna regola di conflitto da inventare; importare due volte crea due copie, ed è dichiarato |
| D33 | Import compatibile con **tutte le versioni passate** di `schemaVersion` | un backup di mesi fa deve restare leggibile; ogni versione mantiene fixture e migrazione testata |
| D34 | Il **server applica le azioni** in transazione; nessun autosave full-document nel flusso normale | un solo writer, nessun conflitto tra console, inverso calcolato dove lo stato è autorevole |
| D35 | Editing giocatore permissivo: matita e campi editabili attivi di default; `autoApprove` attivo con finestra di 10 s per attore; il DM può bloccare l'editing o disattivare l'auto-approvazione | il giocatore opera senza attrito; azioni ravvicinate che possono sovrapporsi passano in pending, e il DM mantiene il freno |
| D36 | **Action history persistita** (ultime 50) con undo "fino a qui"; niente undo selettivo nell'MVP; pending volatile | il DM può correggere anche dopo un reload, senza che una coda dimenticata riscriva la scena |
| D37 | Snapshot completo ricaricabile on demand e riconciliato anche periodicamente | azioni e broadcast restano leggeri, ma il client può riallinearsi integralmente senza aspettare una disconnessione |
| D38 | `SceneState` massimo **1 MB**, senza compressione nell'MVP | limite già sufficiente per mappe e azioni; si ottimizza solo se misure reali lo richiedono |
| D39 | Pending senza scadenza automatica; approvazione/rifiuto in blocco solo per lo stesso attore e in ordine | nessuna richiesta scompare per timeout e si riducono le conferme accidentali tra personaggi |
| D40 | HTTP in LAN ammesso nell'MVP; HTTPS opzionale via reverse proxy Caddy, senza certificati gestiti dall'app | il secure context non è prerequisito; Wake Lock e API mobile limitate su HTTP sono documentati |
| D41 | Qualsiasi pubblicazione (`TAKE`, `CUT` o `DIRECT`) richiede conferma extra solo per contenuti marcati dal DM come riservati | la protezione si concentra su schede/mappe sensibili senza aggiungere un click a ogni cambio |
| D42 | Il bottino sulla mappa è `SceneState.loot[]`, separato da token e actor | l'oggetto resta un oggetto, con posizione/quantità di scena; non si inventano actor fittizi |
| D43 | Il mute dei tiri player ha durata scelta dal DM (30 s, 1/5/10/30 min o 1 h), non è persistito; durante il timer il server rifiuta i tiri | pausa narrativa semplice da attivare senza dimenticare un mute permanente o produrre tiri nascosti |
| D44 | La durata media usa tutte le sessioni concluse | statistica stabile e semplice; sessioni aperte non alterano la media |
| D45 | Idempotenza di `requestId` in memoria per 30 s su dadi/chat; possibile duplicato raro dopo riavvio accettato | la deduplica persistente sarebbe sproporzionata per un'app locale; le azioni scena sono già persistite in `action_log` |
| D46 | `action_log` conserva solo le ultime 50 righe per campagna, senza audit storico oltre la finestra | undo limitato e database prevedibile; le righe vecchie vengono eliminate, non solo rese non annullabili |
| D47 | Nessun `TRUST_PROXY` nell'MVP; il bypass loopback vale solo per connessione diretta senza header di forwarding; dietro proxy si richiede `DM_PASSWORD` | gli header inoltrati non diventano una credenziale implicita e il modello resta fail-closed |
| D48 | Tile/LOD per mappe grandi implementati in Fase 4 | le mappe fino a 8k sono un requisito di rendering, non un'ottimizzazione da rimandare a un calo misurato |
| D49 | Per aprire lo schermo A si usa `Window Management API` solo se il permesso è concesso; altrimenti `left/top` best-effort e riposizionamento manuale | non si blocca il flusso su un permesso browser non disponibile o rifiutato |
| D50 | Composizione in MVP: un layer base + pila ordinata di overlay; drag/resize in PVW, `TAKE` atomico, interazione per layer (click-through default), taglio netto | consente mappa + ritratto + lower-third senza lasciare layer vecchi in onda o bloccare per errore la mappa |
| D51 | L'elevazione non modifica la visibilità nella fog; vale il centro del token, a terra o in volo | niente logica 3D nell'MVP; regola semplice, uguale per client e server |
| D52 | La chat IA può ricevere statblock selezionati ma mai `dmNotes` o `playerNotes` | utile per risposte contestuali senza inviare note private a provider esterni |
| D53 | Tema **chiaro / scuro / sistema** con CSS custom properties, `data-theme` sul root e preferenza locale | l'utente sceglie, il sistema resta il default; niente flash grazie a `theme-init.js` esterno caricato prima dei CSS |
| D54 | CSP **senza `unsafe-inline`**: `style-src 'self' 'nonce-…'`, nonce di Angular via `CSP_NONCE`, niente attributi `style` nei template | la scelta di non usare Material elimina la ragione principale di `unsafe-inline`; la policy resta stretta |
| D55 | **TDD e Separation of Concerns** sono capisaldi non derogabili: test prima del codice, un modulo una responsabilità, riuso prima di scrivere | meno regressioni e duplicazione; ogni modifica nasce da un comportamento atteso e da una responsabilità chiara |
| D56 | `ActorStatblock` è un'**unione discriminata per `kind`** (`pc` / `monster` / `npc`) con un nucleo comune; per i `pc` lo stato canonico sta sull'attore e il token lo rispecchia | il tipo impedisce di mettere campi da mostro su un `pc`; HP, condizioni e death saves restano coerenti fuori scena |
| D57 | Builder **SRD 5.2** completo, livelli **1–20**, una sola classe con sottoclasse, talenti e incantesimi SRD; multiclasse escluso; level-up guidato | copre la creazione reale al tavolo senza aprire il caso multiclasse, che moltiplicherebbe tabelle e validazioni |
| D58 | Valori derivati (bonus di competenza, TS, abilità, CA, CD/attacco incantesimi, attacchi) **calcolati in `shared`** dagli input, con override espliciti per homebrew | un level-up o un cambio di equipaggiamento non lascia valori stale; l'override copre le eccezioni |
| D59 | Caratteristiche con **point buy, standard array, 4d6kh3 dal server o inserimento manuale**; il metodo e i tiri restano registrati | tutte le modalità di tavolo sono supportate senza fidarsi del client per i tiri |
| D60 | Scheda **operativa**: HP, slot spesi, dadi vita, death saves, condizioni, inventario e monete. I riposi li dichiara solo il DM e applicano gli effetti deterministici SRD 5.2: il **lungo** recupera tutti gli HP e tutti i dadi vita, riduce l'exhaustion di 1 e azzera i death saves; il **breve** ricarica i privilegi e gli slot pact. La spesa dei dadi vita resta manuale | gestione completa e fedele alle regole, senza automatizzare scelte o tiri che appartengono al tavolo |
| D61 | Avanzamento per campagna: `milestone` (default) o `xp`, modificabile; gli XP si registrano **sempre**; il level-up lo conferma il DM e, se serve, allinea gli XP al minimo del nuovo livello | nessun cambio di scheda a sorpresa; il DM mantiene il controllo anche in modalità XP |
| D62 | Budget iniziale **per personaggio**, precompilato dal valore di classe e modificabile dal DM; il negozio di creazione vende solo equipaggiamento mundano SRD | evita pacchetti rigidi e limita la creazione a oggetti appropriati; gli oggetti magici arrivano dal bottino |
| D63 | La contabilità delle monete usa **rame interi** (`gpToCopper`, `currencyToCopper`, `currencyFromCopper`), mai somme in floating point di mo | aggiungere una flask da 0,02 mo lasciava 4.980000000000004 invece di 4,98; il totale si scompone in monete intere e la UI formatta al massimo due decimali |
| D64 | Ogni pagina usa una **griglia a 12 colonne** (`@mixin grid-12`), **nessuna larghezza massima di pagina**, e occupa **almeno tutta l'altezza disponibile** sotto header e footer, con catena flex e `min-height: 0` | i pannelli non devono mai galleggiare su uno sfondo vuoto né cambiare larghezza in base al contenuto; la griglia a 12 colonne dà una sola regola di composizione a console, wizard e schermate future e sfrutta tutto lo spazio del monitor |
| D65 | **Equipaggia automaticamente** nel wizard: euristica in `shared` che sceglie armatura, scudo, armi, focus, attrezzi e sacca in base a competenze, caratteristiche e budget | il tavolo parte con un kit coerente senza perdere tempo nel negozio; la scelta resta modificabile e il residuo è ricalcolato in rame |
| D66 | Le mappe oltre 2048 px producono una **preview 2048** e una **piramide di tile WebP 512** con percorso deterministico (`tiles/<hash>/<livello>/<col>_<row>.webp`); sotto soglia resta l'immagine singola | evita di caricare un'immagine 8k intera e mantiene il dettaglio pieno quando si smette di panare; nessuna colonna o migrazione aggiuntiva, il manifest deriva da `width`/`height` |
| D67 | Fino alla Fase 7 il riallineamento fra console usa il **log azioni con polling 2 s** (`sinceVersion` + `sceneId`) e `BroadcastChannel` fra tab; i `GET` sono esclusi dal rate limit | due console convergono senza `409` già in Fase 4, senza anticipare il contratto WebSocket della regia |
| D68 | `ActionStore` applica l'azione in modo **ottimistico** e conferma la versione del server senza riapplicarla; un buco di versione ricarica lo snapshot | l'eco della propria azione e il polling non duplicano token o danni, e un evento perso non lascia la console silenziosamente divergente |
| D69 | Le sezioni delle sidebar sono **accordion indipendenti** (Dati campagna, Scene, Griglia, Attori, In mappa) con stato ricordato per campagna | il DM chiude ciò che non usa e recupera spazio verticale senza perdere la sidebar intera; la preferenza resta locale e non tocca lo stato di scena |
| D70 | Gli **slot in basso sono solo dei `pc`**; mostri e NPC fuori scena stanno nell'accordion `Attori` e passano in `In mappa` quando ricevono un token. Ogni scena ha azioni esplicite `Attiva` e `Sostituisci mappa` | la rosa dei giocatori resta stabile e leggibile, mentre il bestiario di lavoro non occupa gli slot; sostituire l'immagine non crea una scena nuova e mantiene token e griglia |
| D71 | **Level-up** e **riposi** sono funzioni pure in `shared`; il server usa la stessa funzione per anteprima e applicazione | la preview non può divergere dal risultato, i riposi sono deterministici e testabili senza database |
| D72 | Undo "fino a qui" applica in transazione gli inversi dal più recente e marca le righe `undone`; il redo ripete l'ultimo batch in ordine cronologico. La console ricarica lo snapshot | non esiste rollback parziale né uno stack locale; la history resta leggibile e il token/attore si riallineano subito dopo il reload |
| D73 | La fog è **vettoriale** (`base` + `FogOp[]`) e viene rasterizzata su una maschera offscreen limitata a 4096 px; la bozza del tratto vive solo nel client e diventa un'azione al rilascio | pan/zoom non cambiano la fog, il tratto è reversibile e 2.000 operazioni restano gestibili; oltre il limite il server risponde `413` |
| D74 | Disegni e fog usano le stesse azioni con inverse e lo stesso undo/redo; l’export PNG è on-demand dal canvas | nessuno stack locale parallelo alla history server e nessun file generato finché il DM non lo chiede |
| D75 | La **proiezione dello schermo** è calcolata server-side da `programs` e filtra token con `visible=false` e quelli non coperti dalla fog; i display ricevono lo snapshot via WS `/ws?role=display&code=…` con polling di fallback ogni 5 s | il client display non riproduce regole di visibilità e non può mostrare per errore token nascosti; la riconnessione riparte sempre da uno snapshot completo |
| D76 | I **link giocatore** sono token casuali salvati hashati; crearne uno nuovo revoca i precedenti, `playerNotes` vive fuori da `dmNotes` e l'export incorpora gli asset WebP come base64 | il token non è recuperabile dal database, le note private non finiscono mai nella vista DM e l'import ricrea sempre una campagna nuova con id rimappati |
| D77 | La **Fase 9 è opzionale e spenta di default**: nessun provider IA configurato, parser regex locale per gli statblock e chat che risponde `503 ai_disabled`; la sidebar mostra lo stato e il parser resta usabile | il tavolo non dipende da rete o chiavi esterne, l'import testuale funziona comunque e l'interfaccia dichiara chiaramente la funzione non disponibile |
| D78 | Il workflow `check` compila `shared` prima del lint (`lint.dependsOn: ['^build']`) | il lint type-aware non legge un `dist` assente o in scrittura durante l'esecuzione parallela di Turbo |

## 5. Struttura monorepo

### 5.1 Workspace e confini

Tre pacchetti privati, un solo lockfile, un solo `node_modules` alla radice:

| Pacchetto | Contenuto | Dipende da |
|---|---|---|
| `@dnd-vtt/client` | app Angular 22: console, display, scheda giocatore | `shared` |
| `@dnd-vtt/server` | Fastify, Drizzle, WebSocket, auth | `shared` |
| `@dnd-vtt/shared` | schemi Zod, tipi, geometria, dadi, derivati della scheda | **niente** |

- la direzione è una sola: `client → shared` e `server → shared`; mai il contrario, mai `client ↔ server`
- i **dataset SRD** stanno nel server (`server/src/srd/`), non in `shared`: il client li consuma via REST e conserva solo lo snapshot della scheda
- `shared` non importa Angular, Fastify, `node:*`, `window` o `document`: è l'unico modo perché lo stesso codice giri in browser, Node e test
- nessun import relativo attraverso i workspace (`../../shared/src/...`): si passa solo dal pacchetto
- i confini sono imposti da ESLint (`no-restricted-imports` per workspace), non dalla buona volontà
- un solo client Angular: `/dm`, `/display/:code` e `/play/:token` sono route lazy, non tre build separate. Meno bundle duplicato, un solo set di token di tema, un solo deploy

### 5.2 Struttura delle directory

```text
dnd-vtt/
├── client/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/            # shell, routing, http, realtime, auth, stores
│   │   │   ├── features/
│   │   │   │   ├── campaigns/
│   │   │   │   ├── character/   # scheda console, builder PC 7 step, level-up, riposi
│   │   │   │   ├── library/     # mostri, npc, catalogo SRD
│   │   │   │   ├── scene/       # Konva stage, token, griglia
│   │   │   │   ├── combat/      # iniziativa, HP, condizioni
│   │   │   │   ├── dice/        # overlay e storico tiri
│   │   │   │   ├── display/     # schermo A, sola lettura
│   │   │   │   ├── play/        # scheda mobile del giocatore
│   │   │   │   └── actor-wizard/ # wizard mostro/NPC (6 step, Signal Forms)
│   │   │   ├── components/      # wrapper dei nativi: button, dialog, table, popover, toast…
│   │   │   ├── ui/              # pipe, direttive, helper di focus e tastiera
│   │   │   ├── styles/          # token, temi light/dark/system, mixin Sass
│   │   │   ├── app.config.ts
│   │   │   └── app.routes.ts
│   │   └── main.ts
│   ├── src/styles.scss          # entry Sass: reset, token, temi, utility "thin"
│   ├── public/                  # favicon, theme-init.js (tema prima del primo paint)
│   ├── e2e/                     # Playwright
│   ├── proxy.conf.json
│   ├── playwright.config.ts
│   ├── angular.json
│   ├── package.json
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── srd/                 # cataloghi 5.2 versionati (JSON), licenza, loader
│   │   ├── routes/
│   │   ├── db/                  # schema, client, repository
│   │   ├── realtime/
│   │   ├── auth/                # password DM, cookie, guardie di ruolo
│   │   ├── assets/              # upload e conversione
│   │   ├── app.ts               # composizione Fastify
│   │   └── index.ts             # env validate, migrate check, listen
│   ├── drizzle/                 # migrazioni generate, committate
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── src/
│   │   ├── index.ts             # barrel unico (D7)
│   │   ├── schemas/             # Zod
│   │   ├── types/               # inferiti dagli schemi
│   │   └── lib/                 # griglia, distanza, fog, dadi, sheet (derive/validate)
│   ├── package.json
│   ├── tsup.config.ts
│   └── tsconfig.json
├── data/                        # RUNTIME, gitignored
│   ├── dnd.db
│   ├── .session-secret
│   └── uploads/
│       ├── originals/
│       ├── webp/
│       └── thumbs/
├── LICENSES/
│   └── SRD-5.2.md               # attribuzione CC-BY 4.0 e crediti in app
├── .github/workflows/ci.yml
├── eslint.config.js
├── .vscode/settings.json        # ESLint come formatter, fix al salvataggio
├── .nvmrc
├── .npmrc
├── .editorconfig
├── .gitattributes
├── .gitignore
├── package.json
├── package-lock.json
├── turbo.json
├── tsconfig.base.json
├── .env.example
├── README.md
└── PLAN.md
```

- `client/src/app/ui/` è la libreria di componenti **interna all'app**; non esiste un quarto workspace `ui`. Il pacchetto `shared` contiene solo codice senza framework
- `server/test/` contiene i test di integrazione con `app.inject`; i test unitari stanno accanto al file (`*.spec.ts`)
- `data/` non è mai dentro un workspace: è runtime, non codice, e non entra in nessun artefatto di build

### 5.3 Script e comandi

`package.json` root:

```json
{
  "name": "dnd-vtt",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=26.0.0 <27" },
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "turbo run lint:fix",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "check": "turbo run lint typecheck test build && npm run db:check",
    "db:generate": "npm run db:generate -w @dnd-vtt/server",
    "db:migrate": "npm run db:migrate -w @dnd-vtt/server",
    "db:check": "npm run db:check -w @dnd-vtt/server"
  }
}
```

| Comando | Effetto |
|---|---|
| `npm ci` | installa esattamente il lockfile; è l'unico comando usato in CI |
| `npm run dev` | client su 4200, server su 3000, `shared` in watch |
| `npm run check` | i gate veloci della CI (senza E2E), in locale |
| `npm run lint` | ESLint su client, server, shared e config; `--max-warnings=0` |
| `npm run lint:fix` | applica correzioni e formattazione Stylistic (`format` è un alias) |
| `npm run db:migrate` | applica le migrazioni; **mai** automatico all'avvio |
| `npm run test:e2e` | Playwright contro il build di produzione servito dal server |

Regole:

- dipendenze dichiarate nel workspace che le usa; alla radice solo tooling (`turbo`, `typescript`, `eslint`, `@stylistic/eslint-plugin`, `typescript-eslint`)
- ogni workspace espone `lint: eslint . --max-warnings=0` e `lint:fix: eslint . --fix`; la config è unica alla radice e viene trovata risalendo la gerarchia
- `.npmrc` con `save-exact=true` e `engine-strict=true`: versioni pinnate e Node sbagliato blocca l'installazione
- `package-lock.json` committato; in CI e nel setup si usa solo `npm ci`. Per aggiungere una dipendenza si usa `npm install <pkg> -w <workspace>`, che aggiorna il lockfile e la pinna esatta
- nessuna migrazione implicita all'avvio: un `npm run dev` non deve poter modificare lo schema di un database esistente. Se manca una migrazione il server parte e `/health` risponde `db: 'migration_pending'`, non esegue DDL a sorpresa

### 5.4 Turborepo

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": ["tsconfig.base.json", "eslint.config.js"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e": {
      "dependsOn": ["build", "@dnd-vtt/server#build"],
      "cache": false,
      "outputs": ["playwright-report/**", "test-results/**"]
    }
  }
}
```

- `build` dipende da `^build`: `shared` viene compilato prima di client e server, sempre, anche con cache fredda
- la cache è **locale** in `.turbo/` e usa come chiave sorgenti, lockfile e variabili elencate. Niente remote cache: un solo sviluppatore, e la CI può permettersi di ricostruire
- `dev` è `persistent` e dipende da `^build`: Turbo non termina, ma prima di avviare `ng serve` e `tsx` il `shared/dist` esiste. `shared` gira con `tsup --watch` senza pulire `dist`, così Angular non vede mai un pacchetto senza tipi (che produrrebbe `TS7006` sparsi)
- `typecheck` e `test` dipendono dal build di `shared` perché i tipi e i test importano il pacchetto compilato, non i sorgenti
- `test:e2e` dipende anche da `@dnd-vtt/server#build`: il client non dipende dal server, ma Playwright avvia il server compilato. Senza questa dipendenza un `npm run test:e2e` da checkout pulito fallirebbe
- le variabili runtime del server (`DATABASE_PATH`, `DM_PASSWORD`, `SESSION_SECRET`) **non** entrano nella cache: non cambiano il bundle
- in CI `TURBO_UI=false` e `CI=true`, così l'output è lineare e leggibile nei log

Limite noto: modificare `shared` mentre `ng serve` è attivo non sempre invalida il chunk nel dev server Angular, che pre-bundle le dipendenze del workspace. Per questo `@dnd-vtt/shared` è escluso dal prebundle (`prebundle.exclude` in `angular.json`): Vite lo tratta come codice dell'app e non può servire un export vecchio. Dopo una modifica a `shared` si riavvia comunque `npm run dev`; il watch non pulisce `dist`, quindi il riavvio non deve più incontrare tipi mancanti.

### 5.5 TypeScript

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true
  }
}
```

| Workspace | Override | Note |
|---|---|---|
| `shared` | `noEmit: true`, `types: []`, `lib: ["ES2022"]` | emette solo `tsup`; nessun tipo DOM o Node, così un import sbagliato fallisce subito |
| `client` | `lib: ["ES2022", "DOM", "DOM.Iterable"]` | compila il builder Angular; `moduleResolution: Bundler` resta valido. Il typecheck passa `--noEmit`, il build non dipende da `tsc` |
| `server` | `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `outDir: "dist"`, `types: ["node"]` | compila `tsc`; gli import relativi **devono** avere l'estensione `.js` |

- la regola `.js` sul server è l'unico attrito dell'ESM nativo: `import { db } from './db/client.js'`. Non è negoziabile con `moduleResolution: NodeNext`, e `tsx` la rispetta in dev
- `verbatimModuleSyntax` impone `import type` per i tipi: niente import eliminati a sorpresa e bundle client più pulito
- `noUncheckedIndexedAccess` è la ragione per cui `fog.ops[i]` va verificato: è esattamente il tipo di bug che in un VTT si manifesta come token fantasma
- niente `paths` verso `shared`: la risoluzione passa dal workspace e dal campo `exports`, così client e server vedono lo stesso artefatto che vedrà la CI
- gli IDE usano il `tsconfig.json` più vicino al file; non c'è un progetto composito unico, che con Angular aggiungerebbe solo complessità

### 5.6 Build e serving

**Sviluppo**

- `ng serve` sulla 4200 con `proxy.conf.json` che inoltra `/api` e `/uploads` alla 3000, inclusi i WebSocket (`ws: true`). Il client non conosce un host API: usa sempre path relativi
- `tsx watch` sul server: riavvio rapido, nessun build intermedio
- `tsup --watch` su `shared`: client e server leggono `dist` aggiornato

**Produzione**

- `npm run build` produce `shared/dist`, `server/dist` e `client/dist/browser`; l'ordine è garantito da Turbo
- Fastify serve i file statici del client con `@fastify/static` da `CLIENT_DIST`, con fallback SPA solo per le GET che non iniziano con `/api/` o `/uploads/`
- un solo processo e una sola origine: niente CORS in produzione, cookie DM same-site senza eccezioni
- `index.html` con `Cache-Control: no-store`; asset con hash nel nome con `immutable, max-age=31536000`
- `PUBLIC_URL` costruisce gli URL di display e i QR; non è un path di build
- source map del server tenute su disco, non servite; quelle del client disattivate in produzione
- budget Angular: warning a 700 kB, errore a 1.2 MB sull'initial bundle. Konva e il wizard sono lazy, quindi il budget misura la shell, non la scena
- il server non include mai `data/` né `client/` nel proprio artefatto: il deploy è "build + data esterna"

### 5.7 CI

Un solo job: lint, typecheck, unit, build ed E2E condividono la cache Turbo e il build, senza passarsi artefatti tra job.

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      CI: true
      TURBO_TELEMETRY_DISABLED: 1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run db:check
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - run: npm audit --audit-level=high
        continue-on-error: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            client/playwright-report
            client/test-results
          retention-days: 7
```

- **E2E a ogni PR** (D30): il doppio schermo, la fog e il protocollo di azioni sono i punti che si rompono senza un test che apre due contesti
- Playwright usa il build di produzione, non il dev server: si testa ciò che il DM eseguirà davvero
- il database E2E è un file temporaneo creato nel `globalSetup` con le migrazioni applicate; nessun servizio esterno, nessun Docker
- `db:check` fallisce se lo schema Drizzle e le migrazioni committate divergono: un errore qui è un deploy rotto
- il lint copre TS, template Angular e config con `--max-warnings=0`; non esiste un passo di formattazione separato, perché Stylistic gira dentro ESLint
- `npm audit` è una segnalazione, non un blocco (14.6); le patch di Angular hanno priorità
- `concurrency` cancella i run superati: con un solo sviluppatore non ha senso sprecare minuti su un commit già sostituito
- il job `ci` è richiesto da branch protection su `main`; non esiste un passo di deploy, l'app gira in locale
- primo run a freddo ~10-15 minuti; con cache Turbo e browser Playwright si scende sotto i 5

### 5.8 Naming e formattazione

- file in `kebab-case`; Angular 22 senza suffisso `.component` (`scene-stage.ts`), classi in `PascalCase`
- identificatori, nomi di file e API in inglese; stringhe UI e documentazione in italiano (sezione 2)
- `import type` obbligatorio per i tipi; `any` esplicito vietato (`@typescript-eslint/no-explicit-any: error`); `no-floating-promises` e `no-misused-promises` attivi perché il realtime è pieno di promise non attese
- un solo barrel, `shared/src/index.ts`; vietati i deep import `@dnd-vtt/shared/src/...` (il campo `exports` li rende impossibili) e i barrel interni alle feature, che creano cicli
- **ESLint 10 flat config** unica alla radice (`eslint.config.js`), con preset **recommended** e override minimi di progetto. `eslint --fix` è l'unico comando di formattazione: **niente Prettier**, niente `eslint-config-prettier`
- compatibilità verificata: ESLint 10 richiede Node `^20.19 || ^22.13 || >=24` e supporta solo flat config (no `.eslintrc`); `typescript-eslint` 8.72+, `@stylistic/eslint-plugin` 5.10+ e `angular-eslint` 22.6+ dichiarano `eslint ^10` come peer. TypeScript resta 6.0.x (`typescript-eslint` accetta `<6.1`)
- preset: `@eslint/js` recommended, `typescript-eslint` **recommendedTypeChecked** (type-aware, `projectService: true`), `@stylistic/eslint-plugin` **recommended**, `angular-eslint` **tsRecommended** + **templateRecommended** + **templateAccessibility**
- **tutto il codice è lintato**: `client/**/*.ts`, `client/**/*.html`, `client/e2e/**/*.ts`, `server/**/*.ts`, `shared/**/*.ts`, test e file di configurazione. Ignorati solo `dist`, `.angular`, `coverage`, `data`, `playwright-report`, `test-results`
- override Stylistic di progetto: 2 spazi, single quote (`avoidEscape`), punto e virgola sempre, trailing comma `all`, fine riga LF, newline finale, `max-len` 110 con URL e stringhe esenti. `.gitattributes` forza LF anche su Windows
- regole di progetto sopra il preset: `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `consistent-type-imports` e `no-console` a `error`; `no-restricted-imports` per i confini (Angular/Fastify/DOM vietati in `shared`, deep import vietati)
- i file di configurazione alla radice (`*.config.ts`, `*.config.mjs`) hanno un override **senza type information**: non appartengono a un `tsconfig` e non devono forzare `allowDefaultProject`
- CI e `npm run check` usano `--max-warnings=0`: un warning è un errore. `lint:fix` è solo locale
- `.vscode/settings.json` usa ESLint come formatter e `source.fixAll.eslint` al salvataggio, così l'editor non introduce stili diversi dal lint

```js
// eslint.config.js — sintesi della struttura, non il file completo
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.angular/**', '**/coverage/**', 'data/**', '**/playwright-report/**'] },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      stylistic.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    languageOptions: { parserOptions: { projectService: true } },
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
```
- test unitari `*.spec.ts` accanto al sorgente; E2E solo in `client/e2e/*.spec.ts`, esclusi dalla config Vitest
- copertura: soglia solo su `shared` (80% righe, 75% rami). Client e server crescono per integrazione, senza un numero globale che spinge a test finti

### 5.9 Versioning, dati e migrazioni

- una sola versione per l'app, `0.1.0` alla radice; i tre pacchetti sono `private` e non vengono pubblicati
- tag `vX.Y.Z` sul commit di release; nessun changelog generato finché non c'è una release pubblica
- `schemaVersion` dell'export è indipendente dalla versione dell'app (12.10)
- migrazioni Drizzle committate e mai modificate dopo il merge: se serve una correzione si genera una nuova migrazione
- `data/` e `.env` fuori dal repository; `.env.example` aggiornato nello stesso commit che introduce una variabile
- backup = export JSON con asset embedded; le note dei giocatori entrano solo con `includePrivateNotes=true`; copiare `data/dnd.db` a caldo non è una procedura supportata

### 5.10 Fuori scope

- Nx, project references e remote cache: Turbo con cache locale basta per tre workspace
- SSR o prerender: l'app è locale, il serving statico same-origin è più semplice e non introduce un runtime Node in più
- Docker obbligatorio: può essere un'aggiunta di deployment, non un requisito di sviluppo
- pubblicazione npm di `shared`, package `ui` separato, microfrontend o più app Angular
- migrazioni automatiche all'avvio: lo schema si muove solo con un comando esplicito

### 5.11 Linee guida di codice e pattern

#### 5.11.0 Capisaldi non derogabili

**TDD (D55).** Ogni comportamento nuovo o corretto parte da un test che lo descrive; il ciclo è **red → green → refactor**. Non si committa logica di produzione senza un test che la copra, e ogni bug parte da un test di regressione che fallisce prima della correzione. Vale anche per il codice generato dall'IA: nessuna patch senza test. Per canvas, layout e interazioni si testa al livello più basso utile (funzione pura, store, API, componente) e si lascia all'E2E solo ciò che richiede un browser vero. Gli spike esplorativi sono usa-e-getta e non entrano nel repository.

**Separation of Concerns (D55).** Un modulo, un componente o un service ha **una sola responsabilità** e una sola ragione per cambiare. La direzione delle dipendenze è obbligatoria:

- client: componente → store → service → `shared`; un componente non parla direttamente al database né costruisce query
- server: route → service → repository → `shared`; una route non contiene regole di gioco, un repository non conosce HTTP
- `shared`: nessuna dipendenza da Angular, Fastify, DOM o filesystem

Se per descrivere un file serve la congiunzione "e" ("gestisce i token **e** calcola la fog"), va diviso. La UI non conosce SQL, il server non conosce il DOM, `shared` non conosce l'I/O.

**Le quattro domande, prima di scrivere.** Ogni modifica — umana o generata — passa da qui e la risposta non è mai "sì, probabilmente":

1. **Posso riusare questo pezzo di codice?**
2. **È facilmente testabile?**
3. **Ho già altrove qualcosa di simile?**
4. **Sono sicuro che questo codice si occupa di una sola cosa?**

Prima di creare un file si cerca nel repository (`shared`, wrapper esistenti, helper, schemi Zod). Se la risposta a "facilmente testabile" o "una sola cosa" è no, ci si ferma e si rifattorizza o si riprogetta: non si aggiunge un test finto per giustificare un accoppiamento. La duplicazione è un bug, non una scorciatoia.

Regole trasversali, valide in tutti e tre i workspace:

- codice e identificatori in **inglese**, stringhe UI in **italiano**, commenti in **italiano** solo dove spiegano il perché
- una responsabilità per file; niente codice morto, commentato o lasciato "per dopo"
- funzioni pure quando il risultato non dipende da I/O; dipendenze esplicite nei parametri o iniettate
- niente `any` e niente cast non verificati: `unknown` + parsing Zod ai confini, tipi inferiti dalle schemi
- immutabilità di default: si costruiscono nuovi oggetti invece di mutare quelli condivisi; le API pubbliche espongono `readonly`
- nessuna regola di gioco nei componenti o nelle route: la logica condivisa vive in `shared`, l'orchestrazione negli store o nei service

#### 5.11.1 Pattern Angular

- solo **standalone component**; nessun `NgModule`
- dipendenze con `inject()` nei field initializer, mai DI via costruttore
- I/O con `input()`, `input.required()`, `output()` e `model()`; niente decoratori `@Input`/`@Output`
- query con `viewChild()` / `contentChild()` in forma signal; niente `@ViewChild`
- ogni componente dichiara `ChangeDetectionStrategy.OnPush`; l'app resta zoneless
- template con control flow nativo (`@if`, `@for`, `@switch`); `track` obbligatorio nei `@for`
- niente accesso diretto a `document` o al DOM nei componenti di feature: solo i wrapper usano `Renderer2`/`ElementRef`; le misure si fanno in `afterNextRender`
- routing lazy per feature con `loadComponent`/`loadChildren`; guardie e resolver funzionali
- dati con `resource()`/`httpResource` e stati `loading`/`error` espliciti; sottoscrizioni manuali solo per stream che lo richiedono
- form complessi con **Signal Forms**; `ControlValueAccessor` solo nei wrapper che devono integrarsi con i form
- errori non gestiti → `ErrorHandler` globale + toast; niente `console.log` nel codice di produzione
- accessibilità non opzionale: HTML semantico, label associate, focus visibile, chiusura con Esc, `aria-live` per i risultati, rispetto di `prefers-reduced-motion`
- `@defer` per pannelli pesanti (libreria, wizard); Konva caricato solo nelle route che mostrano una scena

#### 5.11.2 Stato e flussi

- **`SignalStore` per il dominio** (`scene`, `action`, `program`, `dice`, `combat`, `campaign`, `library`); semplici servizi con signal per lo stato effimero e di UI (pannelli, selezione, strumento attivo, `UiStore`)
- lo store è l'unico punto che muta il proprio stato: i componenti chiamano metodi, non `patchState`; lo stato esposto è `readonly`
- lo stato derivato è `computed`, mai copiato in un secondo campo; niente `effect()` usato per derivare stato, solo per effetti collaterali
- flusso di una modifica condivisa: componente → `ActionService` → store ottimistico → conferma server → riconciliazione. Nessun componente chiama direttamente endpoint che cambiano `SceneState`
- il server resta la verità: l'id ottimistico e la `stateVersion` locale non vengono mai riusati come definitivi; su `action_stale` si ricarica lo snapshot
- un solo posto per la connessione WS: `RealtimeService` smista agli store; nessun componente apre socket propri
- id delle nuove entità con **UUID v7** tramite helper in `shared` (D6), validati dal server; nessun id derivato da indici o dal tempo
- i timestamp persistiti li assegna solo il server; il client non li inventa
- cleanup obbligatorio: `DestroyRef`/`takeUntilDestroyed` per le sottoscrizioni, chiusura delle risorse nel `withHooks` degli store
- niente stato applicativo in singleton o variabili di modulo: o è in uno store, o è locale al componente

#### 5.11.3 Pattern server

- un plugin Fastify per area (`campaigns`, `scenes`, `actors`, `assets`, `program`, `auth`, `realtime`); le route sono sottili: schema → service → repository
- ogni azione di scena gira in **una transazione** che applica l'effetto, calcola l'inverso e scrive `action_log` (D34); nessuna scrittura parziale
- i repository ricevono il handle/transazione come parametro: niente singleton del database dentro i service, così la transazione è componibile e testabile
- Zod valida input **e** output; il tipo della route deriva dallo schema, non da un'interfaccia duplicata
- errori attesi con un `AppError` tipizzato (`code` union + `details`), mappati centralmente nell'envelope; un errore inatteso diventa `500` con `requestId`, stack solo nei log
- nessun `process.env` fuori dal modulo di configurazione; il resto del server riceve l'oggetto `env` tipizzato
- log strutturati con `requestId`, senza body, cookie, token o note; niente `console.log`
- promise sempre attese; `void` ammesso solo con un `catch` esplicito. Shutdown che chiude WS, timer e database
- WS: envelope, `seq` e filtri di ruolo in un unico modulo; il display riceve solo proiezioni già filtrate, mai eventi grezzi
- SQL solo tramite Drizzle, mai concatenazione di stringhe; migrazioni additive e verificate in CI con `db:check`

#### 5.11.4 Pattern `shared`

- solo codice puro e isomorfo: niente DOM, niente API Node, niente import di Angular o Fastify
- determinismo: RNG e clock iniettabili; nessuna chiamata a `Date.now()` o `Math.random()` dentro le regole
- lo schema Zod è la fonte del tipo (`z.infer`); non si mantengono interfacce parallele destinate a divergere
- un solo barrel; niente import interni tra feature di `shared`
- limiti e costanti condivisi (2.000 op fog, 1 MB scena, 50 azioni, durate mute, codici errore) vivono qui, così client e server non possono divergere
- **denaro in rame interi**: i prezzi in mo si convertono con `gpToCopper`, i totali si scompongono con `currencyFromCopper` e si confrontano in rame; mai sommare `valueGp` in floating point (D63)
- geometria e parser restituiscono nuovi valori, non mutano gli argomenti; gli errori di parsing sono tipi espliciti, non stringhe

#### 5.11.5 Componenti e Sass

- ogni componente ha **`.ts`, `.html` e `.scss` separati**, anche i wrapper piccoli (decisione di progetto); niente template o stili inline
- i wrapper di `components/` contengono un solo elemento nativo, inoltrano attributi e ARIA, gestiscono focus/tastiera/stato disabilitato e **non** contengono logica di dominio
- classi semantiche in stile BEM (`scene-toolbar`, `token-card__name`, `token-card--selected`); annidamento massimo 3 livelli; niente `!important` se non documentato
- `@use` al posto di `@import`; ogni file dichiara le proprie dipendenze
- solo token CSS (`--bg`, `--surface`, `--text`, `--line`, `--accent`, `--danger`…): nessun colore, raggio o ombra hardcoded nelle feature
- stile **thin**: bordi 1 px, raggi 4-6 px, ombre solo su overlay e dialog, niente gradienti; spaziature sulla scala 4/8/12/16/24/32
- stati con `:hover` (solo pointer fine), `:focus-visible`, `[disabled]`, `[aria-expanded]`; `.is-*` solo per stati transitori non esprimibili con attributi
- niente attributi `style` nei template e niente `setAttribute('style', …)`: i valori dinamici passano da CSS custom properties impostate via CSSOM (`el.style.setProperty`)
- `:host` esplicito (`display: block/flex`) e nessun selettore globale di elemento fuori dal reset
- pannelli e sidebar con container query dove il layout dipende dalla larghezza del contenitore, non del viewport
- **layout di pagina a 12 colonne** (`@mixin grid-12` in `styles/_layout.scss`): i figli dichiarano `grid-column: span N`; sidebar e pannelli non usano larghezze fisse in px
- **altezza piena**: la catena `shell main → route host → pagina` usa `flex: 1` e `min-height: 0`, così ogni pagina occupa almeno tutto lo spazio tra header e footer e i pannelli si estendono invece di restare a metà (D64)
- **nessuna larghezza massima di pagina**: console e wizard usano il 100% dello spazio disponibile; eventuali limiti si applicano solo a testo e modali, non al layout
- animazioni brevi e disattivabili con `prefers-reduced-motion`

#### 5.11.6 Errori e messaggi

- i codici errore restano in inglese (`action_stale`, `rolls_muted`); le stringhe mostrate sono italiane e mappate per codice, mai il messaggio grezzo del server
- un `500` mostra anche il `requestId`, così il log è ritrovabile senza esporre dettagli
- errori di form inline, accanto al campo; i toast solo per eventi transitori, mai per validazione
- niente `alert`, `confirm` o `prompt`: si usano i wrapper `app-dialog`/`app-toast`
- gli stati `offline`, `read-only` e `pending` sono sempre espliciti nella UI, non silenziosi

#### 5.11.7 Pattern di test

- **TDD**: si scrive prima il test che fallisce, poi il codice minimo per passare, poi si rifattorizza. Niente test aggiunti solo per alzare la copertura
- un test verifica un comportamento, non l'implementazione; niente snapshot di canvas o di interi alberi DOM
- test deterministici: seed fissi per il RNG, fake timer, nessun `sleep`; factory per costruire fixture valide
- E2E con locator per ruolo, label e testo visibile; `data-testid` solo quando l'elemento non ha un'identità accessibile
- ogni bug corretto aggiunge un test che fallirebbe senza la correzione
- API testate con `app.inject`, senza aprire porte reali; WS con un client in memoria
- i test di concorrenza usano due richieste realmente concorrenti, non due chiamate sequenziali travestite
- un test che richiede troppi mock segnala un problema di Separation of Concerns: si rifattorizza il codice, non si complica il test
- **template Angular type-checked**: il `typecheck` del client usa `ngc -p tsconfig.app.json --noEmit`, non `tsc`; solo il compilatore Angular legge i template e intercetta errori come un `number | undefined` passato a una funzione. `strictTemplates` resta attivo

#### 5.11.8 Git, commit e commenti

- **nessun commit senza gate verde**: `.githooks/pre-commit` esegue `npm run check` (lint, typecheck con template Angular, test, build e `db:check`) e blocca il commit se uno dei passi fallisce; non si usa `--no-verify` e la CI ripete gli stessi controlli
- **Conventional Commits** con descrizione in italiano: `feat(scene): crea il token trascinato sulla mappa`, `fix(program): non pubblica overlay riservati senza conferma`
- tipi ammessi: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`; scope = workspace o feature (`client`, `server`, `shared`, `scene`, `program`…)
- un commit = una modifica logica; `main` sempre verde; storia lineare con rebase, niente merge commit
- corpo del commit quando serve a spiegare il **perché**, avvolto a 72 colonne
- commenti in italiano e solo per scelte non ovvie (vincoli CSP, workaround, formule); niente commenti che ripetono il codice
- JSDoc solo sulle API pubbliche di `shared`; niente codice commentato: se serve storia, c'è Git
- `TODO` con il motivo e la fase: `// TODO(Fase 7): il layer mappa accetta un solo viewport`

## 6. Architettura logica

### 6.1 Frontend Angular

- `AppShell` + routing lazy per feature
- Store e servizi con Signals:
  - `LibraryStore` — attori di libreria, filtri, paginazione
  - `CampaignStore` — campagne e scena attiva
  - `SceneStore` — documento `SceneState`, applicazione ottimistica delle azioni, reconcile con il server
  - `ActionStore` — coda pending, action history, undo "fino a", notifiche
  - `CombatStore` — iniziativa derivata da `SceneState`
  - `CharacterStore` — scheda, builder draft, level-up, riposi, XP e `sheetVersion`
  - `DiceStore` — storico tiri dal log server, preferenze (vantaggio, visibilità)
  - `ProgramStore` — `ProgramState` in onda, PVW (staging), `TAKE`/`CUT`, blackout, camera
  - `UiStore` — pannelli, modalità DM/giocatore, strumento attivo
  - `RealtimeService` — connessione WS, eventi remoti applicati agli store
  - `DisplayService` — solo in `/display/:code`: snapshot del program in onda, aggiornamenti, riconnessione con backoff
- **`SrdCatalogService`** — cataloghi SRD versionati via REST, cache in memoria per `rulesVersion`; il wizard carica solo le collezioni che gli servono, la scheda usa lo snapshot
- **builder e level-up** usano **Signal Forms**: lo stato della bozza è un signal, la validazione per step è Zod condivisa, il salvataggio è un comando esplicito
- **`ThemeService`** — preferenza `light | dark | system` in `localStorage`, `data-theme` sul `<html>`, listener su `prefers-color-scheme` quando la scelta è `system`; vale per console, scheda giocatore e display
- **`components/`**: wrapper sottili dei nativi (`app-button`, `app-dialog`, `app-popover`, `app-table`, `app-toast`, `app-switch`, `app-field`…), con stile e comportamento custom; i componenti di feature non usano mai direttamente i nativi interattivi
- **Sass**: token in CSS custom properties (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, `--danger`…), tema chiaro e scuro sotto `[data-theme='light|dark']`, `system` risolto in `prefers-color-scheme`. Stile "thin": bordi 1 px, ombre minime, niente gradienti
- niente CSS framework esterno e niente `style` inline nei template: la posizione dinamica degli overlay usa custom properties impostate via CSSOM
- `DiceOverlayService` apre l'overlay dadi con l'elemento nativo `<dialog>` in top layer (o Popover API dove serve), focus trap manuale, chiusura con Esc
- Rendering: Konva con layer separati (mappa, griglia, fog, token, loot, disegni, misure)
- `SceneStore` non scrive mai il documento sul server: emette `GameAction` (6.5), applica in locale per reattività e lascia al server la verità. Nessun componente muta `SceneState` direttamente

### 6.2 Backend Fastify

- REST come fonte di verità + WS per broadcast e comandi camera del DM
- **`ActionService` è l'unico punto che muta `SceneState`**: valida, calcola l'inverso, applica in transazione, incrementa `state_version` e trasmette il risultato (6.5–6.7)
- **`CharacterService`** gestisce creazione, level-up, riposi e XP: ogni operazione è una transazione su attore + inventario + risorse + snapshot, con `sheetVersion` e aggiornamento del token in scena
- **`SrdCatalog`** è un modulo di sola lettura con JSON versionati e licenza; non è nel database e non viene mai scritto dal client
- `deriveSheet()` e `validatePcBuild()` vivono in `shared` e sono richiamati sia dal client sia dal server, così i due lati non possono divergere
- coda di approvazione in memoria per le azioni dei giocatori che toccano lo stato condiviso; auto-approvazione permissiva con cooldown di 10 s e decisione manuale del DM per le sovrapposizioni (6.6)
- proiezione `DisplayState` calcolata dal server a partire dal `ProgramState`: il filtro dei dati nascosti non è delegato al client
- validazione Zod su body, params, query e **response** (contratto esplicito)
- Repository Drizzle, nessuna query nei route handler
- Upload con `sharp`: originale + WebP + thumbnail
- Serving statico solo da `data/uploads/` con path risolti e validati

### 6.3 Shared

Schemi Zod e tipi inferiti per: `Actor`, `ActorStatblock`, `PcStatblock`, `MonsterStatblock`, `NpcStatblock`, `DerivedSheet`, `SheetOverrides`, `Scene`, `SceneState`, `Token`, `GridConfig`, `Campaign`, `InitiativeEntry`, `FogState`, `FogOp`, `Drawing`, `Asset`, `ProgramState`, `DisplayState`, `DisplayDelta`, `DiceRoll`, `Session`, `Item`, `InventoryEntry`, `ChatMessage`, `PlayerSheetView`, `DmSheetView`, `PlayerEditableField`, `FieldPolicy`, `GameAction`, `ActionEnvelope`, `PendingActionView`.

Helper puri, **testati con Vitest**:
- modificatore da caratteristica
- conversione offset ↔ coordinate cubiche esagonali
- calcolo distanza (quadrata e esagonale)
- snap alla griglia
- **fog**: `isPointRevealed(fog, point)` e `isTokenRevealed(fog, token)` — geometria pura, stessa logica su client e server
- **azioni**: `applyAction(state, action)` usata dal server per applicare e dal client per l'aggiornamento ottimistico; `invertAction(state, action)` solo server-side, perché richiede lo stato prima
- validazione e normalizzazione statblock, `validatePcBuild()` per la creazione e il level-up
- `deriveSheet()`: modificatori, competenza, TS, abilità, CA, iniziativa, passiva, CD/attacco incantesimi, attacchi, capacità di carico
- default statblock e tabelle SRD condivise (soglie XP, competenza per livello, slot per classe)
- **dadi**: parser di formule, roller con RNG iniettabile, vantaggio/svantaggio; lo stesso roller gira sul server, che è l'unico esecutore dei tiri

`shared` non importa Angular, Fastify, Node API o DOM.

### 6.4 Doppio schermo e regia

Due sessioni browser indipendenti, stesso backend, ruoli diversi. Lo schermo A è un **output in onda** (come il program di OBS), non uno specchio automatico della scena su cui sta lavorando il DM.

| | Schermo A — `/display/:code` | Schermo B — `/dm` |
|---|---|---|
| Contenuto | solo ciò che è **in onda** (`ProgramState`) | console completa, vista main = PGM, PVW richiamabile |
| Scrittura | nessuna (read-only) | scena e program |
| Canale | WS ruolo `display` | WS ruolo `dm` bidirezionale + REST |

Esiste una terza superficie, `/play/:token` (8.14): una scheda mobile per il giocatore, con permessi per campo sul **solo** attore collegato. Non è un ruolo "ridotto" della console: è un canale separato che non vede scena, program, fog o altri attori.

#### 6.4.1 Program e Preview

- `ProgramState` è la **sorgente di verità di ciò che è in onda**, salvata per campagna
- contenuti di layer: `blank`, `map` (scena scelta dal DM), `actor` (scheda `pc` o mostro), `image` (handout), `text` (annuncio), `item`, `initiative`; una composizione ha un layer base e una pila ordinata di overlay
- attenzione: "scena" qui è sempre la mappa di gioco, non la scena-layout di OBS; la regia usa i termini `program`, `preview` e `contenuto`
- HUD indipendente dalla composizione: tiro dadi, ticker iniziativa e puntatore; il blackout copre tutti i layer
- la console ha un solo monitor principale: la **vista main è il PGM**, cioè esattamente ciò che è in onda
  - **PGM**: la vista centrale, interattiva, con fog al 50% per il DM
  - **PVW**: riquadro richiamabile per preparare il prossimo contenuto, non un secondo monitor fisso
- PVW prepara la composizione completa; il DM trascina/ridimensiona ogni overlay nel frame preview. I frame sono normalizzati rispetto al canvas, quindi valgono su TV con aspect ratio diverso
- la lista layer in PVW ordina gli overlay dal basso verso l'alto; per ogni layer il DM può impostare contenuto, frame, opacità, interattività e flag "Riservato". L'overlay non interattivo è click-through
- cambiare la **composizione** passa da PVW + `TAKE`; modificare la **mappa già in onda** resta immediato e gli overlay restano sopra
- `TAKE` pubblica l'intera composizione PVW in modo atomico; `CUT`/`DIRECT` pubblica immediatamente l'intera composizione. Il passaggio è un taglio netto, senza transizioni nell'MVP
- ogni layer ha `interactive`; `false` è click-through e lascia arrivare il puntatore al layer sottostante, `true` riceve input. Gli overlay sono click-through di default; la mappa base è interattiva
- il DM può marcare un layer **"Riservato"** (`confirmBeforeTake`); se almeno un layer della composizione nuova è marcato, qualunque pubblicazione (`TAKE`, `CUT` o `DIRECT`) richiede conferma. Annullando, il PGM non cambia
- lavorare su una scena **non** la manda in onda: la pubblicazione è sempre un'azione esplicita
- il DM può "mandare in onda" anche solo la scheda di un NPC o un'immagine, senza toccare la scena attiva

#### 6.4.2 Interazione dal monitor

- PGM e schermo A usano **lo stesso componente canvas**, in scale diverse: gli eventi di puntatore vengono riproiettati con il fattore di scala, quindi il DM interagisce sul monitor come se fosse lo schermo A
- sul PGM il DM può trascinare token, dipingere fog, cambiare viewport e tirare dadi: le mutazioni passano dalla **stessa pipeline di comandi** della schermata principale
- pan e zoom sul layer mappa attivo muovono la **camera dello schermo A** (`ProgramLayer.content.viewport`) quando la modalità è `Live`; in modalità `Libera` il DM esplora senza spostare la proiezione e usa "Riallinea" per riprendere la camera
- la camera della layer mappa è bloccabile (`cameraLocked`): il DM può fissarla e riprenderne il controllo quando vuole
- cursore del DM proiettato sullo schermo A come puntatore laser (opzionale), coordinate inviate su WS con throttle
- lo scroll di una scheda statblock resta locale al DM; il contenuto proiettato è identico

#### 6.4.3 Sync e pairing

- pairing: codice 6 caratteri base32, PIN opzionale, QR per un secondo dispositivo, revoca immediata
- il pulsante "Apri schermo giocatori" usa `window.open` come **solo scorciatoia UX**, non come canale dati (D20); sceglie monitor e dimensioni tramite `Window Management API` se il permesso è concesso, altrimenti usa `left/top` best-effort e lascia al DM il riposizionamento manuale
- la finestra figlia apre il proprio WS usando il codice nell'URL: nessun `postMessage`, nessun relay attraverso la console. Chiudere la console non spegne lo schermo A
- `window.opener` è usato solo per rilevare `closed` e chiudere la finestra dal pulsante; se manca (URL copiata, QR, OBS, refresh da cronologia) il comportamento è identico
- se `window.open` viene bloccato dal browser, si mostrano URL e QR come fallback: il flusso non si interrompe
- lo snapshot iniziale è un `DisplayState` **già risolto** a partire dal program
- WS bidirezionale per il DM: `program.viewport` viaggia sul socket (throttle 50 ms) per una camera fluida, il server lo fonde nello stato corrente e persiste il program con debounce. Il viewport **non** incrementa `program_version`, quindi non entra in conflitto con i `PUT` di contenuto
- display riconnesso → snapshot completo (program + contenuto), nessuna ricostruzione incrementale
- presence sulla console, polling di fallback ogni 2 s, fullscreen al click, Wake Lock dove disponibile
- filtro **lato server**: token non `visible`, iniziativa `hidden` e tiri `dm` non escono mai dal backend
- gli eventi della scena inviati allo schermo A sono `DisplayDelta` calcolati dal server confrontando le proiezioni prima/dopo; token e loot vengono filtrati per visibilità e fog. Mai il `GameAction` grezzo, che potrebbe rivelare entità coperte o nascoste

#### 6.4.4 Regole

- un solo program per campagna
- il program è persistito: riavvio del server e riconnessione non perdono ciò che è in onda
- `blackout` per le pause, ripristino con un click
- aspect ratio: il contenuto è letterboxed sul colore `background`, la mappa non viene mai deformata
- cambiare contenuto in onda non altera `SceneState`: sono due stati separati

### 6.5 Modello ad azioni

Nessun client scrive `SceneState`. Ogni modifica è una **azione** inviata al server, che la valida, calcola l'inverso, la applica in transazione e trasmette il risultato. Il documento resta la rappresentazione persistita; l'azione è l'unità di lavoro.

```ts
interface ActionEnvelope {
  id: string;              // uuid v7, chiave di idempotenza
  clientId: string;        // tab o dispositivo, generato dal client
  campaignId: string;
  sceneId?: string;        // assente per le azioni sul solo attore
  actorId?: string;        // attore del link, per le azioni player
  origin: 'dm' | 'player';
  action: GameAction;
}

type GameAction =
  | { type: 'token.add'; token: TokenState }
  | { type: 'token.move'; tokenId: string; x: number; y: number }
  | { type: 'token.update'; tokenId: string; patch: TokenPatch }
  | { type: 'token.remove'; tokenId: string }
  | { type: 'token.hp'; tokenId: string; delta: number }
  | { type: 'token.condition'; tokenId: string; op: 'add' | 'remove' | 'update'; condition: Condition }
  | { type: 'initiative.set'; entries: InitiativeEntry[]; currentId: string | null }
  | { type: 'initiative.next' }
  | { type: 'fog.apply'; op: FogOp }
  | { type: 'fog.replace'; base: FogState['base']; ops: FogOp[] }
  | { type: 'drawing.add'; drawing: Drawing }
  | { type: 'drawing.remove'; drawingId: string }
  | { type: 'loot.add'; loot: LootEntry }
  | { type: 'loot.move'; lootId: string; x: number; y: number }
  | { type: 'loot.update'; lootId: string; patch: Partial<Omit<LootEntry, 'id'>> }
  | { type: 'loot.remove'; lootId: string }
  | { type: 'grid.update'; grid: GridConfig }
  | { type: 'actor.hp'; actorId: string; delta: number }
  | { type: 'actor.condition'; actorId: string; op: 'add' | 'remove' | 'update'; condition: Condition };
```

- `origin` è derivato dalla credenziale, mai dal body: un client `player` non può dichiararsi `dm`
- `at` e `label` (per la action history) sono assegnati dal server; il client non può falsificare la descrizione di ciò che ha fatto
- il server calcola l'**inverso** guardando lo stato *prima* dell'applicazione. Il client non invia mai l'inverso: se lo facesse, potrebbe riscrivere la storia
- le azioni sono idempotenti per `id`: un retry di rete non applica due volte lo stesso danno
- un'azione non è un comando di UI: `token.move` porta la posizione finale, non ogni frame del drag; `fog.apply` porta una sola `FogOp`, non l'intero tratto
- niente CRDT, niente merge di documenti: il server serializza le azioni e il client si riallinea allo stato risultante

### 6.6 Approvazione e coda

Non tutto ciò che il giocatore tocca ha lo stesso peso. La distinzione è per **effetto sul tavolo**, non per campo del form:

| Dato | Policy | Cosa succede |
|---|---|---|
| HP, condizioni, death saves | `approval` | auto-approvata secondo `campaigns.auto_approve` e cooldown per attore; altrimenti pending e decisione DM. Ogni azione applicata entra nella history |
| token, iniziativa, fog, disegni, griglia | `dm-only` | il giocatore non li può proporre; il DM li applica diretti. Non è una `FieldPolicy`, è l'assenza di una via di scrittura per il player |
| inventario, equipaggiamento, monete, spell slot, risorse, dadi vita | `notify` | applicazione diretta, notifica leggera al DM, **fuori** dalla history e non annullabile; se un oggetto è stato assegnato per errore, il giocatore può restituirlo al DM |
| riposi | `dm-only` | solo il DM dichiara breve/lungo; il telefono riceve gli aggiornamenti, non può avviarli |
| note private del giocatore | `private` | applicazione diretta, nessuna notifica, fuori dalla history |
| tiri | evento | nessuna approvazione, nessuna history; restano in `dice_rolls` |

- `editingEnabled` è un interruttore per link giocatore, rappresentato dalla **matita** sullo slot del personaggio: se è spento, ogni scrittura del telefono risponde `403 editing_disabled`, comprese le note. La lettura resta disponibile. È `true` alla creazione del link: la regola è permissiva; il DM può bloccare il giocatore se nascono confusioni
- `campaigns.auto_approve` è il toggle **"Auto-approva azioni"** nel dock `Azioni`, attivo di default. Si applica alle azioni `approval` di tutti i player della campagna; se il DM lo spegne, ogni nuova azione resta pending fino alla decisione manuale. Le pending già esistenti non vengono cancellate dal toggle
- con auto-approvazione attiva, la prima azione `approval` di un attore (o la prima dopo almeno 10 secondi senza azioni `approval`) viene applicata subito. Se una seconda azione dello stesso attore arriva entro 10 secondi, resta pending. Ogni nuova azione valida aggiorna il timer; un retry con lo stesso id non è una nuova azione e non lo aggiorna
- se per un attore esiste già una pending, le sue nuove azioni `approval` restano pending anche dopo il cooldown: il DM risolve la sequenza nell'ordine ricevuto e non si applicano azioni successive prima di quelle in coda
- il cooldown è per `actorId`, non globale: azioni di personaggi diversi non si bloccano a vicenda. La mappa dei timestamp vive in memoria e si azzera al riavvio; `auto_approve` invece è persistito sulla campagna. L'auto-approvazione è comunque applicata solo dal server
- spegnere la matita blocca le nuove scritture ma non svuota la coda: le pending già ricevute restano approvabili o rifiutabili, altrimenti un cambio di idea del DM diventerebbe una perdita silenziosa di lavoro
- `editable` per campo resta la seconda porta: un campo non previsto è rifiutato anche con `editingEnabled=true`
- le policy vivono in `shared` e viaggiano in `PlayerSheetView.fieldPolicies`; il telefono mostra "in attesa", "approvato", "salvato" o "il master è stato avvisato"
- la coda pending è **in memoria del server**, non nel database: un riavvio la perde, e la UI lo dichiara. Le azioni già applicate sono invece persistite
- il DM vede tutte le pending della campagna; ogni giocatore vede solo le proprie, filtrate per `actorId` (e `clientId` per distinguere due tab dello stesso attore)
- un'azione pending si può **ritirare** dal telefono finché non è approvata; il DM può approvarla o rifiutarla singolarmente o in blocco, ma solo per uno stesso attore e rispettando l'ordine di invio
- approvazione e rifiuto sono espliciti: nessuna scadenza automatica. La UI mostra da quanto ogni richiesta è in attesa; il DM può rifiutare quelle obsolete
- se il bersaglio dell'azione non esiste più (token rimosso, attore cancellato) l'approvazione fallisce con `409 action_stale` e il giocatore riceve un messaggio chiaro
- l'HP resta un **delta**: il server lo applica allo stato corrente con `clamp(0, max)` e aggiorna attore e token nella stessa transazione (D24). Non c'è lost update perché c'è un solo writer

### 6.7 Persistenza e sincronizzazione

L'autosave full-document non è più il percorso normale: ogni azione è persistita quando viene applicata.

- il client DM applica l'azione in modo **ottimistico** per non aspettare il round-trip e riconcilia con la risposta `action.applied`, che porta l'azione canonica (dopo normalizzazione del server) e il nuovo `stateVersion`; il telefono non mostra una modifica `approval` come applicata finché il server non conferma auto-approvazione o approvazione DM
- il broadcast ordinario porta l'azione canonica, non l'intero `SceneState`: lo snapshot completo arriva a `hello`, dopo un buco di `seq`, in recovery o su refresh esplicito/periodico. Anche l'undo trasmette le inverse canoniche, non l'intero documento. Così un drag o un undo non costa 1 MB
- se il server rifiuta, il client fa **rollback** allo stato precedente e mostra il motivo; nessuna azione rifiutata resta visibile
- una sola azione in volo per client: la coda locale preserva l'ordine e evita che due azioni dello stesso DM si sovrappongano
- `POST/PATCH` di metadati (nome scena, immagine, attore) restano REST normali e non passano dalla action history
- `PUT /scenes/:id/state` resta solo per **recovery e import**: nessun client lo usa durante l'editing normale
- `GET /scenes/:id/snapshot` restituisce snapshot completo + `stateVersion`; la statusbar offre "Riallinea stato" e il client DM richiede il refresh automatico per scena ogni 100 azioni applicate o 5 minuti dall'ultimo snapshot completo, il primo dei due
- il refresh automatico invia `If-None-Match` basato su `stateVersion`/hash: se lo stato non è cambiato il server risponde `304`, evitando di trasferire e ricostruire il JSON. Il refresh manuale forza lo snapshot completo e riallinea il client alla verità del server
- il program continua a usare `PUT` con `program_version`; il viewport viaggia su WS con debounce e non incrementa la versione (6.4.3)
- stato nella statusbar: `synced`, `pending` (n azioni in volo), `offline`, `read-only`; non esistono più `saving` e `conflict`
- se il server non risponde (REST), l'editing si **blocca**: la console diventa read-only finché la connessione non torna. Se cade solo il WS ma il REST risponde, si può continuare con un banner "realtime assente" e polling di fallback
- cambiare scena non richiede un flush: non c'è uno stato locale da salvare, il server è già allineato. Le pending restano legate alla scena di origine
- il timer e `at` usano l'orologio del server: l'ordinamento della history non dipende dall'ora del dispositivo

### 6.8 Action history e undo

La action history è un pannello del dock (`Azioni`), con le pending in testa, il toggle "Auto-approva azioni" e le ultime 50 azioni di scena sotto.

- ogni azione applicata produce una riga con `label` leggibile ("Goblin: -7 HP", "Fog: rivela stanza"), origine (`dm` / `giocatore`), orario e stato
- le azioni `notify` e `private` non entrano nella history: non sono annullabili perché non hanno mai toccato il tavolo
- la history è **persistita** per campagna, ultime 50; un reload o un riavvio del server non la azzerano
- per ogni riga applicata non annullata c'è **"Annulla fino a qui"**: annulla l'azione selezionata e tutte quelle più recenti, in un'unica transazione. La conferma dice quante azioni stanno per essere annullate
- il server applica gli inversi in ordine inverso, incrementa `state_version` una sola volta, marca le righe `undone` e trasmette `action.undone` con gli id e le azioni inverse canoniche. I client le applicano localmente, senza ricevere l'intero snapshot
- ogni undo produce una **notifica leggera** ai client: toast non bloccante su console e telefono, nessun toast sullo schermo A (che si limita ad aggiornare lo stato per non disturbare la proiezione)
- il redo dell'ultimo batch di undo è disponibile finché non arriva una nuova azione; non è persistito e non compare nella history
- l'undo è solo del DM: un giocatore non può annullare né la propria azione approvata né quella di altri
- se l'azione da annullare appartiene a una scena diversa da quella aperta, il server la applica comunque e il client aggiorna la scena solo se è quella corrente; il pannello mostra il nome della scena per evitare ambiguità
- al superamento delle 50 righe le più vecchie vengono eliminate da `action_log` nella stessa transazione; non restano come audit e non sono annullabili
- **undo selettivo** di una singola azione in posizione X, lasciando in piedi le successive, non è previsto nell'MVP: richiederebbe replay e ricalcolo degli effetti. Il comportamento supportato resta "fino a qui"
- l'undo non cancella righe: le marca `undone`. La history resta leggibile e mostra cosa è stato annullato

### 6.9 Lifecycle e riconnessione

- **avvio**: snapshot di `SceneState` risolto, `hello` WS con `stateVersion`, pending dell'attore (o tutte per il DM) e ultime 50 azioni
- **reload della console**: lo stato arriva dal server, non da una bozza locale; la history è quella persistita. Le pending in memoria restano se il server non è stato riavviato
- **riavvio del server**: azioni applicate e history sopravvivono; le pending no. Al `hello` il client confronta gli id che aveva in coda e mostra "richiesta persa, riprova" per quelle sparite
- **cambio scena**: la console carica il nuovo stato, le pending della scena precedente restano visibili nel pannello con il nome della scena; non vengono applicate alla scena sbagliata
- **riconnessione WS**: `hello` con snapshot e `seq`; se `stateVersion` è cambiata il client sostituisce lo stato. Non c'è uno stato locale "sporco" da riconciliare, perché il server applica le azioni
- **server irraggiungibile**: editing bloccato, banner persistente, nessuna coda locale. Il DM non può lavorare su uno stato che il tavolo non vede
- **solo WS caduto**: REST ancora utilizzabile, banner "realtime assente", polling ogni 2 s; il DM può continuare ma lo schermo A può essere in ritardo
- **chiusura della console**: nessun `beforeunload` con salvataggio: le azioni sono già sul server. Un'azione in volo al momento della chiusura può andare persa, e la UI lo dice con l'indicatore `pending`
- **un solo program per campagna**: il program resta persistito e non viene toccato dal lifecycle delle azioni

### 6.10 Fuori scope

- CRDT, operational transform e merge automatico di documenti
- undo selettivo con replay delle azioni successive (non previsto; da rivalutare solo dopo l'MVP)
- editing offline con coda locale o IndexedDB
- pending persistite nel database: la coda è volatile per scelta
- consenso multi-DM o approvazione tra console DM: il DM è un unico ruolo
- replay di un'intera sessione o "time travel" oltre l'undo "fino a qui"

## 7. Modello dati

### 7.1 Tabelle

```text
campaigns   id, name, description, active_scene_id?, fog_default ('hidden'|'revealed'),
            auto_approve (0|1, default 1),
            advancement_mode ('milestone'|'xp', default 'milestone'),
            created_at, updated_at
scenes      id, campaign_id, name, image_asset_id?, width_px, height_px,
            state (JSON), state_version, created_at, updated_at
actors      id, campaign_id?, kind ('monster'|'npc'|'pc'), name,
            statblock (JSON), rules_version?, xp (default 0), sheet_version,
            player_notes?, dm_notes?, image_asset_id?,
            hp_current?, hp_max?, hp_temp?, created_at, updated_at
assets      id, hash (unique), mime, bytes, width, height,
            original_path, webp_path, thumb_path, created_at
displays    id, campaign_id, code (unique), pin_hash?, label,
            created_at, last_seen_at?, revoked_at?
programs    campaign_id (PK, FK campaigns), state (JSON), program_version, updated_at
sessions    id, campaign_id, number, started_at, ended_at?, duration_seconds?, notes
campaign_messages  id, campaign_id, role ('dm'|'assistant'|'system'), content, created_at
items       id, campaign_id?, source ('srd'|'custom'), srd_key?, name, type, rarity?,
            description?, value?, weight?, attunement?, data (JSON), image_asset_id?,
            created_at
inventories id, actor_id, item_id, quantity, state ('carried'|'equipped'|'attuned'|'lost')
player_links id, campaign_id, actor_id, token_hash (unique), editable (JSON),
             editing_enabled (0|1), label?, created_at, last_seen_at?, revoked_at?
dice_rolls  id, campaign_id, scene_id?, actor_id?, token_id?, origin ('dm'|'player'),
            formula, mode, result (JSON), visibility ('public'|'dm'),
            label?, created_at
action_log  id, campaign_id, scene_id?, actor_id?, client_id, origin ('dm'|'player'),
            type, label, payload (JSON), inverse (JSON), status ('applied'|'undone'),
            state_version, created_at, undone_at?
```

Note:
- `actors.campaign_id` nullable: `NULL` = libreria globale, valorizzato = attore della campagna
- `actors.player_notes` è visibile **solo** al giocatore del link: non compare in nessun DTO della console DM né in `PublicActorView`
- `actors.dm_notes` è visibile **solo** al DM: non viene mai serializzato in `PlayerSheetView` né in `PublicActorView`
- i due campi sono indipendenti: nessuna sincronizzazione, nessun merge, nessun `409` incrociato
- per i `pc` l'HP canonico sta sull'attore (`hp_current`, `hp_max`, `hp_temp`), perché il personaggio esiste anche fuori scena; il token lo rispecchia e il server aggiorna entrambi nella stessa transazione. Per mostri e NPC l'HP resta del token (D1)
- `dice_rolls` è un log append-only scritto dal server, mai dal client; la retention è FIFO a 200 righe per campagna
- `player_links` appartiene a un `actor` di tipo `pc`: un link su un mostro è rifiutato
- `assets` referenziabili senza duplicare file (dedup su `hash`)
- `displays` lega un codice a una campagna, non a una scena: il contenuto mostrato dipende dal program
- `sessions` alimenta le statistiche della card "dati base": durate derivate, mai inserite a mano
- `items.campaign_id` nullable: `NULL` = catalogo globale (SRD + custom), valorizzato = oggetto della campagna
- `inventories` collega oggetti e attori; i token dei mostri non hanno inventario
- un `pc` deve avere `campaign_id` valorizzato: non esistono `pc` nella libreria globale. `actors.kind` deve coincidere con `statblock.kind`, verificato dallo schema e dal server
- per i `pc` lo stato canonico è sull'attore: HP, condizioni, death saves, slot spesi, dadi vita usati e risorse. Il token in scena li rispecchia e il server aggiorna entrambi nella stessa transazione
- `actors.rules_version` fissa la versione SRD usata per la scheda; `statblock.snapshot` contiene la copia risolta di privilegi, incantesimi e oggetti scelti, quindi un aggiornamento dei cataloghi non cambia un personaggio esistente (D57)
- `actors.sheet_version` è la concorrenza ottimistica della scheda per le modifiche DM; le azioni player sono serializzate dal server. I delta HP restano l'eccezione che non richiede il version check (D24)
- `actors.xp` è sempre registrato, in entrambe le modalità di avanzamento; il livello è derivato da `statblock.class.level`, non duplicato in colonna
- `items.data` contiene i campi tipizzati per arma/armatura/attrezzo (danno, proprietà, CA, requisiti); `source='srd'` e `srd_key` identificano il catalogo, `custom` gli oggetti del DM
- gli oggetti SRD usati dal negozio sono seedati come righe globali (`campaign_id NULL`) con `source='srd'`, così l'inventario ha una FK reale; il catalogo di scelta arriva da `/srd/:version/items` e le due fonti sono allineate da `srd_key`
- aggiungere o rimuovere un oggetto aggiorna `statblock.snapshot.items` nella stessa transazione, così export e scheda restano autosufficienti anche se il catalogo cambia
- classi, sottoclassi, specie, background, talenti e incantesimi SRD **non** stanno nel database della campagna: sono cataloghi statici versionati serviti dal server, referenziati per id e congelati nello snapshot della scheda
- `programs` ha una riga per campagna: è ciò che è in onda, non la scena attiva (D15)
- `scenes.state` è il documento versionato (D2) tramite `state_version`, validato dallo stesso schema Zod usato dal client; contiene anche la fog (`fog.base` + `fog.ops`)
- `scenes.state` è scritto dall'`ActionService` (6.5–6.7); `PUT /scenes/:id/state` resta solo come recovery/import e non è usato dal client durante l'editing
- `action_log` conserva solo le ultime **50** azioni per campagna, applicate o annullate, con l'inverso calcolato dal server; quando ne arriva una 51ª elimina le più vecchie nella stessa transazione. Le azioni `pending` non sono qui: vivono in memoria (6.6)
- `action_log.status` marca `undone`, non cancella righe: la history resta leggibile dopo un undo
- `player_links.editing_enabled` è la matita sullo slot: se è `0`, ogni scrittura del telefono è `403`, anche sui campi in `editable`
- `campaigns.auto_approve` abilita l'approvazione automatica delle azioni `approval`, attiva di default; i timestamp del cooldown per attore restano in memoria (6.6)
- i dati non-tavolo del personaggio (monete, equipaggiamento, spell slot) vivono nel `statblock` e vengono aggiornati diretti con notifica al DM; non entrano in `action_log`
- le modifiche a inventario sono permissive e dirette: se un giocatore assegna per errore un oggetto, lo restituisce al DM; non entrano in `action_log` e il DM può spegnere la matita per bloccare ogni scrittura del link
- `grid` vive **solo** dentro `state`: nessuna colonna duplicata, nessun doppio source of truth
- eliminazione: `campaigns` → cascade su `scenes` e `actors`; gli `assets` vengono rimossi solo se orfani (job di pulizia)

### 7.2 Documento `SceneState`

```ts
interface SceneState {
  grid: GridConfig;
  fog: FogState;           // base + operazioni ordinate (9.1)
  tokens: TokenState[];
  loot: LootEntry[];       // oggetti sulla mappa, distinti dai token
  drawings: Drawing[];
  initiative: {
    active: boolean;
    round: number;
    turnIndex: number;
    entries: InitiativeEntry[];
  };
}

interface GridConfig {
  type: 'square' | 'hex';
  cellSizePx: number;
  offsetX: number;
  offsetY: number;
  feetPerCell: number;
  diagonalRule: '5-5-5' | '5-10-5';  // solo square
  hexOffset: 'odd-r';                // solo hex pointy-top
}

interface TokenState {
  id: string;
  actorId?: string;        // collegamento al template
  label: string;
  x: number; y: number;    // coordinate in celle (non px)
  size: number;            // in celle: 1 = medio, 2 = grande, 3 = enorme
  rotation: number;
  elevation: number;       // in feet
  hp: { current: number; max: number; temp: number };
  ac?: number;
  conditions: Condition[];
  deathSaves?: { successes: number; failures: number };
  visible: boolean;
  owner?: 'dm' | 'players';
}

interface LootEntry {
  id: string;
  itemId: string;
  x: number; y: number;    // coordinate in celle
  quantity: number;
  visible: boolean;       // true di default; la fog continua a filtrare il display
}

// Patch parziali usate dalle azioni (6.5): mai un documento intero
type TokenPatch = Partial<Omit<TokenState, 'id'>>;

interface Condition {
  name: ConditionName;      // catalogo chiuso in shared
  level?: number;           // solo sfinimento, 1-6
  rounds?: number | null;   // null = fino alla fine dell'incontro
  concentration?: boolean;
}

interface InitiativeEntry {
  id: string;
  tokenId: string;
  label: string;
  value: number;
  tiebreak: number;        // modificatore destrezza
  hidden: boolean;         // nascosto ai giocatori
  defeated: boolean;
}

interface DiceRoll {
  id: string;
  formula: string;         // "2d6+3", "4d6kh3", "1d20+5"
  mode: 'normal' | 'advantage' | 'disadvantage';
  dice: { sides: number; value: number; dropped: boolean }[];
  modifier: number;
  total: number;
  visibility: 'public' | 'dm';
  origin: 'dm' | 'player'; // chi ha chiesto il tiro; il server è l'unico esecutore (D25)
  actorId?: string;        // per origin 'player': il personaggio del link
  tokenId?: string;
  label?: string;
  createdAt: string;       // ISO 8601
}

// Ciò che è in onda: stato separato dalla scena (D15, D18)
interface ProgramState {
  base: ProgramLayer;
  overlays: ProgramLayer[];             // ordine bottom-to-top
  hud: {
    dice: boolean;          // mostra i tiri 'public' in sovrimpressione
    initiative: boolean;    // ticker dell'iniziativa
    pointer: boolean;       // puntatore laser del DM
  };
  blackout: boolean;
  background: string;       // colore del letterbox, es. "#000000"
  updatedAt: string;
}

interface ProgramComposition {
  base: ProgramLayer;
  overlays: ProgramLayer[];
}

interface ProgramLayer {
  id: string;
  content: ProgramContent;
  frame: LayerFrame;                    // coordinate/dimensioni normalizzate 0..1
  opacity: number;                      // 0..1
  interactive: boolean;                // false = click-through; default sugli overlay
  confirmBeforeTake?: boolean;         // se true, pubblicare la composizione richiede conferma
}

interface LayerFrame {
  x: number; y: number;                // origine in frazione del canvas
  width: number; height: number;       // dimensioni in frazione del canvas
}

type ProgramContent =
  { type: 'blank' }
  | { type: 'map'; sceneId: string; viewport: Viewport; fog: boolean; cameraLocked: boolean }
  | { type: 'actor'; actorId: string }
  | { type: 'image'; assetId: string; fit: 'contain' | 'cover' }
  | { type: 'text'; title: string; body: string }
  | { type: 'item'; itemId: string }
  | { type: 'initiative' };

interface Viewport {
  x: number; y: number;     // centro in px immagine
  zoom: number;             // 1 = 100%
}

// Proiezione inviata allo schermo A: già filtrata e risolta dal server (D16)
interface DisplayState {
  campaign: { id: string; name: string };
  program: DisplayProgramMeta;
  composition: DisplayComposition;      // proiezione già filtrata e ordinata
  initiative?: {
    active: boolean; round: number; turnIndex: number;
    entries: PublicInitiativeEntry[];
  };
  rolls: DiceRoll[];        // solo visibility: 'public'
}

interface DisplayProgramMeta {
  hud: ProgramState['hud'];
  blackout: boolean;
  background: string;
  updatedAt: string;
}

type DisplayLayer = (
  { type: 'blank' }
  | { type: 'map'; scene: DisplayScene; viewport: Viewport; fog: boolean }
  | { type: 'actor'; actor: PublicActorView }
  | { type: 'image'; imageUrl: string; fit: 'contain' | 'cover' }
  | { type: 'text'; title: string; body: string }
  | { type: 'item'; item: PublicItemView }
  | { type: 'initiative' }
) & { id: string; frame: LayerFrame; opacity: number };

interface DisplayComposition {
  base: DisplayLayer;
  overlays: DisplayLayer[];
}

interface DisplayScene {
  id: string; name: string;
  widthPx: number; heightPx: number;
  imageUrl: string;
  grid: GridConfig;
  tokens: PublicToken[];    // solo visible: true e centro scoperto (9.4)
  loot: PublicLoot[];       // solo loot visibile e centro scoperto
  fog: FogState;            // base + ops, disegnata al 100%
}

// Delta già filtrato dal server, mai derivato applicando il GameAction grezzo sul display
type DisplayDelta =
  | { type: 'snapshot.replace'; state: DisplayState }
  | { type: 'composition.replace'; composition: DisplayComposition }
  | { type: 'program.meta.update'; program: DisplayProgramMeta }
  | { type: 'token.upsert'; layerId: string; token: PublicToken }
  | { type: 'token.remove'; layerId: string; tokenId: string }
  | { type: 'loot.upsert'; layerId: string; loot: PublicLoot }
  | { type: 'loot.remove'; layerId: string; lootId: string }
  | { type: 'fog.apply'; layerId: string; op: FogOp }
  | { type: 'fog.replace'; layerId: string; fog: FogState }
  | { type: 'grid.update'; layerId: string; grid: GridConfig }
  | { type: 'initiative.update'; initiative: DisplayState['initiative'] }
  | { type: 'roll.add'; roll: DiceRoll };

interface PublicToken {
  id: string;
  label: string;
  x: number; y: number;
  size: number;
  rotation: number;
  elevation: number;
  imageUrl?: string;
  hp?: { current: number; max: number }; // solo se il DM abilita la barra HP
  conditions: string[];                  // solo i nomi visibili
}

interface PublicLoot {
  id: string;
  item: PublicItemView;
  x: number; y: number;
  quantity: number;
}

interface PublicActorView {
  id: string;
  name: string;
  kind: 'monster' | 'npc' | 'pc';
  imageUrl?: string;
  statblock: ActorStatblock;             // senza note: né del DM né del giocatore
}

interface PublicItemView {
  id: string;
  name: string;
  type: string;                          // arma, artefatto, accessorio, consumabile
  rarity?: string;
  description?: string;
  imageUrl?: string;
}

type PublicInitiativeEntry = Omit<InitiativeEntry, 'hidden'>;

type PlayerEditableField =
  | 'hp' | 'tempHp' | 'conditions' | 'deathSaves' | 'hitDice' | 'playerNotes'
  | 'inventory' | 'spells' | 'resources' | 'currency' | 'equipment';

// Come si comporta un campo quando il giocatore lo modifica (6.6)
type FieldPolicy =
  | 'approval'   // auto-approvata secondo campagna/cooldown, o pending per il DM; entra nella history se applicata
  | 'notify'     // applicato subito, notifica leggera al DM, fuori history
  | 'private'    // applicato subito, nessuna notifica, fuori history
  | 'readonly';  // non modificabile dal telefono

interface Currency { cp: number; sp: number; ep: number; gp: number; pp: number }

// Vista inviata al telefono del giocatore, filtrata per token (D21, D22, D35)
interface PlayerSheetView {
  campaign: { id: string; name: string };
  actor: {
    id: string;
    name: string;
    kind: 'pc';
    imageUrl?: string;
    level: number;
    className: string;
    subclassName?: string;
    speciesName: string;
    backgroundName: string;
    xp: number;
    statblock: PcStatblock;              // snapshot congelato, sola lettura
    derived: DerivedSheet;
    hp: { current: number; max: number; temp: number };
    ac: number;
    conditions: Condition[];
    deathSaves: { successes: number; failures: number };
    hitDice: { die: number; total: number; used: number };
    resources: ResourcePool[];
    playerNotes?: string;               // dmNotes non compare mai qui (D26)
    inventory: InventoryView[];
    currency: Currency;
  };
  advancementMode: 'milestone' | 'xp';
  xpNext?: number;                       // soglia del prossimo livello; assente a 20
  editingEnabled: boolean;               // la matita sullo slot (6.6)
  editable: PlayerEditableField[];
  fieldPolicies: Partial<Record<PlayerEditableField, FieldPolicy>>;
  pending: PendingActionView[];          // solo le azioni di questo attore/client
  recentRolls: DiceRoll[];               // ultimi 10 tiri del personaggio
  version: number;                       // versione della proiezione della scheda
}

interface PendingActionView {
  id: string;
  label: string;                         // "HP -7", "Condizione: prone"
  field: PlayerEditableField;
  requestedAt: string;
  status: 'pending' | 'applied' | 'rejected';
}

interface InventoryView {
  id: string;
  item: PublicItemView;
  quantity: number;
  state: 'carried' | 'equipped' | 'attuned' | 'lost';
}

// Console DM: stessa proiezione pubblica + la nota privata del master.
// playerNotes non è nel tipo, quindi non può essere serializzato per errore.
interface DmActorView extends PublicActorView {
  dmNotes?: string;
}

// Proiezione completa della scheda per la console: derivati, snapshot, stato di avanzamento (solo pc)
interface DmSheetView {
  actor: DmActorView;                    // actor.statblock è l'unione discriminata completa
  derived: DerivedSheet;
  inventory: InventoryView[];
  currency: Currency;
  level: number;
  className: string;
  subclassName?: string;
  speciesName: string;
  backgroundName: string;
  xp: number;
  xpNext?: number;
  advancementMode: 'milestone' | 'xp';
  levelUpAvailable: boolean;
  sheetVersion: number;
  rulesVersion: string;
}
```

Tre proiezioni dello stesso attore, tre DTO distinti: `PublicActorView` (display, nessuna nota), `DmActorView` (console, solo `dmNotes`), `PlayerSheetView` (telefono, solo `playerNotes`). `DmSheetView` è la proiezione completa della scheda per il DM. Nessun DTO è costruito con lo spread dell'entità `actors`.

`state_version` vive nella colonna, non nel JSON: il body di `PUT /scenes/:id/state` è `{ stateVersion, state }` e il server confronta con la riga. Il percorso normale non è più quel `PUT`: lo stato avanza per azioni (6.5) e quell'endpoint resta per recovery e import. Lo stato effimero (misura in corso, strumento attivo, selezione) resta in `UiStore` e non viene mai persistito.

### 7.3 Scheda attore e statblock

`Actor.statblock` non è un oggetto piatto: è un'**unione discriminata** che condivide il nucleo fisico e aggiunge i campi propri del tipo (D56). Il `kind` dentro il JSON deve coincidere con `actors.kind`; il server lo verifica prima di ogni scrittura.

```ts
type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type Skill =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics' | 'deception'
  | 'history' | 'insight' | 'intimidation' | 'investigation' | 'medicine'
  | 'nature' | 'perception' | 'performance' | 'persuasion' | 'religion'
  | 'sleightOfHand' | 'stealth' | 'survival';
type Size = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

interface StatblockCore {
  kind: 'pc' | 'monster' | 'npc';
  size: Size;
  abilities: Record<Ability, number>;      // valori finali, buff inclusi
  hp: { current: number; max: number; temp: number };
  speed: { walk: number; fly?: number; swim?: number; climb?: number; burrow?: number; hover?: boolean };
  senses: { darkvision?: number; blindsight?: number; tremorsense?: number; truesight?: number };
  languages: string[];
  conditions: Condition[];
}

interface PcStatblock extends StatblockCore {
  kind: 'pc';
  rulesVersion: string;                    // es. "srd-5.2.0", mai aggiornata in automatico
  class: { id: string; subclassId?: string; level: number }; // una sola classe, 1..20
  species: { id: string; choices?: Record<string, string> };
  background: { id: string };
  alignment?: string;
  abilityGeneration: {
    method: 'pointBuy' | 'standardArray' | 'rolled' | 'manual';
    base: Record<Ability, number>;         // prima dei bonus
    rolls?: number[];                      // sei risultati 4d6kh3, se method = 'rolled'
  };
  abilityIncreases: { source: 'background' | 'asi' | 'feat'; ability: Ability; amount: number }[];
  proficiencies: {
    saves: Ability[]; skills: Skill[]; expertise: Skill[];
    tools: string[]; armor: string[]; weapons: string[];
  };
  feats: { id: string; choices?: Record<string, string> }[];
  weaponMasteries: string[];
  resources: ResourcePool[];
  spells: {
    ability?: Ability;
    cantrips: SpellChoice[];
    known: SpellChoice[];
    prepared: SpellChoice[];
    alwaysPrepared: SpellChoice[];
    spellbook: SpellChoice[];               // solo wizard
    slots: SpellSlotPool[];                 // livelli 1..9
    pactSlots?: { level: number; max: number; used: number }; // warlock, ricarica breve
  };
  hitDice: { die: number; total: number; used: number };
  hpRolls: number[];                        // incrementi di HP dal livello 2 in poi
  deathSaves: { successes: number; failures: number };
  currency: Currency;                       // cp, sp, ep, gp, pp
  overrides: SheetOverrides;                // eccezioni homebrew ai valori derivati
  snapshot: SheetSnapshot;                  // copia risolta, indipendente dai cataloghi futuri
}

interface MonsterStatblock extends StatblockCore {
  kind: 'monster';
  rulesVersion?: string;
  creatureType: string;
  cr: string;
  tags: string[];
  ac: number;
  savingThrows?: Partial<Record<Ability, number>>;
  skills?: Partial<Record<Skill, number>>;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  traits: FeatureBlock[];
  actions: FeatureBlock[];
  reactions: FeatureBlock[];
  legendary?: { max: number; actions: FeatureBlock[] };
  spellcasting?: { ability: Ability; dc: number; attackBonus: number; spells: SpellChoice[] };
  snapshot?: SheetSnapshot;
}

type NpcStatblock = Omit<MonsterStatblock, 'kind' | 'cr'> & {
  kind: 'npc';
  role?: string;                            // alleato, antagonista, informatore…
};

type ActorStatblock = PcStatblock | MonsterStatblock | NpcStatblock;
```

Tipi di supporto:

```ts
interface ResourcePool {
  id: string;                               // id del privilegio/oggetto che lo concede
  name: string;
  max: number;
  used: number;
  recharge: 'short' | 'long' | 'none';
}

interface SpellChoice {
  id: string;
  source: 'class' | 'subclass' | 'species' | 'feat' | 'item';
  prepared?: boolean;
  alwaysPrepared?: boolean;
}

interface SpellSlotPool { level: number; max: number; used: number; }

interface FeatureBlock {
  name: string;
  description: string;
  attack?: { toHit: number; reach?: number; range?: string; damage: string };
  recharge?: 'short' | 'long' | 'none';
}

interface SheetSnapshot {
  features: ResolvedFeature[];              // privilegi di classe, sottoclasse, specie, background, talenti
  spells: ResolvedSpell[];                  // solo quelli scelti
  items: ResolvedItem[];                    // oggetti posseduti, dati SRD congelati
}

interface ResolvedFeature {
  id: string; name: string; level: number;
  source: 'class' | 'subclass' | 'species' | 'background' | 'feat' | 'item';
  description: string;
  recharge?: 'short' | 'long' | 'none';
}

interface ResolvedSpell {
  id: string; name: string; level: number; school: string;
  castingTime: string; range: string; components: string; duration: string;
  concentration: boolean; ritual: boolean; description: string;
}

interface ResolvedItem {
  id: string; name: string; type: string;
  data: ItemData; value?: number; weight?: number;
}

type ItemData =
  | { category: 'weapon'; damage: { dice: string; type: string }; properties: string[]; mastery?: string; range?: { normal: number; long?: number } }
  | { category: 'armor'; baseAc: number; dexCap?: number; strength?: number; stealthDisadvantage?: boolean; shieldBonus?: number }
  | { category: 'tool' | 'pack' | 'gear' | 'ammunition' | 'mount' | 'vehicle' };

interface SheetOverrides {
  ac?: number;
  initiative?: number;
  passivePerception?: number;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  saves?: Partial<Record<Ability, number>>;
  skills?: Partial<Record<Skill, number>>;
  speed?: Partial<StatblockCore['speed']>;
}
```

Valori derivati, calcolati in `shared/sheet/derive.ts` (D58):

```ts
interface DerivedSheet {
  proficiencyBonus: number;
  initiative: number;
  saves: Record<Ability, number>;
  skills: Record<Skill, number>;
  passivePerception: number;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  ac: number;
  attacks: AttackProfile[];
  carryCapacity: number;
  speed: StatblockCore['speed'];
}

interface AttackProfile {
  itemId: string; name: string; ability: Ability;
  toHit: number; damage: string; properties: string[];
}
```

- **input salvati**: caratteristiche base, aumenti, competenze, talenti, equipaggiamento, slot, risorse, tiri di HP. **derivati**: modificatori, bonus di competenza, TS, abilità, iniziativa, passiva, CA, CD/attacco incantesimi, attacchi, capacità di carico
- `abilities` contiene il **valore finale**; `abilityGeneration.base` e `abilityIncreases` servono al wizard e all'audit e non vengono sommati una seconda volta dai derivati
- `overrides` è l'unica eccezione: un valore esplicito vince sul calcolo e la UI lo mostra con un badge "personalizzato"
- `hp.max` resta **canonico** e viene ricalcolato dal wizard di level-up (dipende da tiri, CON e talenti); `hpRolls` conserva la storia dei tiri, così il totale è verificabile. Non è un derivato silenzioso: un cambio manuale di CON mostra l'anteprima del nuovo massimo, e un aumento di COS si applica retroattivamente a tutti i livelli
- `rulesVersion` e `snapshot` sono immutabili durante la vita del personaggio; un errata o un nuovo SRD non riscrive la scheda. Un eventuale "aggiorna regole" sarà un'azione esplicita e fuori dall'MVP
- `deriveSheet()` è puro e testato: stessi input → stessi valori su console, telefono, export e chat IA
- il server non si fida del client: `validatePcBuild()` in `shared` controlla point buy/array/tiri, numero di competenze, sottoclasse al livello corretto, slot ASI/talenti, numero di incantesimi e budget; il server riesegue la validazione nella stessa transazione che crea o sale di livello

### 7.4 Regole di calcolo

- **Quadrata**: distanza in celle = Chebyshev; costo diagonale secondo `diagonalRule`
- **Esagoni pointy-top `odd-r`**: offset → cubiche (`q = col - (row - (row & 1)) / 2`, `r = row`), distanza = `( |dq| + |dr| + |ds| ) / 2`
- **Snap**: centro del token alla cella più vicina; i token grandi occupano `size × size` celle
- **Iniziativa**: ordine per `value` desc, pareggio su `tiebreak` desc, poi ordine di inserimento; round e turno gestiti da `turnIndex`
- **Condizioni**: catalogo chiuso in `shared` (nome, descrizione, richiede livello, concentrazione) + durata in round
- **HP**: `current`, `max`, `temp`; i danni consumano prima i `temp`
- **Monete**: contabilità in rame interi (D63); `currencyFromCopper` produce monete canoniche e `formatGp` mostra al massimo due decimali, quindi una flask da 0,02 mo lascia 4,98 e non 4.980000000000004

## 8. Console del DM

### 8.1 Avvio

- la prima pagina è **sempre** la console: `/` → `/dm`, nessuna schermata intermedia di scelta
- la shell si disegna subito con **skeleton** (barra titolo, sidebar, vista main, slot, statusbar)
- **nessuna campagna**: sopra lo skeleton compare la modale non dismissibile "Crea campagna" (nome, ambientazione, sistema, data inizio, modalità avanzamento `milestone` di default); alla creazione si entra nella console già idratata
- **campagne esistenti ma nessuna selezionata**: modale di scelta sopra lo skeleton, con card (nome, copertina, ultima sessione, numero di `pc`) e "Nuova campagna"
- se esiste una `lastCampaignId` valida in `localStorage`, si apre direttamente quella: la modale compare solo se manca o non è più valida
- "Cambia campagna" nella barra del titolo riapre la modale di scelta
- nella barra del titolo c'è il selettore tema **Chiaro / Scuro / Sistema**; la scelta è locale al dispositivo e si applica subito a console, display e scheda giocatore, senza toccare la campagna
- deep link `/dm/campaigns/:id` sempre valido; id inesistente → modale di scelta con messaggio, mai pagina bianca
- durante il caricamento i pannelli mostrano skeleton locali, non uno spinner a tutto schermo

### 8.2 Struttura

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ [Campagna ▾]  Titolo · Sessione 7 · ● ON AIR   [Apri schermo] [⚙]       │
├──────────────┬────┬───────────────────────────────────┬─────────────────┤
│ SX campagna  │ T  │                                   │ DX mostri       │
│              │ o  │                                   │ ┌ In mappa ───┐ │
│ ambientazione│ o  │        VISTA MAIN (PGM)           │ │ minicard    │ │
│              │ l  │     mappa + fog al 50%            │ └─────────────┘ │
│ chat IA      │ b  │                                   │ ┌ Prossimi ───┐ │
│              │ a  │                                   │ │ minicard    │ │
│ ┌ dati ────┐ │ r  │                                   │ └─────────────┘ │
│ │ sessione │ │    │                                   │ [Cerca nel DB]  │
│ └──────────┘ │    │                                   │                 │
├──────────────┴────┴───────────────────────────────────┴─────────────────┤
│ DOCK: [Iniziativa] [Bottino] [Log dadi] [Azioni ②]           (collassabile)│
├─────────────────────────────────────────────────────────────────────────┤
│ SLOT: [PG1][PG2][PG3] ··· [PG10][+]                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ STATUSBAR: messaggi · ● Smart TV connessa · synced · 00:42:13             │
└─────────────────────────────────────────────────────────────────────────┘
```

- I pannelli laterali e il dock sono **collassabili** con stato ricordato per campagna; la vista main si allarga di conseguenza
- `FOCUS` (scorciatoia) nasconde entrambe le sidebar e lascia solo mappa + toolbar
- la vista main è il **PGM**: mostra esattamente ciò che è in onda, con la fog al 50% per il DM e al 100% per i giocatori
- il PVW non è un secondo monitor fisso: è un riquadro richiamabile quando si prepara un cambio di contenuto (mappa → scheda → immagine)

### 8.3 Barra del titolo

- nome campagna, numero sessione, indicatore `ON AIR` (pallino rosso quando un display è connesso)
- pulsante "Apri schermo" (D20), selettore campagna, impostazioni
- timer di sessione sempre visibile, con play/pausa

### 8.4 Vista main e toolbar

Toolbar verticale a sinistra della vista, con icone + tooltip e scorciatoie:

| Azione | Comportamento |
|---|---|
| Seleziona / pan | click seleziona, spazio+drag pan |
| Fog — rivela | pennello circolare, dimensione regolabile, undo/redo |
| Fog — nascondi | come sopra, senso inverso |
| Fog — rettangolo | drag angolo-ad-angolo, anteprima |
| Fog — lasso | click per i vertici, doppio click chiude |
| Rivela tutto / Nascondi tutto | azione globale, con conferma |
| Misura | distanza in piedi secondo `GridConfig` |
| Disegno | annotazioni effimere o persistenti |
| Ping | puntatore laser proiettato sullo schermo A |
| Camera Live / Libera | in Live il pan muove lo schermo A; in Libera il DM esplora senza spostare la proiezione, con pulsante "Riallinea" |
| Griglia on/off | solo vista DM |
| Layer scena | mappa, griglia, fog, token, bottino, disegni |

- la fog sul PGM è semitrasparente (50%) e con un pattern leggero: il DM vede la stanza, i giocatori no
- `Camera Live` è il default: rispetta il requisito "interagire come se fosse nello schermo A"
- `Camera Libera` evita di trascinare i giocatori mentre il DM controlla un'altra zona della mappa

### 8.5 Slot personaggi (in basso)

- 10 slot fissi **riservati ai personaggi giocatori**; vuoto = tile con `+` centrale che apre la creazione del personaggio. Mostri e NPC non stanno negli slot: quelli non ancora in mappa vivono nell'accordion `Attori` della sidebar sinistra e, una volta schierati, compaiono in `In mappa` a destra
- tile piena: ritratto, nome, **classe e livello**, barra HP, CA, condizioni, badge `nascosto`
- nell'angolo della tile c'è la **matita** del link giocatore (`editingEnabled`, 8.14), presente solo se il link esiste: accesa = il telefono può scrivere, spenta = sola lettura. Un click la inverte, senza dialog
- un pallino sul bordo della tile indica le azioni in attesa di approvazione per quel personaggio; il click apre il dock `Azioni` filtrato sull'attore
- drag slot → mappa: crea il token del personaggio; se è già sulla mappa, **centra** il token esistente invece di duplicarlo
- click: seleziona il personaggio e apre la scheda; tasto destro: rimuovi dallo slot (non dal database), "Condividi scheda" (8.14)
- i 10 slot sono la rosa della campagna, non i token: restano anche quando il personaggio non è in scena

### 8.6 Sidebar sinistra — campagna

- **Ambientazione**: descrizione in markdown, modificabile inline, collassabile
- **Chat IA**: contesto composto da ambientazione, scena corrente, token selezionati e relativi statblock; né `dmNotes` né `playerNotes` entrano nel prompt. Cronologia persistita per campagna, provider solo server-side
- **Dettagli campagna**: dialog con data inizio, numero sessione, durata sessione corrente, durata media, totale giocato, sistema, numero di `pc`, modalità di avanzamento e pulsante per cambiarla; gli XP restano registrati in entrambe le modalità
- **Card dati base**: sessione corrente, durata, media, totale; il timer si avvia/ferma dalla card
- ogni sessione chiusa produce una riga in `sessions`: le statistiche sono derivate, non digitate a mano; la durata media usa tutte le sessioni concluse con `duration_seconds`, escludendo quelle ancora aperte

### 8.7 Sidebar destra — mostri

Due liste impilate più il pescaggio dal database:

- **In mappa**: minicard dei token presenti (ritratto, nome, CR, HP, CA, condizioni, occhio visibilità). Azioni rapide: danneggia/cura, aggiungi condizione, mostra/nascondi, centra, rimuovi
- **Prossimi**: coda di staging. Non sono ancora sulla mappa e non esistono per i giocatori
- **Cerca nel DB**: filtro per nome, tipo, CR, fonte. Drag sul DB → mappa (nuovo token) o → prossimi (accoda)
- "Aggiungi tutti alla mappa" e "Svuota coda" come azioni di testa lista
- opzionale: budget di incontro della coda (difficoltà 5e) come indicatore non bloccante

### 8.8 Dock — iniziativa, bottino, dadi, azioni

L'iniziativa non era prevista nel layout descritto ed è troppo importante per stare in una sidebar: il dock risolve tre esigenze con un solo spazio collassabile.

- **Iniziativa**: ordine, round, turno corrente, HP e condizioni, `next turn`, pareggi, hidden
- **Bottino**: catalogo oggetti (armi, artefatti, accessori, consumabili) con ricerca; drag su uno slot personaggio assegna all'inventario; drag sulla mappa crea un bottino di scena; "Mostra ai giocatori" manda in onda la card dell'oggetto (`ProgramContent.type = 'item'`)
- **Log dadi**: ultimi 200 tiri dal server con badge `dm` / `giocatore`, filtro pubblico/DM, ripeti; menu "Silenzia tiri giocatori" con 30 s, 1 min, 5 min, 10 min, 30 min o 1 h e countdown visibile al DM
- **Azioni**: toggle campagna **"Auto-approva azioni"** (attivo di default); in testa le pending dei giocatori (badge con il conteggio e anzianità sul tab), sotto le ultime 50 azioni applicate con origine, orario e stato. Ogni riga ha **"Annulla fino a qui"**; pending approvabili/rifiutabili singolarmente o in blocco solo per lo stesso personaggio e in ordine. L'undo è solo del DM e non cancella righe: le marca `undone` (6.8)
- una notifica leggera arriva su console e telefono a ogni undo; lo schermo A ridisegna senza toast

### 8.9 Regole di drag & drop

| Da | A | Effetto |
|---|---|---|
| Slot personaggio | mappa | crea token, o centra quello esistente |
| Mostro nel DB | mappa | nuovo token istanza, HP propri |
| Mostro nel DB | prossimi | accoda, nessun token |
| Prossimi | mappa | nuovo token ed esce dalla coda |
| In mappa | mappa | riposiziona il token esistente |
| Oggetto | slot personaggio | assegna all'inventario |
| Oggetto | mappa | bottino di scena |
| Oggetto | pulsante "in onda" | card oggetto sullo schermo A |

Trascinare lo stesso mostro due volte crea due istanze: è voluto. Per i `pc` vale la regola di unicità per `actorId`.

### 8.10 Fog di partenza

- la copertura iniziale arriva da `campaigns.fog_default` (`hidden` di default), sovrascrivibile per singola scena
- una mappa nuova parte **sempre** in uno stato coerente: tutta nascosta o tutta rivelata, mai "fog assente"
- "Rivela tutto" e "Nascondi tutto" sono espliciti e confermati; il reset non è un'azione implicita
- dettagli di modello, rendering e filtri in 9.1–9.7

### 8.11 Statusbar

- messaggi transitori e ultimo evento (token aggiunto, danno, tiro, azione annullata)
- utenze collegate: display/TV con nome, ruolo e latenza; pallino verde/giallo/rosso
- stato di sincronizzazione (`synced` / `pending n` / `offline` / `read-only`), stato WS, timer di sessione, budget della fog (`op` correnti)
- pulsante **"Riallinea stato"** per richiedere subito lo snapshot completo; indicatore dell'ultimo refresh automatico
- `read-only` è esplicito: è lo stato in cui l'editing è bloccato perché il server non risponde (6.7)

### 8.12 Dati aggiuntivi necessari

Le tabelle `sessions`, `campaign_messages`, `items` e `inventories` sono definite in 7.1. Qui solo le regole d'uso:

- la fog vive in `SceneState.fog` (9.1); `campaigns.fog_default` è solo il valore di creazione, non una seconda fonte di verità
- il bottino di scena vive in `SceneState.loot[]`, separato dai token; ogni entry punta a un `item`, ha coordinate/quantità e può essere raccolta assegnandola all'inventario
- `ProgramContent` include `{ type: 'item'; itemId }` per mostrare la card dell'oggetto in onda

### 8.13 Scheda personaggio in console

- si apre da uno slot, dalla iniziativa o dal dettaglio attore come **dialog full-screen** con tab; Esc chiude, il focus torna all'elemento di partenza e la mappa resta dietro, non interagibile
- header sticky: ritratto, nome, classe e livello, specie, background, HP/CA, condizioni attive, barra XP e pulsante **"Sali di livello"** (8.16). A livello 20 il pulsante è disabilitato
- la scheda è la stessa proiezione per DM e telefono, ma la console vede tutti i campi del DM e può modificarli; il telefono resta limitato da `editable` e dalla matita (8.14)
- tab:
  - **Combattimento**: HP correnti/temp con danno e cura a delta, CA, iniziativa, velocità, death saves (visibili a 0 HP), dadi vita, condizioni, attacchi derivati dall'equipaggiamento, risorse con ricarica breve/lunga. Pulsanti **Riposo breve** e **Riposo lungo** (solo DM, 8.17)
  - **Abilità**: sei caratteristiche con modificatori, tiri salvezza, 18 abilità con competenza/expertise, percezione passiva, sensi, lingue e competenze di armi/armature/attrezzi
  - **Incantesimi**: CD e attacco, slot per livello con `usati/max`, cantrip, incantesimi conosciuti/preparati/sempre preparati, libro per il wizard; filtro per livello/scuola e badge concentrazione. Marcare uno slot speso è immediato; la scheda non lancia l'incantesimo
  - **Equipaggiamento**: armi/armature/scudo indossati, inventario con quantità e stato (`carried`/`equipped`/`attuned`/`lost`), sintonizzazioni (max 3), monete, capacità di carico. Aggiunta e rimozione sono del DM; il giocatore le gestisce dal telefono secondo policy
  - **Privilegi**: privilegi di classe, sottoclasse, specie, background e talenti dallo snapshot, maestrie delle armi e risorse con il tipo di ricarica. I testi sono quelli congelati alla creazione, non l'ultima versione SRD
  - **Note**: `dmNotes` modificabile dal DM; `playerNotes` **non è visibile**: la UI mostra solo un badge "note del giocatore presenti". Allineamento, aspetto e storia sono campi liberi
- ogni modifica del DM invia `PATCH` con `sheetVersion`; su `409` la scheda ricarica la proiezione e mostra "modificato altrove", senza sovrascrivere. I delta HP restano la sola eccezione e non richiedono il version check
- i valori derivati hanno un badge quando sono **personalizzati** (`overrides`); "Ripristina calcolo" rimuove l'override. Non si modificano i derivati senza passare dall'override esplicito
- il footer mostra `rulesVersion`, `sheetVersion` e lo stato di salvataggio; nessun autosave full-document, ogni campo è un comando
- "Condividi scheda" e "Rimuovi dallo slot" restano nel menu dell'header; eliminare l'attore è un'azione separata e confermata
- su schermi sotto i 1280 px le tab diventano una lista orizzontale scrollabile; i contenuti lunghi hanno scroll interno, non muovono la mappa

### 8.14 Schede giocatore su telefono

- dal menu di uno slot personaggio (o dal dettaglio attore) → **"Condividi scheda"**: genera un link giocatore e mostra QR + URL
- il giocatore inquadra il QR con il telefono e apre `/play/:token`: pagina mobile-first, **senza Konva**, con la sola scheda
- layout: header sticky con ritratto, nome, classe/livello, specie, background, HP/CA, condizioni e barra XP; tab **Combattimento**, **Abilità**, **Magia**, **Oggetti**, **Note**, **Tiri**. Le tab sono a scorrimento orizzontale sui telefoni stretti
- contenuto: caratteristiche, tiri salvezza, abilità, HP/CA, death saves, dadi vita, condizioni, risorse con ricarica, incantesimi con slot e descrizioni, privilegi, inventario, monete, **note del giocatore**, storico dei propri tiri
- **due campi note privati per ruolo** (D26): `player_notes` è del giocatore, `dm_notes` è del master; il DM **non** vede le note del giocatore e viceversa, e il giocatore non può condividerle tramite l'app
- l'unica cosa condivisa è l'esistenza del campo: il DM decide se `playerNotes` è editabile dal link, ma non ne legge il contenuto
- **cosa è modificabile lo decide il DM per link**: `hp`, `tempHp`, `conditions`, `deathSaves`, `hitDice`, `playerNotes`, `inventory`, `spells`, `resources`, `currency`, `equipment`; default: tutti questi campi abilitati, con la matita accesa
- **la matita sullo slot è l'interruttore generale**: spenta, il telefono è in sola lettura e ogni scrittura dà `403 editing_disabled`, note comprese. La lettura resta disponibile, così il giocatore consulta la scheda anche quando il DM sta gestendo il turno
- **policy per campo** (6.6): HP, condizioni e death saves passano da auto-approvazione (attiva di default, max un'azione ogni 10 s per attore) o pending DM; monete, equipaggiamento, inventario, dadi vita, risorse e spell slot si applicano subito con una **notifica leggera** al DM; `playerNotes` si applica subito in silenzio; i campi non abilitati restano read-only
- il telefono mostra lo stato reale di ogni campo: "in attesa", "approvato", "salvato", "il master è stato avvisato", oppure "sola lettura" se la matita è spenta
- l'approccio all'inventario è permissivo: il giocatore può assegnare e gestire oggetti; se sbaglia, li restituisce al DM. Non c'è annullamento automatico e il DM può spegnere la matita in qualsiasi momento
- **riposi**: il telefono non può dichiararli. Quando il DM avvia un riposo, la scheda aggiorna slot, risorse, HP e dadi vita secondo l'effetto (il lungo recupera HP e dadi vita, il breve no) e mostra "riposo breve/lungo dichiarato dal DM"; la spesa dei dadi vita durante il breve resta un'azione del giocatore secondo policy
- **XP e livello**: barra XP e soglia successiva sono visibili ma read-only; il level-up lo avvia solo il DM dalla console (8.16)
- statblock, privilegi, tratti e azioni restano **sola lettura**; i testi vengono dallo snapshot e non richiedono una chiamata SRD al telefono
- **dadi dal telefono**: il giocatore tocca un dado rapido o scrive una formula, il server tira e il risultato compare sulla vista main del DM e sullo schermo A (se l'overlay dadi del program è attivo, default sì), con nome del personaggio nel risultato; durante il timer mute i controlli indicano la scadenza e i tiri sono disabilitati
- il telefono non sceglie visibilità né risultato: il tiro è sempre `public`, eseguito dal server (D25)
- tiro dal telefono e tiro del DM finiscono nello stesso `Log dadi`, distinti da un badge `giocatore` / `dm`
- le modifiche ai campi visibili al DM arrivano in tempo reale alla console; HP e condizioni sono auto-approvate o pending secondo toggle/cooldown, monete/equipaggiamento/inventario si applicano subito con notifica. Se il personaggio è in onda, si aggiorna anche lo schermo A. Le note del giocatore non vengono trasmesse al DM
- il DM vede l'indicatore "modificato dal giocatore" sui campi che può vedere e può annullare dall'undo globale le azioni che sono entrate nella history (HP, condizioni, iniziativa, token, fog); monete, equipaggiamento e inventario non sono annullabili, le note del giocatore restano fuori dall'undo perché private
- un'azione pending si può ritirare dal telefono finché il DM non ha deciso; il DM può approvarla o rifiutarla dal dock `Azioni`
- il link vale per **un solo attore**: il giocatore non può leggere altri attori, scene, mostri, fog o program, né `dm_notes`; il DM non può leggere `player_notes`
- il token è mostrato una sola volta e salvato hashato: se perso si rigenera, non si recupera
- QR generato lato client (libreria `qrcode`) dall'URL costruita su `PUBLIC_URL`, così funziona dal telefono in LAN
- niente login: il telefono non ha credenziali, solo il link; revoca immediata dal DM
- HP modificati con azione a delta auto-approvata secondo la policy o approvata dal DM (`clamp` sul massimo), così non esiste lost update: c'è un solo writer (D24, D34)

### 8.15 Creazione personaggio (wizard)

- si apre dal `+` di uno slot vuoto, dalla libreria o dal menu campagne; è una route dedicata `/dm/campaigns/:id/actors/new/pc`, non un dialog, così il browser gestisce bozza e indietro
- solo il DM crea `pc`; il wizard usa i cataloghi SRD 5.2 correnti e mostra il `rulesVersion` in testa. La creazione di mostri e NPC resta un flusso separato con gli stessi componenti
- l'attribuzione **SRD 5.2 / CC-BY 4.0** è nella pagina Crediti e in `LICENSES/SRD-5.2.md`; non è un dettaglio opzionale della distribuzione
- **7 step**:
  1. **Identità**: nome, ritratto, specie, background, classe, sottoclasse (se il livello iniziale è ≥ 3), livello iniziale 1–20, allineamento. Le opzioni non valide per il livello scelto sono disabilitate
  2. **Caratteristiche**: point buy (27 punti), standard array, 4d6kh3 eseguito dal server o inserimento manuale autorizzato dal DM; per il tiro la risposta è `{ rollId, values }` e la build referenzia **`rollId`**, non i valori, così il client non può alterarli; assegnazione alle sei caratteristiche, aumenti del background (+2/+1 o +1/+1/+1), anteprima dei modificatori finali
  3. **Competenze e talenti**: scelte di classe, competenze e attrezzi del background, expertise, talento di origine, slot ASI/talento/Epic Boon **previsti dalla tabella della classe** (compresi i livelli extra del fighter), maestrie delle armi, lingue. La UI mostra quante scelte restano
  4. **Equipaggiamento**: budget precompilato dal valore di classe e modificabile dal DM per quel personaggio; negozio dei soli oggetti mundani SRD con ricerca, acquisto/vendita e oro residuo; avviso non bloccante se si compra senza competenza. A livello > 1 il budget di classe non scala: il DM lo aumenta esplicitamente
  5. **Magia**: solo per gli incantatori; cantrip, incantesimi conosciuti/preparati/sempre preparati secondo la classe, libro per il wizard, slot e CD/attacco in anteprima. Per i non incantatori lo step mostra un riepilogo e si salta
  6. **Dettagli**: aspetto, personalità, storia, divinità/patrono, `dmNotes`. Le note del giocatore non si impostano qui: sono private e il DM non le vede
  7. **Riepilogo**: HP, CA, TS, abilità, attacchi, CD/attacco, privilegi e incantesimi risolti; errori bloccanti e avvisi (oro non speso, equipaggiamento senza competenza, scelte mancanti). Il salvataggio è possibile solo senza errori
- **livello iniziale > 1**: il wizard raccoglie in una volta le scelte che un level-up avrebbe chiesto (sottoclasse, ASI/talenti, incantesimi, HP per livello), non simula una sequenza di schermate. Il server valida la build come se tutti i livelli fossero stati applicati
- **HP**: livello 1 = dado vita massimo + modificatore di Costituzione; livelli successivi con media o tiro dal server, registrati in `hpRolls` e mostrati nel riepilogo. I talenti che aggiungono HP entrano nel massimo
- **bozza**: autosalvataggio in `localStorage` con `campaignId`, `rulesVersion` e versione della bozza; al rientro si propone il recupero. Nessuna bozza sul server, nessun attore parziale nel database
- **validazione**: Zod per step per gli errori immediati, `validatePcBuild()` completo alla fine e di nuovo sul server nella transazione di creazione. Gli errori del server tornano associati allo step
- **salvataggio**: `POST /campaigns/:id/actors` crea attore, inventario, risorse e snapshot in una transazione; se il wizard è partito da uno slot vuoto, il nuovo `pc` viene assegnato a quello slot. Nessun autosave del documento
- uscita con conferma se la bozza è sporca; "Annulla" non lascia righe orfane; la creazione a livello 20 è ammessa, il level-up successivo no

### 8.16 Level-up

- il pulsante è sulla scheda e nella barra XP; il DM lo abilita sempre in modalità `milestone`, mentre in modalità `xp` compare "level-up disponibile" al raggiungimento della soglia. Il wizard non parte mai da solo
- il wizard carica i cataloghi della **`rulesVersion` della scheda**, non l'ultima versione: un personaggio vecchio sale di livello con le regole con cui è stato creato. Se la versione non è disponibile, il level-up è bloccato con un errore esplicito
- passi: riepilogo livello attuale → nuovo livello, HP (media/tiro/manuale con anteprima), privilegi e scelte nuove (sottoclasse al 3, expertise, stili di combattimento, ecc.), ASI o talento/Epic Boon se previsto, incantesimi (nuovi slot, preparati/conosciuti, sostituzione se la classe lo consente), equipaggiamento se la classe lo prevede, conferma
- la schermata di conferma mostra il **diff completo**: HP massimi, CA, TS, abilità, CD/attacco, slot, risorse e privilegi aggiunti. Errori bloccanti impediscono l'applicazione
- l'applicazione è una transazione: incrementa `class.level`, aggiunge privilegi/risorse allo snapshot, aggiorna slot e HP, incrementa `sheetVersion`, allinea gli XP se il DM è salito in milestone sotto soglia e rispecchia HP/condizioni sul token in scena. Nessuna scrittura parziale
- in modalità `xp`, dopo un level-up il controllo soglia si ripete: se gli XP bastano ancora, la UI mostra un nuovo "level-up disponibile"
- il level-up **non** entra nella action history di scena e non è annullabile con l'undo globale; un errore si corregge dalla scheda o con un nuovo level-up assistito. Classe e livello non sono modificabili a mano nella scheda
- a livello 20 il pulsante è disabilitato; il multiclasse non è offerto (D57)

### 8.17 Riposi e recupero

- solo il DM dichiara **Riposo breve** o **Riposo lungo** dalla scheda o dal menu di uno slot, scegliendo uno o più `pc`; il telefono non può avviare un riposo
- **breve**: ricarica gli slot del warlock, le risorse con `recharge: 'short'` e i privilegi con la stessa ricarica; non restituisce dadi vita e non cura. La spesa dei dadi vita per curarsi resta un'azione manuale del giocatore
- **lungo**: recupera **tutti gli HP** (gli HP temporanei non vengono toccati) e **tutti i dadi vita spesi**, riduce di 1 il livello di sfinimento, azzera i death saves e ricarica tutti gli slot, le risorse `short`/`long` e i privilegi con ricarica (SRD 5.2)
- condizioni diverse dallo sfinimento, scelte di incantesimi e spesa dei dadi vita restano **manuali**: il riposo non tira dadi al posto del tavolo
- il riposo non applica requisiti di tempo o interruzioni: è una dichiarazione del DM, non un orologio di campagna. La UI ricorda che SRD richiede almeno 1 HP per iniziare, ma non lo impedisce
- l'operazione aggiorna `sheetVersion` e le risorse in una transazione, notifica console e telefoni e non entra nella action history; non è annullabile con l'undo di scena
- ogni risorsa mostra `usati/max` e il tipo di ricarica; una risorsa senza ricarica nota resta manuale e non viene toccata dal riposo

## 9. Fog of war e disegni

La fog non è un'immagine: è una **maschera vettoriale** applicata sopra la mappa con semantica di pittura. Le operazioni sono ordinate, quindi il risultato è deterministico e l'undo è banale.

### 9.1 Modello

```ts
interface FogState {
  base: 'hidden' | 'revealed';   // copertura di partenza, mutabile
  ops: FogOp[];                  // applicate in ordine: l'ultima che copre il punto vince
}

interface FogOp {
  id: string;
  mode: 'reveal' | 'hide';
  shape: FogShape;
  softness: number;              // px immagine, 0 = bordo netto
  createdAt: string;
}

type FogShape =
  | { kind: 'brush'; points: Point[]; radius: number }  // polilinea, estremità tonde
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: Point[] };               // lasso chiuso

// Point = { x: number; y: number } in pixel immagine
```

- coordinate **sempre in pixel immagine**, mai in pixel schermo: zoom e pan non cambiano la fog
- `reveal` toglie copertura (`destination-out`), `hide` la aggiunge (`source-over`)
- l'ordine conta: un `hide` dopo un `reveal` ricopre, e viceversa
- `base` copre entrambe le direzioni: mappa coperta con stanze rivelate, oppure mappa scoperta con una stanza nascosta
- `SceneState.fog` è l'unica sede della fog: nessuna tabella, nessun PNG (D4)

### 9.2 Copertura iniziale

- `campaigns.fog_default` è il default della campagna (`hidden` di default), modificabile da "Dettagli campagna"
- alla creazione di una scena: `fog = { base: campaign.fog_default, ops: [] }` — coerente per costruzione, mai "fog assente"
- in upload mappa il DM vede il radio "parti coperta / parti scoperta" già preselezionato dal default; la scelta vale solo per quella scena
- cambiare il default di campagna **non** tocca le scene esistenti
- "Rivela tutto" / "Nascondi tutto" impostano `base` e svuotano `ops`, con conferma; sono comandi undoable, non reset impliciti

### 9.3 Rendering

- maschera su canvas **offscreen** in coordinate immagine, non un layer Konva per operazione
- risoluzione: `maskScale = min(1, 4096 / max(width, height))` — una mappa 8k produce una maschera 4096 px, non 64 MPx
- canvas `committed` (tutte le op applicate) + canvas `active` (tratto in corso): durante il drag si ridisegna solo `active`, al rilascio si applica **solo la nuova op** a `committed`, O(1) per tratto
- rebuild completo O(n) solo su load, undo/redo, cambio di `base` o resize
- la maschera viene pubblicata come **un solo** `Konva.Image` sopra i token, con `listening = false` (i click passano ai token sotto); pan e zoom trasformano l'immagine, non la ridisegnano
- bordo morbido con `ctx.filter = blur(softness)` sulla singola op; se `filter` non è supportato si degrada a bordo netto
- **vista DM**: alpha 50% + pattern diagonale leggero, così il DM vede la stanza senza confonderla con ciò che è in onda
- **schermo A**: alpha 100%, opaca; `blackout` è sopra la fog
- la fog non modifica mai l'asset della mappa: è sempre un layer separato

### 9.4 Visibilità dei token

La fog non è solo estetica: un token dentro la fog **non deve viaggiare nel payload** dello schermo A, altrimenti chi apre i devtools vede l'imboscata.

- regola: un token è visibile sullo schermo A se `token.visible === true` **e** il centro del token è scoperto
- `isPointRevealed(fog, point)` è una funzione pura in `shared`: parte da `base`, scorre `ops` in ordine e applica point-in-polygon / point-in-rect / distanza dal segmento ≤ `radius`
- il server la usa per filtrare `DisplayScene.tokens`: stessa geometria del client, nessuna rasterizzazione lato server
- per token con `size > 1` vale il centro: regola semplice e prevedibile, documentata nel tooltip
- l'elevazione non modifica la visibilità nella fog: un token volante segue la stessa regola del centro di un token a terra (D51)
- il DM vede comunque tutto sul PGM: il filtro riguarda solo `DisplayState`
- **l'iniziativa non è filtrata dalla fog**: se un mostro è in iniziativa i giocatori ne conoscono il nome, non la posizione. Per escluderlo il DM usa `hidden` sulla singola voce

### 9.5 Strumenti

| Strumento | Comportamento |
|---|---|
| Pennello rivela | drag libero, raggio S/M/L = 1/3/6 celle, cursore circolare |
| Pennello nascondi | identico, `mode: 'hide'` |
| Rettangolo | drag da angolo ad angolo, anteprima, commit al rilascio |
| Lasso | click per i vertici, doppio click o Enter chiude, Esc annulla |
| Inverti temporaneo | `Alt` mentre si disegna scambia reveal/hide senza cambiare tool |
| Rivela tutto / Nascondi tutto | azione globale con conferma |

- ogni gesto produce **una** `FogOp` (la polilinea del pennello è una sola op, non una per punto)
- i punti del pennello vengono semplificati alla commit (Ramer–Douglas–Peucker, tolleranza 1 px) per non far crescere il JSON
- la toolbar di 8.4 mostra lo strumento attivo; la statusbar mostra il numero di operazioni correnti della fog
- touch e penna supportati su PGM e console: stessi eventi di puntatore riproiettati (D19)

### 9.6 Undo, limiti e persistenza

- non esiste uno stack di undo separato per la fog: `fog.apply` è una normale `GameAction` e finisce nella **action history** del server (6.8)
- "Rivela tutto" / "Nascondi tutto" è `fog.replace` con l'inverso calcolato dal server: annullarla ripristina `{ base, ops }` precedenti in una sola azione
- Ctrl+Z sulla mappa invoca `undo` sull'ultima azione (fog o no) e produce una notifica leggera a console e telefoni; dopo un reload l'undo resta possibile finché l'azione è nelle ultime 50
- **budget**: 2.000 op per scena. A 1.600 il client avvisa; `fog.apply` oltre 2.000 risponde `413` e la UI suggerisce "Rivela/Nascondi tutto" per ripartire
- un `fog.replace` che produrrebbe più di 2.000 op viene rifiutato **prima** della transazione: nessuna scena a metà
- la fog viaggia dentro `SceneState`: export e import la includono senza formati aggiuntivi
- nessuna compaction automatica nell'MVP: se il budget diventa un problema si aggiunge dopo l'MVP

### 9.7 Fog e superfici

- `/display/:code` riceve `DisplayScene.fog` con `base` e `ops` e la disegna al 100%: è lo stesso dato del DM, non un'immagine prerenderizzata
- `/play/:token` non riceve né mappa né fog: il telefono vede solo la scheda
- `PVW` mostra la fog come lo schermo A (100%), così il DM vede il risultato reale prima del `TAKE`
- cambiare contenuto in onda non tocca la fog; cambiare scena sì, perché è parte del suo `SceneState`

### 9.8 Fuori scope

- luce dinamica, darkvision, line of sight e muri occlusivi
- elevazione e volo rispetto alla fog: oggi un token volante è nascosto come uno a terra
- fog animata o con texture personalizzate
- export PNG della mappa con fog: opzionale, on-demand, mai formato di persistenza

## 10. Dadi e overlay

### 10.1 Motore (`shared`)

- Parser di formule: `NdX`, modificatori `+`/`-`, keep highest/lowest `kh`/`kl`, vantaggio/svantaggio (`2d20kh1` / `2d20kl1`)
- Esempi supportati: `1d20+5`, `2d6+3`, `4d6kh3`, `8d6`, `1d20` con `mode: 'advantage'`
- RNG iniettabile: default `crypto.getRandomValues`, mai `Math.random`; nei test si usa `mulberry32` con seed fisso
- Output deterministico dato il seed → test affidabili
- Funzioni pure: `parseFormula`, `rollDice`, `rollWithMode`

### 10.2 Overlay dadi (nativo)

- `<dialog>` full-screen sopra la scena, backdrop leggero, chiusura con Esc o click fuori; nessuna dipendenza da CDK
- focus trap e ripristino del focus all'elemento di partenza; `aria-labelledby` sul titolo
- Quick dice d4/d6/d8/d10/d12/d20/d100, modificatore, vantaggio/svantaggio, formula libera
- Se un token è selezionato, propone i suoi modificatori e allega `tokenId` al tiro
- Risultato animato; con `prefers-reduced-motion` nessuna animazione
- `aria-live="polite"` sul risultato
- Visibilità: `public` (console + schermo A) o `dm` (solo console). Un tiro chiesto dal telefono è **sempre** `public`: il server ignora un eventuale `visibility` inviato dal client
- Sullo schermo A i tiri compaiono in sovrimpressione alla composizione in onda quando `program.hud.dice` è attivo (default attivo)
- Sulla vista main del DM i tiri arrivano sempre, anche con l'overlay spento: il DM non deve mai perdere un tiro dei giocatori
- Il tiro è eseguito dal server (D25): la console invia formula e modo, non il risultato. Il client non può "vincere" un tiro manipolando il payload
- il DM può avviare o interrompere un timer di mute dei tiri player (30 s / 1 / 5 / 10 / 30 min / 1 h); il timer vive solo in memoria server, non si esporta e non persiste tra riavvii
- Storico degli ultimi 200 tiri nella lista del dock, click su un tiro per ripeterlo (la ripetizione è un nuovo tiro server-side)

### 10.3 Persistenza e realtime

- Il tiro è un **evento**, non un'azione: non entra in `action_log`, non è annullabile, non tocca `SceneState`. Vive solo in `dice_rolls`
- Il tiro è un **comando**, non una modifica di scena: `POST /campaigns/:id/rolls` (DM) o `POST /play/:token/rolls` (giocatore), oppure il messaggio WS `roll.request` sullo stesso canale già aperto
- Il server valida la formula (max 100 dadi, lati 2-1000, lunghezza massima), esegue il roller di `shared` con `crypto` e scrive in `dice_rolls` (D13, D25)
- Il server emette `dice.roll` a `dm`, `display` (solo `public`) e `player` (solo i propri tiri); la risposta contiene il risultato completo, non un id da rileggere
- il mute temporaneo player è stato di campagna in memoria server: `mutedUntil` è incluso nell'hello dei ruoli DM/player e broadcast con `rolls.mute.updated`; alla scadenza il server broadcasta `null`. Durante il mute `POST /play/:token/rolls` risponde `403 rolls_muted` e `roll.request` riceve `error.code: 'rolls_muted'`; nessun dado viene tirato o scritto in `dice_rolls`
- Il client può mandare un `requestId` per correlare la richiesta alla risposta; il server è idempotente su `requestId` per 30 s, così un retry non produce due tiri
- Rate limit: 1 tiro ogni 300 ms per token e 20/minuto; oltre soglia `429` senza broadcast
- I tiri non sono undoable: sono un log, non uno stato della mappa. La retention è di 200 righe per campagna, il resto è cancellato FIFO. Non compaiono nel pannello `Azioni`
- L'iniziativa può essere tirata dall'overlay e scritta con `initiative.set` (azione DM, storica e annullabile); il tiro che l'ha generata resta nel solo log dei dadi
- Il log compare nel dock `Log dadi`, nella scheda del giocatore (`recentRolls`) e — per la parte pubblica — nel `DisplayState`

## 11. Export/import JSON

### 11.1 Formato

Un file `.json` per **una campagna**, `schemaVersion: 1`. Il file è un backup completo e autonomo: nessun path assoluto, nessun segreto, nessun id che debba esistere già sul server di destinazione.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-10-28T10:00:00.000Z",
  "appVersion": "0.1.0",
  "privateNotesIncluded": false,
  "campaign": {
    "id": "0192f...",
    "name": "La miniera perduta",
    "description": "...",
    "fogDefault": "hidden",
    "autoApprove": true,
    "activeSceneId": "0192f..."
  },
  "program": { "version": 12, "state": { "...": "..." } },
  "scenes": [
    {
      "id": "0192f...",
      "name": "Ingresso",
      "imageAssetId": "0192f...",
      "widthPx": 4096,
      "heightPx": 3072,
      "state": { "...": "..." }
    }
  ],
  "actors": [
    {
      "id": "0192f...",
      "kind": "npc",
      "name": "Goblin",
      "dmNotes": "..."
    }
  ],
  "items": [{ "id": "0192f...", "name": "Spada corta", "type": "weapon" }],
  "inventories": [
    { "id": "0192f...", "actorId": "0192f...", "itemId": "0192f...", "quantity": 1 }
  ],
  "sessions": [{ "id": "0192f...", "startedAt": "...", "endedAt": "..." }],
  "diceRolls": [
    { "id": "0192f...", "formula": "1d20+5", "result": 17, "origin": "player", "at": "..." }
  ],
  "assets": [
    {
      "id": "0192f...",
      "hash": "sha256:...",
      "mime": "image/png",
      "width": 4096,
      "height": 3072,
      "bytes": 1234567,
      "data": "base64..."
    }
  ]
}
```

- `exportedAt` e `appVersion` sono informativi: l'import non li usa per decidere nulla
- `privateNotesIncluded` dice senza ambiguità se il file contiene `playerNotes`; il campo `playerNotes` è **assente**, non `null`, quando il flag è `false`
- ogni `id` è quello della campagna di origine e viene rimappato all'import; nessun id del file viene riusato
- il campo `state` delle scene è il documento completo (`SceneState`), fog inclusa: non esiste un formato separato per la fog
- `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="<campaign-slug>-YYYYMMDD.json"`, `Cache-Control: no-store`

### 11.2 Cosa entra e cosa non entra

| Incluso | Escluso | Perché |
|---|---|---|
| campagna, `program`, scene + `SceneState` | `player_links` | il token è hashato e non recuperabile: importarlo creerebbe link morti |
| attori, `dmNotes` | `displays` | codici legati ai dispositivi e alla sessione, non al contenuto |
| `playerNotes` solo con flag | `campaign_messages` (chat IA) | la chat è conversazione, non contenuto della campagna (scelta esplicita) |
| oggetti e inventari | statistiche | derivate da sessioni e tiri, si ricalcolano |
| sessioni e `dice_rolls` | `.env`, `SESSION_SECRET` | segreti, mai esportati |
| asset (embedded o slim) | log applicativi | rumore, nessun valore di ripristino |

- le note del DM sono sempre incluse: sono sue
- le schede `pc` viaggiano con `rulesVersion`, `xp` e lo **snapshot** di privilegi/incantesimi/oggetti: l'import non richiede i cataloghi SRD della stessa versione e il personaggio non cambia aspetto dopo un aggiornamento
- i mostri e gli NPC SRD mantengono lo statblock risolto; i cataloghi globali non vengono esportati come tabelle separate
- `advancement_mode`, `xp` e gli oggetti custom (`source='custom'`, `data`) sono inclusi; gli oggetti SRD referenziati restano identificati da `srd_key` e dallo snapshot
- gli `items` globali SRD **non** vengono esportati come catalogo: l'import li ricrea dal seed della versione e ricollega l'inventario per `srd_key`; gli oggetti custom viaggiano nel file
- se un `srd_key` non esiste più nella versione importata, l'import crea un oggetto custom dallo snapshot e lo segnala nel report, invece di perdere l'oggetto
- le note dei giocatori sono **opt-in** (`includePrivateNotes=true`): la UI avvisa che il file conterrà testo che la console non mostra (D26). Senza flag il backup resta valido ma non pretende di essere onnisciente
- il file non contiene mai `dm_notes` nel payload del telefono né `player_notes` nella console: l'export è un'eccezione esplicita e riguarda solo il file, non le API

### 11.3 Asset

- default `embedAssets=true`: ogni asset porta `data` in base64, così il file si ripristina su un'altra macchina senza copiare `data/uploads`
- `embedAssets=false`: niente `data`, solo `hash`, `mime`, `bytes`, dimensioni e `path` relativo. Il file è molto più piccolo ma richiede che gli asset esistano già sul server di destinazione
- si esporta l'**originale**, non la variante WebP o la thumbnail: quelle si rigenerano con `sharp` all'import. Meno byte, nessuna perdita di qualità
- base64 aggiunge circa il 33%: il limite `MAX_EXPORT_MB=100` si misura sul file finale, non sui byte delle immagini
- all'import ogni asset viene verificato: `bytes` decodificati, hash SHA-256 ricalcolato, MIME e dimensioni ricontrollati. Un hash che non corrisponde è un file corrotto, non un warning
- gli asset sono deduplicati per `hash`: se esistono già, si riusa l'id e non si duplica il file
- un asset oltre 20 MB o 8000 px viene rifiutato anche se il JSON è formalmente valido: le stesse regole dell'upload (14.5)

### 11.4 Import: sempre una nuova campagna

`POST /api/v1/campaigns/import` non ha `mode`. Ogni import crea una campagna nuova con id nuovi; **non esiste merge** e non esiste sovrascrittura.

- il file viene letto, migrato alla versione corrente e poi validato con gli schemi Zod correnti (`strict`: un campo sconosciuto è un errore, non viene ignorato)
- tutti gli id vengono rimappati in una mappa unica: campagne, scene, attori, oggetti, inventari, loot di scena, sessioni, tiri e asset. I riferimenti interni (`activeSceneId`, `token.actorId`, `ProgramState.base/overlays[].content`, `loot.itemId`, `inventory.itemId`, `statblock.snapshot.items[].id`) vengono riscritti nella stessa transazione
- l'import è **atomico**: o entra tutto o non entra nulla. Un errore a metà file non lascia una campagna parziale
- gli asset vengono scritti su disco prima del commit, in una directory content-addressed: se il commit fallisce restano orfani innocui, puliti dal job esistente (14.5)
- se il nome della campagna esiste già, si aggiunge ` (importata)` e poi ` (importata 2)`, ` (importata 3)`: nessuna fusione silenziosa
- il `program` viene importato ma con `blackout: true` e `cameraLocked: false`: il DM non manda in onda nulla per sbaglio, deve fare `TAKE`
- `sessions` e `dice_rolls` conservano i timestamp originali ma ricevono id nuovi; il log resta append-only
- `lastCampaignId` non viene toccato: dopo l'import il DM sceglie se aprire la copia
- importare due volte lo stesso file crea due campagne identiche: è il comportamento corretto di "nessun merge", e la UI lo dice prima di procedere

### 11.5 Versioning e migrazioni

- `schemaVersion` è un intero e avanza solo per cambiamenti **incompatibili**: campo obbligatorio nuovo, semantica cambiata, campo rimosso che perderebbe dati. Aggiungere un campo opzionale non richiede un bump
- l'export scrive sempre la versione corrente
- una migrazione di campagne storiche che non hanno `autoApprove` imposta il default permissivo `true`; i link giocatore esclusi dall'export vengono ricreati solo dopo una nuova condivisione
- l'import accetta **tutte le versioni passate**: una catena di funzioni pure `migrate_1_to_2`, `migrate_2_to_3`, ... applicata in ordine fino alla corrente
- se manca un passo della catena il file viene rifiutato con `unsupported_schema_version` e `details: { found, supported }`; non si tenta una conversione parziale
- ogni versione ha una fixture committata e un test che la porta alla corrente; una fixture non si cancella quando la versione diventa vecchia, altrimenti "tutte le versioni" diventa una promessa non verificata
- le migrazioni vivono nel server (`server/src/import/migrations/`), non in `shared`: sono una responsabilità di importazione, non un tipo condiviso con il client
- la migrazione dalla forma precedente di `ProgramState` (`content` singolo + flag HUD) crea `base` da `content`, `overlays: []` e sposta i flag HUD nel nuovo campo `hud`
- una campagna precedente al builder riceve `advancement_mode='milestone'` e `xp=0`; un attore senza `statblock.kind` lo eredita dalla colonna `kind` e, se non ha snapshot, i derivati si calcolano dai campi presenti

### 11.6 Limiti e prestazioni

- export massimo 100 MB (`MAX_EXPORT_MB`), import massimo 100 MB (`MAX_IMPORT_MB`); oltre, `413` con suggerimento `embedAssets=false` per l'export
- l'export è in **streaming**: il server scrive array e asset un pezzo alla volta, non costruisce un documento da 100 MB in memoria
- l'import oltre 8 MB viene parsato in un **worker thread**, così il loop di Fastify non si blocca mentre il DM aspetta; i file piccoli restano sincroni
- gli asset vengono decodificati uno alla volta e scritti subito: non si tiene in memoria l'intero file
- guardrail anti-DoS: massimo 20.000 entità totali, 5.000 scene, 10.000 attori; oltre, `413` con `details` esplicito
- rate limit 2/min per IP (12.7): un import non è un'operazione da raffica
- l'import non usa `eval`, non esegue template e non segue path contenuti nel file: il campo `path` dello slim è solo un suggerimento verificato contro `UPLOAD_DIR`

### 11.7 Sicurezza dell'export

- solo DM (cookie o loopback); nessun ruolo display o player può leggere il file
- `Cache-Control: no-store` e nessun URL firmato: il file si scarica una volta e resta al DM
- il nome file è generato dal server da uno slug della campagna, mai da un campo libero non sanificato
- `includePrivateNotes=true` è un'azione esplicita con conferma nella UI e un log applicativo che registra **che** è stato esportato, non il contenuto
- il file è dato sensibile: contiene `dmNotes`, mappe e, su richiesta, `playerNotes`. Va trattato come un backup, non come un allegato da chat
- un import non può escalare permessi: il ruolo dell'importatore è DM, e la campagna creata resta una campagna normale

### 11.8 Fuori scope

- formati compressi (`.zip`, `.tar`), formati di altri VTT (Foundry, Roll20) e conversione da PDF
- export incrementale o sincronizzazione tra machine
- backup automatici schedulati: l'export è un'azione del DM
- import con merge, dedup per nome o ripristino "sovrascrivi la campagna esistente"
- export della chat IA, dei link giocatore e dei codici display

## 12. API

### 12.1 Convenzioni

- prefisso `/api/v1`, JSON `application/json; charset=utf-8`, date ISO 8601 UTC, id `uuid v7`
- validazione Zod su params, query, body **e response**: il contratto è verificato in produzione, non solo in test
- ogni risposta di errore ha la stessa forma:

```ts
interface ApiError {
  error: {
    code: ErrorCode;       // stabile, pensato per il codice client
    message: string;       // leggibile, in italiano
    details?: unknown;     // es. { field: 'formula', reason: 'too_many_dice' }
    requestId: string;     // correlazione con i log
  };
}
```

- `HEAD`/`OPTIONS` gestiti dal framework; niente `PATCH` parziale su `SceneState`: le mutazioni sono azioni (6.5), il `PUT` full-document resta solo per recovery/import
- le azioni DM rispondono `200` con l'azione canonica; le azioni player auto-approvate rispondono `200` (`decision: 'auto-approved'`), quelle in coda `202` (`{ pendingId, decision: 'pending' }`)
- `GET /scenes/:id/snapshot` è DM-only; senza variazioni rispetto a `If-None-Match` risponde `304`, `?force=true` ignora il validator e restituisce sempre lo snapshot completo con `ETag` aggiornato
- `GET /api/v1/openapi.json` generato da Zod: pubblico in dev, riservato al DM in produzione

### 12.2 Autenticazione

Quattro superfici, quattro credenziali. Nessun account utente, nessun provider esterno.

| Superficie | Credenziale | Come viaggia | Scope |
|---|---|---|---|
| Console DM | password locale → cookie firmato | `POST /auth/dm` → `Set-Cookie: dm_session` (`HttpOnly`, `SameSite=Strict`, `Secure` se HTTPS) | tutto, tutte le campagne |
| Console DM su loopback | **fiducia implicita** | nessuna solo se il peer socket è loopback, `Host` è localhost/loopback e non ci sono header di forwarding proxy | come sopra |
| Schermo A | `code` (+ `pin` opzionale) | query string nell'URL `/display/:code` | sola lettura, una campagna |
| Telefono giocatore | token del link | path `/play/:token` | sola lettura/scrittura del proprio attore |

- `DM_PASSWORD` è obbligatoria se `HOST` o `PUBLIC_URL` non sono loopback; ogni deployment dietro proxy la imposta esplicitamente, perché il bypass è disabilitato
- il cookie è firmato HMAC con `SESSION_SECRET` (generato al primo avvio in `data/.session-secret` se assente) e contiene `{ v, iat, exp }`: nessuna tabella sessioni
- TTL 30 giorni; logout = cookie cancellato; cambio di `SESSION_SECRET` invalida tutte le sessioni
- più console DM sono ammesse contemporaneamente; non si identificano né revocano singoli dispositivi nell'MVP. Logout cancella il cookie del browser corrente; la rotazione di `SESSION_SECRET` revoca globalmente tutti i cookie
- `GET /auth/me` restituisce il ruolo risolto: serve al client per distinguere "loopback" da "cookie valido" e per gestire la modale di accesso
- il loopback bypass richiede **anche** `Host` `localhost`, `127.0.0.1` o `[::1]` e assenza di `Forwarded`/`X-Forwarded-*`; se ci sono header proxy, il client deve autenticarsi con password. Nessun `TRUST_PROXY` nell'MVP
- display e player **non** possono mai ottenere un cookie DM: il ruolo è derivato dalla credenziale, non da un header inviato dal client

### 12.3 Endpoint

```text
# pubblico
GET    /api/v1/health                                  # { status, version, db: 'ok' | 'migration_pending' }
POST   /api/v1/auth/dm                                 # { password } → cookie
DELETE /api/v1/auth/dm                                 # logout
GET    /api/v1/auth/me                                 # { role: 'dm' | 'none' }

# SRD (cataloghi statici versionati, sola lettura)
GET    /api/v1/srd/meta                                # { version, license, updatedAt }
GET    /api/v1/srd/:version/classes                    # classi + sottoclassi + progressione
GET    /api/v1/srd/:version/species
GET    /api/v1/srd/:version/backgrounds
GET    /api/v1/srd/:version/feats
GET    /api/v1/srd/:version/spells                     # ?level, ?class, ?q
GET    /api/v1/srd/:version/items                      # ?category, ?q
GET    /api/v1/srd/:version/monsters                   # ?cr, ?type, ?q

# le versioni SRD non si cancellano: una scheda può dipendere da una vecchia

# DM (cookie o loopback)
GET    /api/v1/campaigns                               # ?limit, ?cursor, ?sort
POST   /api/v1/campaigns
GET    /api/v1/campaigns/:id
PATCH  /api/v1/campaigns/:id                           # name, description, fogDefault, activeSceneId, autoApprove, advancementMode
DELETE /api/v1/campaigns/:id

GET    /api/v1/campaigns/:id/export?embedAssets=true&includePrivateNotes=false  # stream JSON
POST   /api/v1/campaigns/import                        # JSON, max 100 MB, sempre nuova campagna

GET    /api/v1/campaigns/:id/program                   # { version, state }
PUT    /api/v1/campaigns/:id/program                   # { version, state, confirmPublish? } → 409
POST   /api/v1/campaigns/:id/program/take              # { composition: ProgramComposition, confirmPublish? }; conferma se un layer è riservato
POST   /api/v1/campaigns/:id/rolls                     # { formula, mode, visibility?, tokenId?, requestId }
GET    /api/v1/campaigns/:id/rolls                     # ?limit, ?origin, ?visibility
POST   /api/v1/campaigns/:id/rolls/mute                # DM: { durationSeconds: 30|60|300|600|1800|3600 }
DELETE /api/v1/campaigns/:id/rolls/mute                # DM: termina il mute prima della scadenza

POST   /api/v1/displays                                # { campaignId, label?, pin? } → { code, url }
GET    /api/v1/displays?campaignId=:id
DELETE /api/v1/displays/:id
POST   /api/v1/displays/:id/rotate                     # nuovo code, vecchio invalido

POST   /api/v1/actors/:id/player-links                 # { editable = all supported fields, editingEnabled = true } → { url } (token in chiaro una sola volta)
GET    /api/v1/campaigns/:id/player-links
DELETE /api/v1/player-links/:id
POST   /api/v1/player-links/:id/rotate
PATCH  /api/v1/player-links/:id                        # { editable, editingEnabled, label } — non cambia il token

GET    /api/v1/campaigns/:id/scenes
POST   /api/v1/campaigns/:id/scenes
GET    /api/v1/scenes/:id                              # { scene, state, stateVersion }
GET    /api/v1/scenes/:id/snapshot                     # snapshot completo; If-None-Match → 304; `?force=true` forza il body
PATCH  /api/v1/scenes/:id                              # metadati: nome, immagine, dimensioni
PUT    /api/v1/scenes/:id/state                        # SOLO recovery/import → 409 · 413 (12.6)
DELETE /api/v1/scenes/:id

# azioni (6.5–6.8)
POST   /api/v1/campaigns/:id/actions                   # GameAction dal DM → applicata subito
GET    /api/v1/campaigns/:id/actions                   # ?status=applied|undone, ultime 50
POST   /api/v1/campaigns/:id/actions/:actionId/undo-to # annulla fino a qui, in transazione
POST   /api/v1/campaigns/:id/actions/redo              # riapplica l'ultimo batch annullato
GET    /api/v1/campaigns/:id/actions/pending           # coda in memoria, solo DM
POST   /api/v1/campaigns/:id/actions/pending/:id/approve
POST   /api/v1/campaigns/:id/actions/pending/:id/reject

GET    /api/v1/actors                                  # ?kind, ?campaignId, ?q, ?limit, ?cursor
POST   /api/v1/actors                                  # mostri/NPC di libreria o campagna; non crea pc
POST   /api/v1/actors/preview                          # bozza completa: validazione + derivati, nessuna scrittura
POST   /api/v1/campaigns/:id/actors                    # crea un pc nella campagna (build completa, transazione)
POST   /api/v1/campaigns/:id/actors/roll-stats         # 4d6kh3 dal server → { rollId, values, expiresAt }
GET    /api/v1/actors/:id                              # DmActorView
GET    /api/v1/actors/:id/sheet                        # DmSheetView (solo pc): statblock, snapshot, derivati, inventario
PATCH  /api/v1/actors/:id                              # metadati, note DM, immagine
PATCH  /api/v1/actors/:id/sheet                        # { sheetVersion, patch } → 409 se stale
POST   /api/v1/actors/:id/level-up/preview             # scelte + diff derivati, nessuna scrittura
POST   /api/v1/actors/:id/level-up                     # transazione: livello, HP, slot, snapshot
DELETE /api/v1/actors/:id
GET    /api/v1/actors/:id/inventory
POST   /api/v1/actors/:id/inventory                    # { itemId, quantity }
PATCH  /api/v1/inventory/:id                           # { quantity, state }
DELETE /api/v1/inventory/:id

POST   /api/v1/campaigns/:id/rest                      # DM: { type: 'short'|'long', actorIds }
POST   /api/v1/campaigns/:id/xp                        # DM: { actorIds, delta } — registrato in entrambe le modalità

GET    /api/v1/items                                   # ?type, ?rarity, ?q, ?campaignId
POST   /api/v1/items
GET    /api/v1/items/:id
PATCH  /api/v1/items/:id
DELETE /api/v1/items/:id

GET    /api/v1/campaigns/:id/sessions
POST   /api/v1/campaigns/:id/sessions/start
POST   /api/v1/sessions/:id/stop
GET    /api/v1/campaigns/:id/stats

GET    /api/v1/campaigns/:id/messages                  # chat, paginata
POST   /api/v1/campaigns/:id/chat                      # SSE

POST   /api/v1/assets                                  # multipart, max 20 MB
GET    /api/v1/assets/:id
DELETE /api/v1/assets/:id                              # 409 se referenziato

POST   /api/v1/actors/parse                            # opzionale, Fase 9
GET    /api/v1/openapi.json

# display (code + pin)
GET    /api/v1/displays/:code/state                    # DisplayState risolto

# player (token del link)
GET    /api/v1/play/:token/sheet                       # PlayerSheetView, include editingEnabled
PATCH  /api/v1/play/:token/sheet                       # campi `notify`/`private` diretti (HP, death saves, dadi vita, risorse, incantesimi, inventario, monete); `editingEnabled=false` → 403
POST   /api/v1/play/:token/actions                     # auto-approvata → 200; pending → 202 Accepted
DELETE /api/v1/play/:token/actions/:id                 # ritira una propria azione pending
POST   /api/v1/play/:token/hp                          # { delta } → auto-approvata o pending secondo policy
POST   /api/v1/play/:token/rolls                       # { formula, mode, requestId } → public; mute attivo → 403 `rolls_muted`
GET    /api/v1/play/:token/rolls                       # ultimi 10 del personaggio
POST   /api/v1/play/:token/heartbeat                   # presenza, ogni 30 s

# statico
GET    /uploads/:hash/:file                            # read-only, Cache-Control: immutable

WS     /api/v1/ws?role=dm&campaignId=:id               # cookie + Origin
WS     /api/v1/ws?role=display&code=:code&pin=         # sola lettura
WS     /api/v1/ws?role=player&token=:token             # solo il proprio attore
```

### 12.4 Errori

| `code` | HTTP | Quando |
|---|---|---|
| `validation_error` | 400 | body/query/params non validi |
| `unsupported_schema_version` | 400 | `schemaVersion` senza catena di migrazione |
| `unauthorized` | 401 | credenziale mancante, scaduta o revocata |
| `forbidden` | 403 | campo non in `editable`, ruolo insufficiente |
| `editing_disabled` | 403 | la matita è spenta: nessuna scrittura dal telefono, note comprese |
| `rolls_muted` | 403 | timer di mute attivo; `details: { mutedUntil }`; il server non tira e non registra il dado |
| `not_found` | 404 | risorsa inesistente **o** non visibile al ruolo |
| `srd_version_unknown` | 404 | `rulesVersion` non presente tra i cataloghi conservati |
| `state_conflict` | 409 | `stateVersion` stale (solo recovery/import) |
| `action_stale` | 409 | l'azione pending ha un bersaglio che non esiste più |
| `action_not_undoable` | 409 | azione fuori dalle ultime 50, già `undone`, o `notify`/`private` |
| `program_conflict` | 409 | `programVersion` stale |
| `confirmation_required` | 409 | pubblicazione di contenuto marcato `confirmBeforeTake` senza `confirmPublish: true` |
| `sheet_conflict` | 409 | `sheetVersion` stale su una modifica della scheda |
| `roll_expired` | 409 | `rollId` del tiro caratteristiche scaduto o sconosciuto |
| `level_up_unavailable` | 409 | modalità `xp` sotto soglia, livello 20 o build non valida per il nuovo livello |
| `asset_in_use` | 409 | delete di un asset referenziato |
| `payload_too_large` | 413 | `SceneState` > 1 MB, fog > 2.000 op, export/import > 100 MB, troppe entità |
| `unsupported_media_type` | 415 | upload fuori whitelist |
| `misdirected_request` | 421 | `Host` non in allowlist (DNS rebinding) |
| `invalid_build` | 422 | point buy/array/tiri fuori regola, competenze o incantesimi mancanti, sottoclasse non valida; `details` per step |
| `insufficient_funds` | 422 | acquisto oltre il budget iniziale |
| `asset_unavailable` | 422 | export slim con asset mancante o hash non corrispondente |
| `rate_limited` | 429 | con `Retry-After` |
| `internal_error` | 500 | nessuno stack nel body, solo `requestId` |

- un id inesistente e un id di un'altra campagna danno lo stesso `404`: non si distinguono
- `409 state_conflict` (recovery/import) restituisce `details: { currentVersion, currentHash }`; il client rifetcha, non riceve l'intero documento
- `403` vs `404`: `403` dice "esiste ma non puoi", `404` dice "non è tuo"; per gli attori altrui si usa sempre `404`
- un `approve` su un'azione già rifiutata o ritirata dà `409 action_stale`: la coda è concorrente, non si finge che sia lineare

### 12.5 Paginazione

- `?limit` default 50, massimo 200; `?cursor` opaco (`base64url` di `{ createdAt, id }`), `?sort=-createdAt|name`
- risposta `{ items: T[], nextCursor: string | null }`
- i log (`dice_rolls`, `messages`) usano lo stesso schema, con `nextCursor` più vecchio
- niente offset: con inserimenti frequenti l'offset duplica o salta righe

### 12.6 Concorrenza e idempotenza

- `POST /campaigns/:id/actions` non ha `stateVersion` nel body: il server serializza le azioni e le applica una alla volta in transazione. Due console DM non si sovrascrivono perché nessuna delle due invia un documento
- `action.id` è la chiave di idempotenza: un retry dopo un timeout non applica due volte lo stesso danno. Il server ricorda gli id applicati almeno finché restano nelle ultime 50 azioni
- `undo-to` e `redo` operano in un'unica transazione: o si annulla tutto il batch o niente. `redo` è valido solo finché non arriva una nuova azione, poi `409 action_not_undoable`
- `POST` delle azioni player usa un lock per attore intorno a idempotenza, cooldown, auto-approvazione e inserimento pending: due richieste concorrenti non possono auto-approvarsi entrambe. Il lock serializza anche `approve`, `reject` e `DELETE`; chi arriva dopo su una richiesta già risolta perde con `409 action_stale`
- l'id di una pending è idempotente anche prima dell'approvazione: retry e riconnessioni restituiscono la stessa decisione senza duplicare la richiesta né azzerare il cooldown
- `PUT /scenes/:id/state` resta come **recovery/import** e confronta `state_version` nella stessa transazione; non è usato dal client durante l'editing
- `PUT /campaigns/:id/program` resta l'unico writer versionato del program, con `program_version`
- `POST /play/:token/hp` non scrive mai direttamente: invia un'azione `approval` e risponde `200` se auto-approvata o `202` se pending. Il `delta` viene applicato in transazione con `clamp(0, max)` solo quando l'azione è approvata
- `PATCH /actors/:id/sheet` richiede `sheetVersion`; il server confronta e incrementa nella stessa transazione. `POST /actors/:id/level-up` e `POST /campaigns/:id/rest` fanno lo stesso, così un level-up e un riposo concorrenti non si sovrascrivono
- `POST /actors/preview` e `level-up/preview` sono **pure**: non scrivono, non consumano id, non cambiano `sheetVersion`
- `roll-stats` conserva i sei valori in memoria per 30 minuti e restituisce un `rollId`; creazione e preview risolvono il `rollId` sul server e ignorano eventuali valori inviati dal client. Un `rollId` scaduto o sconosciuto → `409 roll_expired`
- `POST /campaigns/:id/xp` è un delta serializzato per attore, registrato anche in modalità milestone; non è un'azione di scena e non entra nell'undo
- il level-up è idempotente per `actorId + livello di destinazione`: un retry dopo un timeout non aggiunge due volte privilegi o slot
- `requestId` idempotente **in memoria** per 30 s su `rolls` (entrambi gli endpoint) e su `chat`; dopo un riavvio è possibile un duplicato, rischio accettato (D45)
- l'import **non** è idempotente: ogni import crea id nuovi, per scelta (mai sovrascrittura). Il client avvisa prima di eseguirlo
- il documento resta full-state in scrittura solo per recovery; il percorso normale sono azioni puntuali, che non hanno il problema dei 1 MB (18, voce 1)

### 12.7 Rate limit

| Ambito | Limite | Note |
|---|---|---|
| globale per IP | 300/min | esclusi `/uploads/*` |
| `POST /auth/dm` | 5/min per IP | brute force sulla password |
| `GET /api/v1/displays/:code/state` | 30/min per IP | enumerazione dei codici |
| `/play/*` | 60/min per token | + 20/min per IP |
| `POST /play/:token/rolls` | 20/min e 1/300 ms | oltre → `429`, nessun broadcast |
| `POST /campaigns/:id/chat` | 10/min | costo API IA |
| upload | 20/min | + limite dimensione |
| import | 2/min | operazione pesante |
| `GET /srd/*` | 120/min per IP | cataloghi statici, cache `immutable` per versione |
| `POST /actors/preview` e `level-up/preview` | 30/min | validazione build, nessuna scrittura |
| `POST /actors/:id/level-up` | 10/min | transazione con snapshot e token |
| `POST /campaigns/:id/rest` | 20/min | una dichiarazione per riposo, non un loop |

### 12.8 Limiti di payload

- JSON generico 2 MB (tranne `/campaigns/import`, 100 MB); `SceneState` hard cap 1 MB, senza compressione nell'MVP; fog 2.000 op
- `ActorStatblock` e payload di creazione/level-up: hard cap **512 KB**; lo snapshot contiene solo privilegi, incantesimi e oggetti scelti, non l'intero SRD
- le risposte SRD sono immutabili per versione e possono essere compresse dal reverse proxy; non contano nel limite delle scene
- upload immagine 20 MB, lato massimo 8.000 px; export e import 100 MB
- import: massimo 20.000 entità totali, 5.000 scene, 10.000 attori
- messaggio WS 64 KB: oltre, il server chiude con `1009`
- `MAX_JSON_MB` e `MAX_UPLOAD_MB` configurabili, ma i limiti di fog e scena sono nel codice perché legati al rendering

### 12.9 Protocollo WebSocket

Envelope unico per tutte le direzioni:

```ts
interface WsMessage<T = unknown> {
  v: 1;                 // versione del protocollo
  type: WsType;
  id?: string;          // id del messaggio, per correlare la risposta
  replyTo?: string;     // id della richiesta a cui si risponde
  seq: number;          // monotono per canale (campagna), assegnato dal server
  at: string;           // ISO 8601
  payload: T;
}
```

- `hello` è sempre il primo messaggio del server: contiene `role`, `seq` corrente e lo **snapshot completo** (`DisplayState`, `SceneState` o `PlayerSheetView`)
- se il client riceve un `seq` con buco, chiude e si riconnette: nessun tentativo di ricostruzione incrementale
- heartbeat: `ping` client ogni 25 s, `pong` server; due `pong` mancanti → riconnessione con backoff esponenziale (1 s → 30 s, jitter)
- il server coalesce `program.viewport` e `program.pointer`: tiene solo l'ultimo per frame, non accoda
- tipo sconosciuto → `error` con `code: 'unknown_type'`, la connessione resta aperta
- errori di handshake → chiusura `4401` (credenziale), `4403` (revocata/ruolo), `4408` (timeout), `1009` (troppo grande)
- `Origin` obbligatorio per i browser e confrontato con `ALLOWED_ORIGINS`; un mismatch chiude con `4403`

Catalogo messaggi:

| Direzione | `type` | Payload |
|---|---|---|
| client → server | `action.send` | `GameAction` (solo DM; i player usano REST) |
| client → server | `action.undo` | `{ actionId }` (DM: "fino a qui") |
| client → server | `program.viewport` | `{ layerId, x, y, zoom, cameraLocked }` |
| client → server | `program.pointer` | `{ x, y, visible }` |
| client → server | `program.take` | `{ composition: ProgramComposition, confirmPublish?: boolean }` — composizione atomica; conferma se un layer è riservato |
| client → server | `program.blackout` | `{ on }` |
| client → server | `roll.request` | `{ formula, mode, tokenId?, visibility?, requestId }` |
| client → server | `ping` | `{ }` |
| server → client | `action.applied` | `{ actionId, sceneId, stateVersion, action: GameAction, label }` — solo console DM |
| server → client | `action.pending` | `{ pending: PendingActionView }` (DM: tutte; player: solo le proprie) |
| server → client | `action.pending.removed` | `{ actionId, reason: 'approved' \| 'rejected' \| 'withdrawn' \| 'stale' }` |
| server → client | `action.undone` | `{ actionIds, sceneId, stateVersion, actions: GameAction[], label, notifyOnly: true }` — solo DM; inverse canoniche in ordine |
| server → client | `program.updated` | `ProgramState` + `version` — solo console DM |
| server → client | `display.updated` | `{ campaignId, sceneVersion?, changes: DisplayDelta[] }` — delta filtrati server-side per schermo A |
| server → client | `state.updated` | `{ sceneId, stateVersion, state }` — solo console DM, recovery e import |
| server → client | `dice.roll` | `DiceRoll` |
| server → client | `rolls.mute.updated` | `{ mutedUntil: string \| null }` — DM e player della campagna, non persistito; mai display |
| server → client | `display.presence` | `{ displays: [{ id, label, latencyMs, state }] }` |
| server → client | `player.sheet.updated` | `{ actorId, view: PlayerSheetView, version }` |
| server → client | `actor.sheet.updated` | `{ actorId, view: DmSheetView, sheetVersion }` — solo console DM della campagna |
| server → client | `actor.leveled` | `{ actorId, level, xp, xpNext, view: DmSheetView }` — console DM; il player riceve `player.sheet.updated` |
| server → client | `rest.applied` | `{ actorIds, type: 'short' \| 'long', sheetVersion }` — DM e player coinvolti |
| server → client | `sheet.updated` | `{ actorId, editingEnabled, fieldPolicies, version }` |
| server → client | `campaign.settings.updated` | `{ campaignId, autoApprove, advancementMode }` — broadcast alle console DM della campagna |
| server → client | `toast` | `{ level: 'info' \| 'warn', message }` — notifica leggera, non bloccante |
| server → client | `pong` | `{ }` |
| server → client | `error` | `{ code, message, replyTo? }` |

- il client non può inviare `state.updated`: la scena si scrive solo con azioni (o recovery)
- `action.send` dal DM applica subito come il POST; se il socket non è disponibile il client usa il REST, stesso contratto
- `action.applied` e `action.undone` non vanno allo schermo A: solo i client DM ricevono azioni grezze; il display riceve `display.updated` con delta filtrati server-side (D16)
- `display.updated` omette token/loot che non erano e non sono nella proiezione visibile; ogni delta porta `layerId`, emette `token.remove`/`loot.remove` se un'entità prima visibile viene coperta o nascosta e `upsert` solo se il server ne consente la proiezione
- dopo recovery/import il server può inviare `snapshot.replace` dentro `display.updated`, contenente solo il nuovo `DisplayState` filtrato, mai il `SceneState` completo
- `toast` non va allo schermo A: il display aggiorna il canvas senza interrompere la proiezione
- `roll.request` esiste per la latenza; il server lo tratta esattamente come il POST (stessa validazione, stesso rate limit)

### 12.10 Versioning

- `/api/v1` è stabile: si aggiungono campi e endpoint, non si rimuovono né si cambia semantica
- breaking change → `/api/v2` con `/v1` mantenuto per una release
- `WsMessage.v` permette di far convivere client vecchi e nuovi; il server rifiuta `v` sconosciuta con `error`
- `schemaVersion` dell'export è indipendente dalla versione API

Note:
- il canale display non espone `state` completo: solo il `DisplayState` del program in onda (D16)
- `program.viewport` passa dal socket e viene persistito con debounce; gli altri cambi di program usano `PUT`
- il polling di fallback usa lo stesso schema dello snapshot WS: un solo contratto
- `PUT /scenes/:id/state` è solo recovery/import; l'autosave per documento non esiste più nel flusso normale
- il WS non salva `SceneState`: le azioni sono applicate dal server (`ActionService`), i comandi `program.viewport` sono persistiti con debounce
- le pending vivono in memoria: un `hello` dopo il riavvio del server non le contiene, e il client lo segnala all'attore

## 13. Configurazione

`.env.example`:

```dotenv
NODE_ENV=development
HOST=127.0.0.1                    # HOST non-loopback o reverse proxy richiedono DM_PASSWORD
PORT=3000
PUBLIC_URL=http://localhost:3000  # base per display, QR e cookie
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:3000

DM_PASSWORD=                      # obbligatoria se HOST non-loopback o dietro reverse proxy
SESSION_SECRET=                   # vuota → generata in data/.session-secret
COOKIE_SECURE=auto                # auto | true | false

DATABASE_PATH=data/dnd.db
UPLOAD_DIR=data/uploads
CLIENT_DIST=client/dist/browser   # solo produzione: build statica servita da Fastify
MAX_UPLOAD_MB=20
MAX_EXPORT_MB=100
MAX_IMPORT_MB=100
MAX_JSON_MB=2
LOG_LEVEL=info
WS_PING_INTERVAL_MS=25000

# Fase 9, opzionale
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

Regole:

- le env sono validate con Zod **all'avvio**; se manca qualcosa il processo esce con l'elenco dei campi invalidi, non parte a metà
- i path relativi (`DATABASE_PATH`, `UPLOAD_DIR`, `CLIENT_DIST`) sono risolti rispetto alla **radice del repo**, non alla cwd del processo: `npm run dev -w` e `node server/dist/index.js` funzionano senza cambiare `.env`
- `HOST=0.0.0.0` o `PUBLIC_URL` non-loopback senza `DM_PASSWORD` è un errore fatale: non esiste una modalità "LAN aperta"; un proxy richiede sempre password
- `SESSION_SECRET` assente → generata 256 bit e salvata in `data/.session-secret` con permessi ristretti; se il file cambia, tutte le sessioni DM decadono
- `COOKIE_SECURE=auto` → `true` se `PUBLIC_URL` è `https`, altrimenti `false`; forzare `true` su HTTP rende il cookie inutilizzabile e il DM non riesce ad accedere
- `PUBLIC_URL` è ciò che rende raggiungibile lo schermo A e il QR da un secondo dispositivo: se resta `localhost`, funzionano solo sulla stessa macchina
- `ALLOWED_ORIGINS` è una lista, non un valore singolo: in dev contiene client e server, in produzione solo `PUBLIC_URL`
- le directory `data/` e `data/uploads/*` vengono create all'avvio se assenti
- nessuna env è esposta al client: il client conosce solo `PUBLIC_URL` attraverso l'URL con cui è stato servito

## 14. Sicurezza

### 14.1 Modello di minaccia

Assunzioni: il DM è fidato, la macchina è sua, la rete è una LAN domestica. Non c'è esposizione su internet e non ci sono account.

| Minaccia | Superficie | Mitigazione |
|---|---|---|
| Un dispositivo in LAN apre la console e comanda la partita | `/dm` | password DM + cookie; loopback esente |
| Un sito web malevolo chiama `localhost` (CSRF, DNS rebinding) | API DM su loopback | `SameSite=Strict`, controllo `Origin`, allowlist `Host` |
| Link giocatore inoltrato o screenshot del QR | `/play/:token` | token hashato, revoca, rotazione, scope su un attore, `noindex` |
| Giocatore curioso apre i devtools | WS/REST | payload per ruolo, nessun dato nascosto nel `DisplayState` |
| Upload manipolato (polyglot, EXIF, SVG) | `POST /assets` | magic bytes, re-encode `sharp`, niente SVG, limiti di pixel |
| XSS via markdown o chat IA | note, messaggi, testi in onda | sanitizzazione, CSP, niente `innerHTML` non filtrato |
| Brute force del codice display | `/display/:code` | 6 caratteri base32 a 30/min per IP + PIN opzionale |
| DoS locale o raffica di tiri | API/WS | rate limit per IP, token e operazione |
| Token o cookie nei log | log applicativi | redaction di header, cookie e path `/play/*` |

### 14.2 Accesso alla console DM

- **loopback fidato**: solo connessione diretta con peer socket `127.0.0.1`/`::1`, `Host` localhost/loopback e nessun header `Forwarded`/`X-Forwarded-*`; è il caso normale del DM su `http://localhost:3000`
- **LAN o reverse proxy con password**: `HOST=0.0.0.0` o deployment dietro proxy richiedono `DM_PASSWORD`; `POST /auth/dm` imposta un cookie firmato HMAC, `HttpOnly`, `SameSite=Strict`, `Secure` quando `PUBLIC_URL` è HTTPS
- sessione stateless con TTL 30 giorni; logout cancella il cookie; cambiare `SESSION_SECRET` revoca tutto
- `GET /auth/me` serve al client per mostrare la modale di accesso solo quando serve, invece di un 401 silenzioso
- il ruolo è **derivato dalla credenziale**, mai da un header o da un campo del body
- display e player non possono escalare: il loro massimo è leggere la propria proiezione

### 14.3 CSRF, DNS rebinding e header

- `SameSite=Strict` sul cookie DM + verifica `Origin` su ogni metodo non `GET`; `Origin` assente è accettato solo da client non-browser su loopback
- allowlist `Host`: `localhost`, `127.0.0.1`, `[::1]`, host di `PUBLIC_URL`; un `Host` diverso → `421 Misdirected Request`
- `trustProxy` Fastify resta `false`; la presenza di `Forwarded` o qualunque `X-Forwarded-*` disabilita il bypass loopback. Non ci si fida di IP/Host inoltrati e non c'è `TRUST_PROXY`
- CORS disabilitato in produzione (same-origin); in dev solo `ALLOWED_ORIGINS`, niente wildcard, `credentials: true`
- header di risposta:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'nonce-<N>'; style-src-attr 'none'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: same-origin`, e `no-referrer` specifico su `/play/*`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Cache-Control: no-store` su tutte le risposte API; `immutable` solo su `/uploads/:hash/*`
- **niente `unsafe-inline`**: `style-src` autorizza solo i fogli esterni e gli `<style>` runtime marcati con nonce; `style-src-attr 'none'` vieta gli attributi `style` nel markup
- il nonce è generato dal server per ogni risposta a `index.html` (128 bit, base64) e iniettato sia nell'header sia in `<html ngCspNonce="…">`; `index.html` è servito `no-store`, quindi un nonce non viene mai riusato. Angular lo legge da `ngCspNonce` (o dal token `CSP_NONCE`), come da documentazione ufficiale
- in produzione il fallback SPA di Fastify legge `index.html`, sostituisce un placeholder `__CSP_NONCE__` e risponde con header e attributo coerenti; gli asset statici restano serviti da `@fastify/static`. In dev il server Angular usa un nonce fisso **solo in sviluppo**, con la stessa policy: la generazione per richiesta è verificata in E2E sulla build di produzione
- i CSS dei componenti restano **fogli esterni**: build con critical CSS inline disattivato (`optimization.styles.inlineCritical: false`), così `style-src 'self'` li copre e il nonce serve solo agli stili runtime del framework
- niente `style="…"` nei template e niente `setAttribute('style', …)`. Posizioni e dimensioni dinamiche (frame dei layer, progress, coordinate) passano da **CSSOM** (`el.style.setProperty`) o da CSS custom properties: CSP non blocca le modifiche via CSSOM
- Konva imposta gli stili del container e dei canvas via CSSOM: se una versione usasse `setAttribute('style', …)`, il test E2E CSP fallisce e va aggiornato il wrapper, non allentata la policy
- il tema iniziale è applicato da uno script **esterno** `theme-init.js` in `<head>` (letto `localStorage`, scritto `data-theme`), non da uno script inline: evita il flash senza indebolire `script-src`
- il test E2E raccoglie `securitypolicyviolation` e fallisce su qualunque violazione, su console, display e `/play/*`

### 14.4 Isolamento dei dati

| Ruolo | Può leggere | Può scrivere |
|---|---|---|
| DM | tutto, tranne `player_notes` | campagne, scene, program, attori, schede, level-up, riposi, XP, oggetti, `dm_notes` |
| Display | solo `DisplayState`, filtrato per `visible` e fog | niente |
| Player | solo `PlayerSheetView` del proprio attore, con `playerNotes` | campi `approval` auto-approvati secondo policy/cooldown o in pending, campi `notify`/`private` diretti, tiri |
| Anonimo | `/health`, login DM, cataloghi SRD, asset statici per hash | niente |

- `PublicActorView` non contiene né `dmNotes` né `playerNotes`
- `DmActorView` e `DmSheetView` contengono `dmNotes`, mai `playerNotes` (D26); lo snapshot non contiene note
- il `DmSheetView` include i derivati e lo stato di avanzamento, ma non `playerNotes` né il contenuto delle note private
- un attore di un'altra campagna e un id inesistente danno lo stesso `404`
- il canale `player` è una vista separata, non un filtro del canale display: non esiste un percorso per cui riceva `SceneState` o `ProgramState`
- il giocatore **non scrive mai** `SceneState`: invia azioni limitate al proprio attore, che il server auto-approva secondo policy/cooldown oppure mette in pending; token, iniziativa, fog, griglia e disegni non sono nemmeno proponibili
- `editingEnabled` è una porta prima della whitelist: spenta, ogni `POST`/`PATCH`/`DELETE` del canale player è `403`, anche per un campo in `editable`
- l'undo è riservato al DM: nessun endpoint del canale player accetta un id di `action_log`

### 14.5 Upload

- whitelist MIME: `image/png`, `image/jpeg`, `image/webp`; **niente SVG**
- verifica dei magic bytes, non solo dell'estensione o del `Content-Type`
- `sharp` decodifica e **ri-encoda** sempre: EXIF e payload incastonati spariscono
- nome file generato dal server (hash + uuid), mai dal client
- path risolti e verificati dentro `UPLOAD_DIR` (no path traversal, no symlink seguiti)
- limiti: 20 MB per file, 8000 px per lato, budget di pixel per immagine decodificata
- `assets` dedup su SHA-256; gli orfani si puliscono con job manuale o schedulato
- asset referenziato → `DELETE` risponde `409 asset_in_use`

### 14.6 Segreti, log e dipendenze

- `.env`, `data/` e `data/.session-secret` sono gitignored; nessun segreto in `shared` né nel bundle client
- la chiave IA resta server-side; il client non la vede mai, nemmeno in errore
- log strutturati con `requestId`, senza body completi; redaction di `Cookie`, `Authorization`, `pin` e del segmento token in `/play/:token/*`
- stack trace solo nei log, mai nel body HTTP
- `npm audit` in CI come segnalazione, non come blocco: le patch di Angular hanno priorità
- l'export JSON è un file del DM e contiene entrambe le note solo con `includePrivateNotes` esplicito: va trattato come dato sensibile (11.7)

### 14.7 Link giocatore (D21, D22)

- token casuale a 256 bit in base64url, salvato **solo** come hash SHA-256: il valore in chiaro esiste nell'URL e nel QR, mai nel database
- il link è per **un solo attore**: `GET /play/:token/sheet` risolve sempre e solo quell'attore, nessun id nel body
- 404 (non 403) per attori diversi dal proprio: non si rivela nemmeno l'esistenza di altre schede
- 403 esplicito se il campo non è in `editable`; la whitelist è applicata al server
- 403 `editing_disabled` se la matita è spenta: la porta è chiusa prima di guardare il campo, e vale anche per `playerNotes`
- revoca immediata: `revoked_at` controllato a ogni richiesta **e** a ogni messaggio WS `player`
- rotazione = nuovo link, il vecchio smette di funzionare subito
- rate limit per token e per IP; `Referrer-Policy: no-referrer` e `noindex` sulla pagina
- `editable` validato come enum: un campo non previsto è rifiutato
- HP con delta in azione `approval`: se auto-approvata o approvata dal DM, il server aggiorna `actors` e token nella stessa transazione, con `clamp(0, max)`. Il telefono non scrive mai HP in modo diretto

### 14.8 Dadi dal telefono (D25)

- il server ignora `visibility`, `origin` e `actorId` inviati dal client: li forza a `public`, `player` e all'attore del link
- formula validata dal parser: `NdX` con `+`/`-`, `kh`/`kl`, max 100 dadi, lati 2-1000, 100 caratteri; altro → `400`
- risultato calcolato solo server-side con `crypto`; il client non può proporre valori
- `requestId` idempotente in memoria per 30 s: un retry normale non produce due tiri; dopo riavvio è possibile un duplicato (D45)
- rate limit 1/300 ms e 20/min per token, `429` senza broadcast
- mute temporaneo attivo → `403 rolls_muted` con `mutedUntil`; nessun risultato né riga in `dice_rolls`; alla scadenza i tiri riprendono senza riaprire il link
- il tiro non modifica la scena: nessun bump di `state_version`, nessuna azione, nessun conflitto con l'editing

### 14.9 LAN e HTTPS

- su HTTP in LAN il cookie funziona (`Secure=false`) ma il secure context manca: niente Wake Lock, alcune API mobile limitate
- HTTPS è opzionale e non implementato dall'app: per Wake Lock e API mobile complete si documenta Caddy come reverse proxy locale; niente gestione di certificati self-signed nell'MVP
- **mai** port forwarding o esposizione su internet: l'app non è progettata per hostili
- se il telefono non raggiunge il server, il problema è `PUBLIC_URL` o la subnet, non l'autenticazione: la UI deve dirlo esplicitamente

## 15. Testing e qualità

- **Metodo TDD (D55)**: nessuna logica di produzione senza un test che la descriva; ciclo red → green → refactor. Ogni bug parte da un test di regressione. La suite è il contratto del sistema, non un controllo fatto a posteriori.
- **Unit (Vitest, `shared`)**: griglia, distanze, snap, modificatori, normalizzazione statblock, parser dadi e determinismo del roller con seed, **geometria della fog** (`isPointRevealed` con base, reveal/hide sovrapposti, rect, poligoni concavi, distanza dal segmento). È il codice più a rischio di regressione: copertura alta richiesta.
- **Unit/API (Vitest + `app.inject`)**: CRUD, validazione Zod, **pipeline delle azioni** (applica, inverso, `state_version`, idempotenza per `id`), coda pending (approva, rifiuta, ritira, bersaglio sparito → `409 action_stale`), recovery `PUT /scenes/:id/state` con `state_version` stale, cascade, proiezione `DisplayState`/`DisplayDelta` (i token nascosti non compaiono né nei payload snapshot né nei delta; mai inoltrato il `GameAction` grezzo allo schermo A).
- **API action history/undo**: 51ª azione → la più vecchia viene eliminata dalla history; un id non più presente dà `409 action_not_undoable`; `undo-to` su una riga annulla quella e le successive in un'unica transazione; `redo` funziona finché non arriva una nuova azione; le azioni `notify`/`private` non compaiono nella history; dopo un riavvio del processo restano le ultime 50, la coda pending no.
- **API action history retention**: dopo ogni applicazione, righe e inversi oltre le 50 vengono eliminati; non esiste audit più vecchio né API per recuperarlo.
- **API pending**: nessun TTL automatico; richieste vecchie restano in attesa finché un partecipante non decide. Approvazione/rifiuto in blocco ammette solo azioni dello stesso attore e mantiene l'ordine.
- **E2E (Playwright)**: crea campagna → crea attore → crea scena → carica mappa → aggiungi token via azione → iniziativa → reload e verifica dello snapshot server.
- **E2E console**: database vuoto → modale di creazione → ingresso diretto in console; con due campagne la scelta resta obbligatoria; drag slot → mappa; drag mostro dal DB due volte → due token distinti; fog nuova scena coerente con `campaigns.fog_default`; `Camera Live` muove la proiezione, `Libera` no.
- **E2E fog**: pennello che rivela una stanza → reload → la maschera è identica; Ctrl+Z (action history del server) ripristina lo stesso pixel; "Rivela tutto" svuota le op; un token al centro di un'area coperta **non** compare nel payload dello schermo A, uno in area rivelata sì; rettangolo e lasso producono una sola op ciascuno.
- **Benchmark fog (non bloccante in CI)**: 4k, 2.000 op, rebuild completo < 150 ms e commit incrementale < 16 ms su macchina di riferimento.
- **E2E doppio schermo (Playwright, due `browserContext`)**: console DM + display appaiato; `TAKE` manda in onda PVW; un contenuto non marcato va in onda senza modale aggiuntiva; `confirmBeforeTake` fa chiedere conferma su `TAKE`/`CUT`/`DIRECT`, e annullando il PGM resta invariato; il PGM riflette lo schermo A; trascinare un token sul monitor PGM lo muove anche sullo schermo A; token/loot nascosti non compaiono nel payload o nei delta; `blackout` copre lo schermo A; alla riconnessione lo stato è completo
- **E2E apertura finestra**: il pulsante apre il display con `window.open`; con permesso Window Management concesso sceglie il monitor; negando/non supportando il permesso usa il fallback e il DM può spostare la finestra; la stessa URL aperta in un contesto senza `opener` si comporta identico (nessuna dipendenza da `postMessage`)
- **API auto-approvazione**: default attivo; prima azione valida di un attore auto-approvata; seconda entro 10 s pending; attore diverso non bloccato; dopo pending per lo stesso attore anche le successive restano pending finché il DM non risolve la sequenza; due richieste concorrenti dello stesso attore producono al massimo una auto-approvazione; retry dello stesso id non duplica e non resetta il timer; toggle off manda tutte le nuove azioni in pending, toggle on riattiva la policy
- **E2E snapshot**: `GET /scenes/:id/snapshot` con ETag invariato → `304`; `?force=true` restituisce tutto; il pulsante "Riallinea stato" sostituisce lo stato locale; refresh automatico parte al centesimo evento applicato o dopo 5 minuti, il primo dei due
- **E2E scheda giocatore (Playwright, viewport mobile)**: "Condividi scheda" → QR visibile → apertura di `/play/:token` in un secondo contesto → tab Combattimento/Abilità/Magia/Oggetti/Note/Tiri; prima modifica di HP auto-approvata compare sulla mappa; seconda modifica entro 10 s compare come **pending**, il DM la approva dal dock `Azioni` → HP e token si aggiornano insieme entro 200 ms; toggle auto-approvazione off rende pending tutte le modifiche successive; con la matita spenta un `PATCH` diretto restituisce `403 editing_disabled`; slot spesi, risorse e dadi vita si aggiornano con notifica e non entrano nella history; dopo un riposo lungo dichiarato dal DM il telefono mostra HP pieni, dadi vita ripristinati e slot ricaricati; death saves editabili secondo policy; `playerNotes` resta dopo il reload del telefono, non compare in console e non produce notifiche; un campo non editabile è disabilitato e un `PATCH` diretto restituisce `403`
- **E2E undo**: due console DM aperte; una muove un token, l'altra preme "Annulla fino a qui" → entrambe convergono sullo stesso stato, il telefono riceve un toast e lo schermo A ridisegna senza toast; dopo un reload della console l'azione è ancora annullabile; alla 51ª azione la più vecchia sparisce dalla history e non è più recuperabile
- **E2E dadi dal telefono**: il giocatore tira `1d20+5` → il risultato compare sulla vista main del DM e sullo schermo A con il nome del personaggio; con `hud.dice` spento resta visibile almeno sulla console; il tiro finisce nel `Log dadi` con badge `giocatore`
- **API loot scena**: `loot.add/move/update/remove` persistono in `SceneState.loot[]`, sono annullabili via action history, non creano `TokenState`/`Actor`; il display riceve solo loot visibili e con centro scoperto; import/export conserva id e riferimenti `itemId`
- **API mute tiri**: le durate ammesse sono 30/60/300/600/1800/3600 s; durante il timer player endpoint e `roll.request` rispondono `403 rolls_muted` senza scrivere un tiro; la scadenza broadcasta `mutedUntil: null`; il mute non sopravvive al riavvio
- **API permessi giocatore**: token valido su un attore → `404` per qualsiasi altro attore; token revocato → `401` immediato anche a WS aperto; token ruotato → il vecchio link non risolve più
- **API autenticazione DM**: loopback senza cookie → `200`; IP non loopback senza cookie → `401`; login corretto → cookie `HttpOnly`; `Origin` mismatch su `POST` → `403`; `Host` non in allowlist → `421`; superato il rate limit del login → `429`
- **API errori e paginazione**: ogni errore ha `{ code, message, requestId }`; il cursore restituisce la pagina successiva senza duplicati; `limit > 200` → `400`
- **API isolamento note**: `playerNotes` presente e `dmNotes` assente in `/play/:token/sheet`; `dmNotes` presente e `playerNotes` assente in `GET /actors/:id` e `GET /actors/:id/sheet`; entrambe assenti in `PublicActorView`; `dmNotes` non scrivibile dal canale `player` e `playerNotes` non scrivibile dalla console
- **API dadi**: `visibility: 'dm'` inviato dal telefono viene forzato a `public`; formula fuori limite → `400`; due richieste con lo stesso `requestId` producono un solo tiro; il rate limit restituisce `429`
- **API delta HP**: il DM e il giocatore mandano due azioni concorrenti; il server le serializza e la somma algebrica è quella attesa, senza lost update; il clamp a `0..max` è verificato
- **Unit build (`shared`)**: point buy 27, standard array, 4d6kh3 con seed, limiti dell'inserimento manuale, aumenti del background, slot ASI/talento, numero di competenze di classe, incantesimi conosciuti/preparati, sottoclasse al livello 3, budget; ogni caso invalido restituisce un errore associato allo step giusto; valori di `rollId` manomessi dal client vengono ignorati
- **API tiro caratteristiche**: `roll-stats` restituisce `rollId` e sei valori; creazione con `rollId` usa i valori del server; `rollId` scaduto → `409 roll_expired`; un body con valori diversi dal `rollId` non li sostituisce
- **Unit derivati**: bonus di competenza 1–20, TS e abilità con competenza/expertise, CA con armatura/scudo/cap DES, CD e attacco incantesimi, attacchi dall'equipaggiamento, percezione passiva, capacità di carico; un override vince sul calcolo e "ripristina" torna al valore derivato
- **API creazione PC**: build valida → attore, inventario, risorse e snapshot creati in una transazione; `pc` senza `campaign_id` → `422`; `statblock.kind` diverso da `actors.kind` → `422`; budget superato → `422 insufficient_funds`; errore a metà → nessun attore orfano; livello iniziale 1 e 5 producono scelte equivalenti a una sequenza di level-up
- **API level-up**: preview senza scritture; applicazione incrementa livello, HP, slot, risorse e snapshot; `sheetVersion` stale → `409`; retry dello stesso livello non duplica; in milestone con XP sotto soglia gli XP si allineano al minimo del nuovo livello; a livello 20 → `409 level_up_unavailable`; il token in scena riceve HP/condizioni aggiornati
- **API riposi**: breve ricarica solo pact slot e risorse `short`, senza HP; lungo recupera tutti gli HP e tutti i dadi vita, riduce l'exhaustion di 1, azzera i death saves e ricarica tutti gli slot/risorse; le altre condizioni restano manuali; un player che chiama l'endpoint → `403`; broadcast `rest.applied` solo ai coinvolti
- **API XP**: il delta è registrato in milestone e in XP; in XP la soglia sblocca ma non applica il livello; in milestone il DM può salire sotto soglia e gli XP si allineano solo se più bassi; valori negativi non scendono sotto 0
- **API SRD**: `GET /srd/:version/*` è immutabile e cacheable; una versione sconosciuta → `404 srd_version_unknown`; `meta` dichiara versione e licenza; il client non richiede il catalogo intero quando la scheda ha già lo snapshot; un level-up su una scheda con `rulesVersion` assente dal server → `404` esplicito, nessuna scrittura
- **E2E wizard PC**: 7 step con livello iniziale 5 → specie, background, classe, sottoclasse, caratteristiche, talenti, equipaggiamento, incantesimi, riepilogo → salvataggio → scheda aperta con HP/CA/TS/CD coerenti; bozza recuperata dopo un reload; uscita con conferma; errore server mostrato nello step corretto
- **E2E scheda console**: tab Combattimento/Abilità/Incantesimi/Equipaggiamento/Privilegi/Note; slot speso e risorsa usata persistono al reload; `sheetVersion` stale mostra "modificato altrove" senza sovrascrivere; `playerNotes` non è visibile, solo il badge; level-up e riposo aggiornano la scheda e il token
- **E2E snapshot SRD**: una fixture con due versioni del catalogo crea un personaggio sulla vecchia; cambiando la versione corrente la scheda resta identica; il level-up usa ancora la versione fissata; un export/import conserva snapshot e `rulesVersion`
- **API export/import**: export → import su database vuoto ricrea la campagna con id nuovi e riferimenti coerenti (token, program, inventari); un secondo import crea una seconda campagna, non un merge; `includePrivateNotes=false` non contiene `playerNotes`, `true` sì; il file non contiene mai `player_links` né `displays`; import slim con asset mancante → `422` e rollback; hash alterato → `422`; ogni fixture `schemaVersion` passata migra alla corrente; file oltre i limiti di entità → `413`
- **Component test (`TestBed`) sui wrapper nativi**: comportamento, focus trap, ARIA, tastiera e stato disabilitato per `app-button`, `app-dialog`, `app-popover`, `app-table`, `app-toast`; wizard, tabella libreria, overlay dadi e scheda `/play/*` (campi editabili vs sola lettura).
- **Unit tema**: `ThemeService` con preferenza `light`/`dark`/`system`; `system` segue `prefers-color-scheme` (mock di `matchMedia`), il cambio si riflette su `data-theme`, la scelta sopravvive al reload e un valore invalido in `localStorage` ricade su `system`.
- **E2E tema**: toggle chiaro → scuro → sistema su console, display e `/play/*`; nessun flash del tema sbagliato al reload; i token CSS cambiano davvero (colore di sfondo e bordo), non solo l'attributo.
- **E2E CSP**: su console, display e scheda giocatore nessun evento `securitypolicyviolation`; il nonce cambia a ogni caricamento di `index.html`; un `<style>` senza nonce viene bloccato; un template con `style="…"` fa fallire il test, quindi non entra nel codice.
- **Typecheck** su tutti i workspace in CI, eseguito con `turbo run typecheck` (cache locale ripristinata via `actions/cache`)
- Definition of Done per ogni fase: test scritto prima (o insieme) al codice, typecheck + suite verdi + E2E del flusso toccato + nessun `any` nuovo + una sola responsabilità per modulo + riuso verificato + rispetto delle linee guida 5.11 + aggiornamento di `PLAN.md` se una decisione cambia.

## 16. Roadmap

Legenda: ✅ criteri di accettazione.

### Fase 1 — Setup monorepo
- workspace npm (`client`, `server`, `shared`), ESM ovunque, `tsconfig.base.json` con strict massimo, `.npmrc`, ESLint flat con Stylistic
- `turbo.json` con il task graph completo (`build`, `dev`, `lint`, `typecheck`, `test`, `test:e2e`) e script root via `turbo run`
- scaffold **Angular 22 zoneless** con **Sass**, tema `light | dark | system` e cartella `components/` dei wrapper nativi; niente Angular Material/CDK
- Fastify + `shared` con `tsup` e barrel unico; `index.html` servito con nonce CSP per richiesta
- proxy dev (inclusi WS), `/api/v1/health` con `migration_pending`, CI completa con E2E
- ✅ `npm run dev` avvia i tre workspace via Turbo; `npm run check` e `npm run test:e2e` verdi; una seconda esecuzione di `build` è servita dalla cache; una pagina di prova usa due wrapper nativi (es. `app-button` e `app-dialog`) e commuta i tre temi; la CI passa da un checkout pulito con lockfile e browser Playwright

### Fase 2 — Database, API base, concorrenza
- schema Drizzle, migrazioni, seed
- CRUD campagne, scene, attori con paginazione
- **flusso di avvio**: `/` → `/dm`; shell con skeleton, poi modale di creazione (database vuoto) o di scelta (campagne esistenti ma nessuna `lastCampaignId` valida); con `lastCampaignId` valida si entra diretti
- `lastCampaignId` in `localStorage`, scritta all'ingresso in una campagna e ignorata se l'id non esiste più
- upload con `sharp` (originale, WebP, thumb)
- `action_log` nello schema + `ActionService` con inverse e transazione; `SceneStore` legge e non scrive
- `PUT /scenes/:id/state` solo come recovery/import con `state_version` e `409`
- **accesso DM**: env validate allo startup, `POST /auth/dm` + cookie firmato, loopback fidato, allowlist `Host`, controllo `Origin`, header di sicurezza
- ✅ loopback diretto senza header proxy entra senza password; un loopback con `Forwarded`/`X-Forwarded-*` non ottiene bypass; `HOST=0.0.0.0` o `PUBLIC_URL` non-loopback senza `DM_PASSWORD` non parte; password errata → `401` e rate limit; richiesta cross-origin rifiutata; due console DM inviano azioni concorrenti e entrambe convergono senza `409`; asset caricato e servito in WebP + thumb; con database vuoto la modale di creazione è l'unica strada e dopo la creazione si è già in `/dm/campaigns/:id`; al reload successivo si riapre l'ultima campagna senza modale

### Fase 3a — Cataloghi SRD, modello e derivati
- cataloghi **SRD 5.2** versionati (`classes`, `species`, `backgrounds`, `feats`, `spells`, `items`, `monsters`), endpoint `/srd/:version/*`, licenza CC-BY e crediti in app
- modello `ActorStatblock` a unione discriminata, snapshot dentro `statblock.snapshot`, `deriveSheet()` e `validatePcBuild()` in `shared`
- test di schema sui cataloghi, fixture di due versioni, parità client/server della validazione
- ✅ i cataloghi servono classi/specie/background/talenti/incantesimi/oggetti coerenti; un personaggio fixture conserva lo snapshot dopo un cambio di versione; i derivati coincidono tra shared, API e UI; una build invalida restituisce errori per step

### Fase 3b — Wizard e scheda console
- **wizard PC a 7 step** (livello iniziale 1–20): identità, caratteristiche, competenze/talenti, equipaggiamento, magia, dettagli, riepilogo; bozza locale, errori per step
- **wizard mostro/NPC a 6 step** con gli stessi componenti e import/duplicazione da SRD
- negozio mundano con budget per personaggio precompilato dalla classe, inventario iniziale e monete
- pulsante **Equipaggia automaticamente**: armatura e scudo consentiti, arma primaria e secondaria, focus, attrezzi di classe e sacca entro il budget; l'euristica vive in `shared` ed è coperta da test
- **scheda console full-screen** con tab Combattimento, Abilità, Incantesimi, Equipaggiamento, Privilegi, Note; snapshot e `sheetVersion`
- ✅ un `pc` di livello 5 con specie, background, sottoclasse, talenti, incantesimi ed equipaggiamento è creabile in una sessione, salvato e riaperto senza perdita di dati; un mostro 5e completo è creabile e rileggibile; il negozio non supera il budget e non vende oggetti magici; nessun `pc` senza campagna

### Fase 4 — Scene, griglia e shell della console
- upload mappa, dimensioni, griglia quadrata + esagonale pointy-top `odd-r`
- pipeline tile/LOD per mappe grandi (D48), con benchmark su mappe fino a 8k e fallback a immagine singola
- Konva: pan, zoom, drag & drop con snap, token di dimensione variabile
- misura distanza
- **shell**: barra titolo, sidebar sx/dx (sezioni vuote ma presenti), toolbar azioni, 10 slot, statusbar, pannelli collassabili
- azioni `token.*` via `ActionService`, con `ActionStore` ottimistico e stati `synced`/`pending`/`offline`/`read-only`
- ✅ una mappa 8k usa tile/LOD senza cuciture visibili durante pan/zoom e ritorna al dettaglio pieno al fermarsi; trascinando un token su griglia quadrata e esagonale la posizione salvata è corretta al reload; la misura coincide con il calcolo di `shared`; con due console aperte un token mosso da una compare nell'altra senza `409`

### Fase 5 — Combat, dadi, avanzamento e pannelli
- iniziativa con pareggi, round/turno, HP (incluso temp), condizioni, tiri salvezza morte
- card compatta + scheda completa operativa: slot spesi, risorse, dadi vita, death saves
- **level-up guidato**: preview, scelte di classe, ASI/talento, incantesimi, HP, conferma transazionale
- **avanzamento**: modalità milestone/XP per campagna, XP sempre registrati, soglie SRD, allineamento XP quando il DM sale in milestone
- **riposi**: breve/lungo solo DM, effetti deterministici SRD 5.2; il lungo recupera HP e dadi vita e riduce l'exhaustion, il breve ricarica solo risorse/slot pact
- motore dadi in `shared` + overlay nativo `<dialog>` con quick dice, vantaggio/svantaggio, formula libera
- **tiri eseguiti dal server** + tabelle `dice_rolls` + `POST /campaigns/:id/rolls`, WS `dice.roll`, dock `Log dadi` con badge `dm`/`giocatore`
- **note private per ruolo** `player_notes` / `dm_notes` fin da subito: il mapper non deve imparare tardi a separare i due DTO
- **slot personaggio reali**, sidebar mostri (`In mappa` + `Prossimi` + ricerca DB), regole di drag & drop di 8.9
- dock `Iniziativa` / `Log dadi` / `Azioni` (ultime 50, undo "fino a qui", redo dell'ultimo batch)
- ✅ un incontro di 5 combatte 3 round con stato persistito e ripristinato; un personaggio sale dal livello 4 al 5 con HP, privilegi e slot aggiornati e token coerente; un riposo lungo recupera HP e dadi vita e riduce l'exhaustion, mentre un breve non cura; in XP il livello non avanza senza conferma; in milestone gli XP sotto soglia si allineano; il roller con seed fisso produce sempre la stessa sequenza; un tiro `public` appare nell'overlay e uno `dm` no; trascinare un mostro dal DB crea un token con HP propri e due drag creano due istanze; un danno applicato e poi annullato dal dock `Azioni` riporta HP e token al valore esatto, anche dopo un reload della console

### Fase 6 — Fog of war e disegni
- `FogState` con `base` + `FogOp[]`, strumenti pennello / rettangolo / lasso, reveal e hide, softness
- maschera offscreen a risoluzione limitata (4096), canvas committed + active, commit incrementale
- `isPointRevealed` in `shared` + filtro server-side dei token nel `DisplayState`
- `fog.apply` / `fog.replace` come azioni; undo e redo passano dalla action history del server, non da uno stack locale
- budget 2.000 op con `413` e messaggio esplicito
- `campaigns.fog_default` e dialogo "parti coperta / scoperta" all'upload
- disegni annotativi; export PNG on-demand
- ✅ su una mappa 4k con 2.000 op il rebuild resta sotto i 150 ms, un tratto annullato dal dock `Azioni` torna identico al pixel anche dopo un reload, e un token al centro di un'area coperta non compare nel payload dello schermo A

### Fase 7 — Regia, doppio schermo e realtime (completata)
- `ProgramState` + tabella `programs`, `GET/PUT /campaigns/:id/program` con `version`
- composizione `base + overlays[]` ordinati, frame normalizzato, opacity e `interactive` per layer; in PVW il DM trascina/ridimensiona; overlay click-through di default
- `TAKE` pubblica l'intera composizione atomica; nessuna transizione nell'MVP; un layer `confirmBeforeTake` richiede conferma per `TAKE`/`CUT`/`DIRECT`
- vista main = **PGM** (fog 50%, camera Live/Libera), **PVW** richiamabile per il cambio contenuto, `TAKE`, `CUT`, `blackout`
- contenuti in onda: mappa (scena scelta dal DM + viewport), scheda `pc`/mostro, immagine, testo, iniziativa
- PGM interattivo: drag token, fog, dadi e camera con input riproiettato dalla scala del monitor
- camera via WS con throttle 50 ms, lock/unlock, puntatore laser opzionale
- WS con ruoli `dm`/`display`, snapshot risolto, presence, riconnessione con backoff, polling di fallback
- **WS autenticato**: cookie o codice/token, `Origin` obbligatorio, chiusura `4401`/`4403`, heartbeat e `seq` con resync
- riapertura della finestra A: `window.open` dal pulsante sulla stessa macchina, URL/QR in tutti gli altri casi (D20)
- pairing con codice, QR, PIN opzionale, revoca; `PUBLIC_URL` e `DM_PASSWORD`/`SESSION_SECRET` per il secondo dispositivo
- ✅ con due contesti Playwright: `TAKE` porta l'intera composizione PVW sullo schermo A senza transizione; un layer riservato chiede conferma; drag/resize overlay in PVW non cambia il PGM fino al `TAKE`; overlay click-through lascia interagire con la mappa, `interactive=true` cattura l'input; un token/loot nascosto non compare nei delta; `blackout` copre A; alla riconnessione la composizione è completa; in camera `Live` il pan muove la proiezione, in `Libera` no

### Fase 8 — Schede giocatore, bottino, statistiche ed export (completata)
- **schede giocatore**: `/play/:token`, QR + link revocabile/ruotabile, `editable` per campo, WS `player`; tab Combattimento/Abilità/Magia/Oggetti/Note/Tiri con header sticky, snapshot e valori derivati già presenti in Fase 3b
- **matita sullo slot** (`editingEnabled=true` di default) e policy per campo; `autoApprove=true` di default, cooldown di 10 s per attore e toggle DM per mettere ogni azione in pending; HP/condizioni auto-approvate o pending, monete/equipaggiamento/inventario diretti con notifica, note private silenziose
- **coda di approvazione in memoria**: dock `Azioni` con badge e anzianità, approva/rifiuta singolo o in blocco solo per lo stesso attore e in ordine, ritiro dal telefono; nessuna scadenza automatica
- **note del giocatore e del master separate**, tiri dal telefono con risultato in console e sullo schermo A
- catalogo oggetti (`items`) + inventari per i `pc` già in Fase 3b; qui il dock `Bottino`, il loot di scena e la card oggetto in onda
- sessioni: start/stop, durate, card "dati base" e dialog "dettagli campagna"
- export/import JSON per campagna: `schemaVersion` con migrazioni da tutte le versioni passate, asset embedded di default e variante slim, note dei giocatori solo con flag esplicito, import sempre come nuova campagna
- ✅ il QR apre la propria scheda su viewport mobile; prima azione di HP auto-approvata, seconda entro 10 s pending e approvabile dal DM; toggle off rende pending tutte le nuove azioni; con la matita spenta un `PATCH` dà `403 editing_disabled`; una moneta d'oro si salva subito con notifica e non entra nella history; inventario permissivo, un oggetto assegnato male viene restituito al DM; `playerNotes` sopravvive al reload del telefono senza comparire in console, `dmNotes` non compare mai nel payload del telefono; il token di un altro attore dà `404`; un tiro chiesto dal telefono compare sulla vista main e sullo schermo A con il nome del personaggio; export → import su database vuoto ricrea la campagna con id nuovi e mappe funzionanti; senza `includePrivateNotes` il file non contiene le note dei giocatori; un file con `schemaVersion` vecchia viene importato tramite migrazione; trascinare un oggetto su uno slot personaggio lo ritrova nell'inventario dopo il reload

### Fase 9 — IA: chat e parser (opzionale, implementata con fallback)
- chat della campagna con contesto (ambientazione, scena, token selezionati), streaming SSE, cronologia persistita
- endpoint OpenAI-compatible per l'estrazione di statblock
- fallback regex, revisione manuale nel wizard
- ✅ un testo statblock incollato produce una bozza modificabile; con AI non configurata il fallback regex funziona e la chat mostra un messaggio di funzione disabilitata

### MVP cut line

MVP = **Fasi 1-7**: campagne, libreria, **builder SRD completo**, scheda console operativa, mappa con token, console completa (slot, sidebar, dock iniziativa, toolbar), combat, dadi, avanzamento, level-up, riposi, fog of war e **regia su doppio schermo funzionante**. La regia richiede fog (Fase 6) e realtime (Fase 7), quindi non è tagliabile.

Restano fuori dall'MVP: schede giocatore su telefono, bottino di scena, statistiche di sessione, chat IA, disegni avanzati, coda di approvazione dei giocatori, export/import e parser IA. Il catalogo oggetti e gli inventari dei `pc` **entrano** nell'MVP perché servono al wizard e alla scheda; il negozio vende solo oggetti mundani. La griglia esagonale è in Fase 4 ma può slittare: il modello dati di D10 la supporta già. Le schede giocatore aprono la Fase 8 perché sono la feature più richiesta dopo la regia, ma restano la prima cosa da fare appena l'MVP regge.

L'architettura ad azioni e snapshot (D34–D37) non è tagliabile: nasce in Fase 2 con `action_log` e cresce con le fasi. La coda pending e l'auto-approvazione (D35) sì, perché riguardano solo i giocatori.

## 17. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Mappe molto grandi (8k+) con Konva | FPS bassi, memoria alta | tile/livello a risoluzione ridotta durante pan, limite dimensioni upload |
| `better-sqlite3` sincrono su documenti `state` grandi | richieste bloccanti | limite dimensione `state`, azioni puntuali invece di riscritture, snapshot completo solo a hello/recovery/refresh; undo trasmesso come inverse |
| Fog con molte operazioni | rasterizzazione e JSON lenti | maschera a risoluzione limitata (4096), commit incrementale, semplificazione dei punti, budget 2.000 op con `413` esplicito |
| Token nascosti dalla fog ma presenti nel payload | imboscata visibile nei devtools | filtro geometrico server-side con `isPointRevealed`, stessa funzione di `shared` usata dal client |
| Due console DM che modificano insieme | non c'è più un documento in conflitto, ma due azioni possono sembrare contraddittorie | un solo writer (D34): ogni azione è serializzata dal server; il client si riallinea a `action.applied`, il display è read-only |
| Coda di approvazione che cresce durante il combattimento | il DM approva decine di richieste mentre descrive la scena | `autoApprove` attivo di default, cooldown di 10 s per attore, sequenza pending bloccata in ordine, toggle manuale e approvazione in blocco sul singolo attore; nessun TTL automatico, età visibile; policy `notify` per i dati non-tavolo |
| Auto-approvazione di un'azione durante una sovrapposizione | un secondo danno o cambio arriva prima che il DM abbia visto il primo | una sola auto-approvazione per attore ogni 10 s; se c'è già una pending le successive restano pending; toggle `autoApprove` off per tornare alla decisione manuale |
| Riavvio del server con pending in coda | il giocatore crede di aver agito e l'azione non esiste | la coda è volatile per scelta: al `hello` il client confronta gli id e mostra "richiesta persa, riprova" |
| Undo "fino a qui" su un'azione di un giocatore | il giocatore vede il suo danno sparire senza saperlo | notifica leggera a console e telefoni a ogni undo; lo schermo A ridisegna in silenzio |
| Action history che cresce o si corrompe | undo su un inverso non più valido | ultime 50 per campagna, inverso calcolato dal server, `409 action_not_undoable` invece di un rollback parziale |
| WS instabile o display che si disconnette | schermo A congelato | presence indicator, riconnessione con backoff, snapshot completo al reconnect, polling di fallback |
| Latenza LAN tra console e display | percezione di ritardo | target < 200 ms per il contenuto, 50 ms per la camera via WS; broadcast subito dopo il commit dell'azione, con lo stato già applicato |
| Mandare in onda per errore un contenuto riservato | spoiler ai giocatori | default `TAKE`, flag `confirmBeforeTake` e conferma solo sui contenuti marcati, monitor PVW separato, `blackout` immediato |
| Interazione sul PGM con scala diversa | token che finiscono nella cella sbagliata | conversione coordinate con la stessa matrice del canvas + test E2E su drag |
| Aspect ratio dello schermo A diverso dalla mappa | bande nere o mappa deformata | letterbox con `background`, mai `stretch`, `fit: contain` / `cover` per le immagini |
| `window.open` bloccato da browser o estensione | il DM non riesce ad aprire lo schermo A | fallback con URL e QR sempre visibili; il display non dipende dall'opener (D20) |
| Finestra A minimizzata o coperta: il browser la considera occluded | animazioni e rAF si bloccano | rendering guidato dagli eventi WS, animazioni CSS brevi, indicatore "finestra non visibile" |
| Posizionamento multi-monitor con `left/top` inaffidabile | la finestra si apre sul monitor sbagliato | `Window Management API` se il permesso è concesso, fallback `left/top`, riposizionamento manuale sempre possibile |
| Leak di dati nascosti verso lo schermo A | i giocatori vedono l'imboscata | filtro server-side della `DisplayState` + test automatico sul payload |
| Console troppo densa su monitor singolo (sidebar + dock + slot) | mappa troppo piccola per lavorare | pannelli collassabili con stato ricordato, `FOCUS`, sidebar a larghezza ridotta sotto i 1600 px |
| Testo pensato per il monitor, illeggibile su TV a distanza | i giocatori non leggono nomi e iniziativa | scala tipografica dedicata alla vista display, test su TV reale, niente font sotto i 18 px proiettati |
| Drag ambiguo slot/sidebar/mappa | token duplicati o personaggi spostati per errore | regole di 8.9 con unicità per `actorId` sui `pc` e istanze multiple solo per i mostri |
| Console raggiungibile in LAN o tramite proxy senza password | chiunque comanda la partita | `HOST` o `PUBLIC_URL` non-loopback richiedono `DM_PASSWORD`; header proxy disabilitano sempre il bypass |
| Cookie `Secure` forzato su HTTP in LAN | il DM non riesce ad accedere | `COOKIE_SECURE=auto` derivato da `PUBLIC_URL`, con override esplicito documentato |
| Stili runtime senza nonce bloccati dalla CSP | componenti disegnati male, overlay invisibili | nonce per richiesta, CSS dei componenti esterni, niente attributi `style`, E2E che fallisce su `securitypolicyviolation` |
| Manutenzione dei componenti UI custom | più codice da mantenere rispetto a una libreria esterna | wrapper piccoli e testati, catalogo unico in `components/`, nessuna feature reinventa un nativo |
| Flash del tema sbagliato al primo paint | lampeggio chiaro/scuro all'avvio | `theme-init.js` esterno e sincrono in `<head>` prima dei CSS, default `system`, preferenza solo locale |
| Rate limit scambiato per un guasto durante il combattimento | tiri o salvataggi rifiutati a raffica | limiti per token e non per IP dove possibile, `Retry-After`, messaggio in UI, GET esclusi |
| Link giocatore che circola (screenshot in chat di gruppo) | chiunque apre la scheda di quel `pc` | token hashato e revocabile, rotazione con un click, `noindex`, scope su un solo attore, rate limit |
| Telefono su una subnet diversa o dietro hotspot | il QR non si apre | `PUBLIC_URL` configurabile, messaggio esplicito "il telefono non raggiunge il server", fallback con digitazione manuale del codice |
| Telefono in standby o scheda in background | il giocatore non vede gli aggiornamenti in diretta | riconnessione WS al rientro, snapshot completo, badge "disconnesso" e pull-to-refresh |
| DM e giocatore curano lo stesso personaggio nello stesso istante | HP sbagliati o azzerati | il giocatore propone, il DM applica: delta calcolato in transazione con `clamp(0, max)`, mai PATCH dell'intero attore (D24, D35) |
| Due modifiche contemporanee alla scheda | slot o risorse persi per lost update | `sheetVersion` su ogni `PATCH`, lettura-modifica-scrittura in transazione, `409 sheet_conflict` con refresh; i delta HP restano l'eccezione |
| Scheda del telefono stale dopo un cambio del DM | giocatore vede una versione vecchia | broadcast `player.sheet.updated` a ogni azione applicata e `sheet.updated` quando cambia la matita; le pending sono sempre visibili con il loro stato |
| Matita dimenticata accesa | il giocatore modifica un dato senza che il DM se ne accorga | notifiche per i dati `notify`, badge pending per le azioni non auto-approvate; il DM spegne la matita per bloccare subito ogni scrittura, oppure disattiva `autoApprove` per richiedere conferma |
| Snapshot locale che diverge dopo molte azioni o un evento perso | valori diversi tra console aperte | refresh condizionale ogni 100 azioni applicate o 5 minuti, ETag/304 per evitare trasferimenti inutili, pulsante DM "Riallinea stato" per forzarlo subito |
| `dmNotes` o `playerNotes` serializzati nel DTO sbagliato | una nota privata finisce sotto gli occhi dell'altro ruolo | tre DTO espliciti (display, console, telefono), niente spread dell'entità, test che asserisce l'assenza della chiave in ogni payload |
| Il DM non vede le note del giocatore | il master perde un canale di comunicazione | scelta deliberata (D26); il giocatore parla in chat o a voce; eventuale "condividi nota" esplicito come azione separata |
| Spam di tiri dal telefono | console e schermo A inondati di overlay | rate limit per token, coda lato UI, mute temporaneo dei tiri dei giocatori dalla console |
| Server irraggiungibile mentre il giocatore tira | il tiro non parte e il giocatore crede di averlo fatto | stato "invio in corso" con esito esplicito, retry idempotente su `requestId` finché il processo resta attivo, mai fallback a RNG locale; un riavvio nel mezzo può produrre un duplicato, rischio accettato |
| Tiro del telefono durante una pausa narrativa | interruzione della narrazione | timer mute selezionabile dal DM; le richieste vengono rifiutate con `rolls_muted` senza generare né registrare un dado; il timer scade da solo |
| Wake Lock API richiede secure context | lo schermo A si spegne in LAN su HTTP | HTTP è ammesso nell'MVP; toggle "non dormire" e documentazione Caddy per chi vuole HTTPS locale |
| Export molto grande con asset embedded | download lento e memoria del server | streaming, `MAX_EXPORT_MB`, variante `embedAssets=false` |
| Import di un file corrotto o craftato | campagna parziale, path traversal, memoria esaurita | Zod strict, hash e `bytes` verificati, transazione unica, limiti di entità, parsing in worker thread |
| Volume e qualità dei dati SRD 5.2 | privilegi, incantesimi o oggetti sbagliati in scheda | catalogo JSON versionato con test di schema e fixture, revisione manuale, licenza e crediti tracciati; nessuno scraping a runtime |
| Snapshot della scheda troppo grande | export lento e `ActorStatblock` oltre il limite | snapshot solo degli elementi scelti, hard cap 512 KB, test su un incantesimo di ogni livello e su un personaggio 1–20 |
| Builder e server divergono sulla validazione | build accettata dalla UI ma rifiutata dal server (o viceversa) | `validatePcBuild()` unica in `shared`, test di parità, preview server-side prima del salvataggio |
| Valori derivati stale o override dimenticati | CA, CD o TS sbagliati in combattimento | `deriveSheet()` puro, badge "personalizzato", ricalcolo a ogni level-up e cambio equipaggiamento, test sui casi con armatura/scudo/talenti |
| Level-up o XP applicati due volte | livello, HP o slot duplicati | transazione unica, idempotenza per `actorId + livello`, preview senza scritture, `sheetVersion` |
| Riposo che applica più del dovuto | slot o dadi vita recuperati per errore | solo effetti deterministici SRD 5.2 (D60): breve senza HP, lungo con HP pieni, hit dice ed exhaustion; test su breve/lungo e sulle risorse `none` |
| Budget di creazione insufficiente a livello > 1 | personaggio senza equipaggiamento adeguato | budget precompilato dalla classe ma modificabile dal DM, avviso esplicito nel riepilogo per livello > 1 |
| Richieste di multiclasse o contenuti non SRD | scope creep sul builder | multiclass e materiale non SRD fuori dall'MVP; il modello a classe singola e snapshot lascia la porta aperta senza migrare le schede |
| Scope creep sul motore di regole | ritardo MVP | builder limitato a SRD 5.2 e 1–20; niente automatismo di attacchi, cure o condizioni fuori dai riposi; parsing IA solo come bozza |
| Pressione a "finire prima" saltando test o responsabilità | regressioni e codice sempre più difficile da modificare | D55 non derogabile: test prima del codice, review con le quattro domande, E2E a ogni PR |
| Dipendenza da API IA esterna | costo, latenza, privacy | feature opzionale, fallback regex, chiave solo server-side |

## 18. Aree ancora aperte

Nessuna area bloccante: le decisioni necessarie prima dello scaffold sono chiuse, comprese UI (D11), tema (D53) e CSP (D54).

Restano scelte **esplicitamente rimandate**, già registrate come decisioni e non come requisiti aperti:

- undo selettivo di una singola azione — fuori dall'MVP (D36)
- audit della action history oltre le 50 righe — escluso (D46)
- sessioni DM per dispositivo con revoca selettiva — revoca globale (D27)
- snapshot compressi o limite sotto 1 MB — solo se i benchmark lo richiedono (D38)
- campionamento dell'area occupata dal token nella fog — dopo l'MVP (D51)
- HTTPS gestito dall'app — Caddy opzionale, nessun certificato gestito (D40)
- pubblicazione di layer compositi con transizioni — taglio netto nell'MVP (D50)
- multiclasse, classi/razze homebrew e materiale non SRD — fuori dall'MVP (D57)
- aggiornamento esplicito di una scheda a una nuova versione SRD — dopo l'MVP, con migrazione dedicata
- automazione di attacchi, cure e condizioni durante il combattimento — la scheda mostra i valori, il tavolo applica

## 19. TODO immediato

1. struttura del monorepo root con `package.json` ESM, `.npmrc`, `.nvmrc`, `tsconfig.base.json` (strict massimo), `turbo.json`, **ESLint flat + Stylistic** e `.gitignore` (`data/`, `node_modules`, `dist`, `.turbo`); repo Git già inizializzato a mano, `PLAN.md` ancora da committare
2. inizializzare i workspace `client`, `server`, `shared`, il build di `shared` con `tsup` e barrel unico, e la CI GitHub Actions con E2E
3. scaffold **Angular 22 zoneless + Sass** con `ThemeService`, `components/` e CSP con nonce, e Fastify con `/api/v1/health`, proxy dev, env validate con Zod, `helmet`, `cookie` e `rate-limit` dal primo commit
4. **auth DM e sicurezza di base**: loopback fidato, `POST /auth/dm` con cookie firmato, allowlist `Host`, controllo `Origin`, `SESSION_SECRET` su file, errore fatale se `HOST` non loopback senza password
5. schemi Zod condivisi (`Actor`, `ActorStatblock`, `DerivedSheet`, `Scene`, `SceneState`, `DisplayState`, `DiceRoll`, `GridConfig`, `Token`, `WsMessage`, `PlayerSheetView`, `DmSheetView`, `validatePcBuild`) e helper griglia/dadi/derivati con i primi test Vitest
6. schema Drizzle + prima migrazione (`campaigns`, `scenes`, `actors`, `assets`, `displays`, `programs`, `dice_rolls`, `player_links`, `action_log`, `items`, `inventories`, `sessions`, `campaign_messages`); **catalogo SRD 5.2** versionato in JSON con test di schema, licenza e crediti
7. CRUD campagne + attori con paginazione a cursore ed envelope errori uniforme
8. `ActionService` minimo (applica + inverso + `action_log`) con `POST /campaigns/:id/actions`; `PUT /scenes/:id/state` solo come recovery con `state_version`
9. **scheletro di regia e doppio schermo**: `ProgramState`, `GET/PUT /program`, WS con ruoli, `/display/:code` e monitor PGM — prima della grafica, per validare subito l'architettura
10. poi **builder SRD e scheda console**, scene, core VTT, avanzamento e overlay dadi
11. dopo l'MVP: link giocatore `/play/:token` con QR, note separate, tiri dal telefono, `editable`, matita `editingEnabled` e coda di approvazione — primo item della Fase 8

## 20. Note finali

Il valore del monorepo sta nel fatto che `shared` contiene **il contratto**: gli schemi Zod sono usati per validare il client, il server e il documento `SceneState` salvato su disco. Questo evita il drift tra UI e persistenza, che in un VTT si manifesta sempre come "la scena si è rotta dopo un aggiornamento".

Le decisioni che non vanno rimandate sono D1 (`Actor` vs `Token`), D2/D3 (documento come rappresentazione persistita), D5 (realtime come requisito), D16/D17 (proiezione filtrata e DM come unico scrittore) e D34 (il server applica le azioni): cambiarle dopo la Fase 4 significa riscrivere modello dati, API e store insieme.

Il doppio schermo non è una feature di nicchia: è il vincolo che tiene onesto il resto. Se il modello dati permette di proiettare un contenuto scelto in modo esplicito (mappa, scheda, immagine) e riconnettersi con uno snapshot, allora anche il protocollo di azioni, export e fog sono sulla strada giusta. Se lo si aggiunge alla fine, quasi sempre si scopre che lo stato della scena era troppo accoppiato alla UI per essere proiettato.

Il protocollo di azioni è ciò che rende il doppio schermo e la scheda del telefono compatibili senza conflitti: un solo writer, un inverso calcolato dove lo stato è autorevole, un client che applica in modo ottimistico e si riallinea. Senza D34, ogni nuova superficie di scrittura avrebbe aggiunto un modo nuovo di perdere modifiche.

La distinzione chiave è tra **stato di lavoro** (`SceneState`, dove il DM prepara) e **stato in onda** (`ProgramState`, cosa vedono i giocatori). Tenerli separati è ciò che permette di preparare un'imboscata senza mostrarla, e di cambiare scena senza che lo schermo A salti.

I tiri seguono la stessa logica: non sono stato della mappa né contenuto in onda, sono **eventi** emessi dal server. Per questo vivono in `dice_rolls` e non in `SceneState`: se stessero nella scena, ogni tiro del telefono diventerebbe un'azione con approvazione, e il tavolo si fermerebbe a ogni dado.
