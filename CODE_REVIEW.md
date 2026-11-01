# Code review — D&D VTT

**Data:** 31 ottobre 2026  
**Scope:** `client/`, `server/`, `shared/`, configurazioni, stili SCSS, test.  
**Metodo:** lettura statica dei sorgenti, grep mirati su pattern duplicati, confronto con `PLAN.md`, esecuzione dei gate disponibili.

**Gate eseguiti**

| Comando | Esito |
|---|---|
| `npm run typecheck` | ✅ 4/4 task (cache Turbo) |
| `npm run lint` | ✅ 4/4 task (cache Turbo) |
| `npm run test` | ✅ shared 120 test, server 65 test, client 8 test |

Il progetto **compila, passa lint e test**. I problemi descritti sotto non sono errori di compilazione: sono debito strutturale, duplicazione, incongruenze funzionali e scostamenti dal piano.

---

## 0. Sintesi esecutiva

Il codice è sopra la media per disciplina di base: TypeScript strict, Zod ai confini, separazione `client → shared` / `server → shared`, test unitari in `shared`, E2E reali. Le criticità principali sono però nette:

1. **Duplicazione di logica di dominio** tra `shared`, store, componenti e route (punteggi abilità, HP massimi, casters preparati, livello massimo incantesimo, geometria, messaggi d'errore).
2. **God component**: `dm-shell.page.ts` (2.211 righe, 136 metodi, 60 signal, template 1.182 righe) e `scene-canvas.component.ts` (1.640 righe) violano D55/SoC.
3. **Incongruenze funzionali reali**: `alignment` del PG raccolto ma scartato dal server; export/import che perde XP e note giocatore; campi `editable` dichiarati ma non patchabili; comportamento diverso tra anteprima schermo e schermo reale per layer `map`/`initiative`; `dialog` che emette `closed` due volte su Esc.
4. **CSS fortemente duplicato**: 5 definizioni di `.field`, 3 di `.surface`, 3 di `.badge`, 61 bordi identici, 54 blocchi `display:grid; gap`, 26 usi di `--font-mono`, 9 pillole `999px`. Esistono già `_layout.scss` e i token, ma non esiste una libreria di mixin condivisa.
5. **Scostamenti dal piano**: Signal Forms e `resource()` non usati, nessun `RealtimeService`, nessun toast/ErrorHandler, nessun `@defer`, nessuna container query, UUID v4 lato client invece di v7, `no-restricted-imports` assente, `tsconfig` del client non esteso dalla base.

**Priorità consigliata:** prima correggere i bug di perdita dati e le incongruenze di proiezione (P0), poi estrarre i mixin CSS e i moduli condivisi (P1), infine spezzare i god component (P2, ma pianificato).

---

## 1. Metriche del codice

### 1.1 File più grandi

| File | Righe | Note |
|---|---:|---|
| `client/src/app/features/dm/dm-shell.page.ts` | 2.211 | 60 signal, 36 computed, 108 metodi pubblici, 28 privati, 15 `inject` |
| `client/src/app/features/scene/scene-canvas.component.ts` | 1.640 | 48 metodi; rendering Konva, fog, token, disegni, misura, input, tile |
| `client/src/app/features/actor/actor-sheet.page.ts` | 953 | 59 metodi; scheda, editing, HP, condizioni, riposi, level-up, ritratto, link giocatore |
| `client/src/app/features/maps/map-editor-canvas.component.ts` | 906 | 24 metodi; editor Konva |
| `shared/src/lib/sheet/validate.ts` | 783 | validazione build |
| `client/src/app/features/maps/map-editor.page.ts` | 712 | 42 metodi |
| `client/src/app/features/character/character-wizard.store.ts` | 663 | logica di build nel client |
| `client/src/app/features/character/character-wizard.page.ts` + `.html` | 466 + 656 | duplica derivazioni dello store |
| `server/src/actions/service.ts` | 372 | transazioni scena |
| `server/src/program/service.ts` | 354 | proiezione display |

### 1.2 Template più grandi

| Template | Righe | Note |
|---|---:|---|
| `dm-shell.page.html` | 1.182 | 103 handler `(click)/(change)/(input)/(pressed)`, 9 accordion ripetuti a mano, 18 `app-dialog` |
| `character-wizard.page.html` | 656 | wizard a 7 step |
| `actor-sheet.page.html` | 575 | 30 `<button>` |
| `map-editor.page.html` | 409 | inspector + toolbar |

### 1.3 Test

| Workspace | File di test | Test |
|---|---:|---:|
| `shared` | 16 | 120 |
| `server` | 7 | 65 |
| `client` | **3** | **8** |

Il client ha test solo su `app`, `SceneStore` e `MeasurementService`. Nessun test su `ActionStore`, `DiceStore`, `CharacterWizardStore`, `Dialog`, `Button`, `SceneCanvas`, `ActorSheetPage`, `MapEditorPage`. La soglia di copertura dichiarata nel piano (80% righe / 75% rami su `shared`) **non è configurata**: non esiste un `coverage` config né un `coverage/**` output in `turbo.json`.

---

## 2. Codice ripetuto

### 2.1 Logica di dominio duplicata (impatto alto)

| Regola | Copie | File | Rischio |
|---|---:|---|---|
| Punteggi finali abilità (`base + background + ASI`) | 3 | `shared/src/lib/sheet/hp.ts` (`pcAbilityScores`), `character-wizard.page.ts:107` (`finalScores`), `character-wizard.store.ts:93` (`scoresOf`) | Una copia dimentica gli ASI: `scoresOf` considera solo `backgroundIncreases` |
| HP massimi PG | 2 | `shared/src/lib/sheet/hp.ts` (`pcHpMax`), `shared/src/lib/sheet/level-up.ts` (`hpMaxFrom`) | Formule divergono silenziosamente |
| Guadagno HP medio | 2 | `progression.ts` (`averageHpGain`), `level-up.ts` (`hitDieAverage`) | Duplicato esatto |
| Casters preparati (`cleric/druid/paladin/wizard`) | 4 | `validate.ts:16`, `character-wizard.store.ts:170`, `:623`, `character-wizard.page.ts:201` | Regola di dominio nel componente |
| Livello massimo incantesimo | 3 | `progression.ts` (`maxSpellLevel`), `character-wizard.store.ts:137` (`maxSpellLevelOf`), `character-wizard.page.ts:185` | Tre implementazioni |
| Costo spesa equipaggiamento | 2 | `character-wizard.store.ts:218` (`spentOf`), `character-wizard.page.ts:212` (`spentCopper`) | Duplicato esatto |
| Feature di classe/sottoclasse | 2 | `build-statblock.ts:96` (`buildFeatures`), `level-up.ts:66` (`classFeatures`) | Stessa selezione per livello |
| Slot incantesimo/pact | 2 | `build-statblock.ts:142`, `level-up.ts:89` | Stessa derivazione |
| `pointInPolygon` | 3 | `shared/src/lib/scene/fog.ts:8`, `shared/src/lib/scene/vision.ts:208`, `scene-canvas.component.ts:1621` | Bug fix destinati a divergere |
| `distanceToSegment` | 3 | `fog.ts:27`, `vision.ts:228`, `map-editor-canvas.component.ts:892` | Idem |
| Envelope WebSocket (`v/type/seq/at/payload`) | 2 | `server/src/realtime/hub.ts:16`, `server/src/realtime/routes.ts:10` | Contratto WS duplicato |
| Mappatura errori HTTP → messaggio | 6 + 4 | `action.store.ts`, `dice.store.ts`, `scene.store.ts`, `dm-shell.page.ts`, `map-editor.page.ts`, `maps.page.ts` + metodi privati in `actor-sheet`, `auth`, `character-wizard`, `player` | Messaggi e codici divergenti |
| `ABILITY_LABELS` | 4 | `actor-sheet.page.ts`, `player.page.ts`, `actor-wizard.page.ts`, `character-wizard.page.ts` | Traduzioni duplicate |
| `SKILL_LABELS` | 2 | `actor-sheet.page.ts`, `player.page.ts` | Duplicato esatto |
| `senseText` | 2 | `actor-sheet.page.ts:818`, `player.page.ts:119` | Copia-incolla esatto |
| Mappa `Size → celle` | 2 | `dm-shell.page.ts:141` (`SIZE_CELLS`), `map-editor.page.ts:43` (`SRD_SIZE_CELLS`) | Stessa tabella |
| Mappatura `DmSheetView` / `PlayerSheetView` | 2 | `pc-service.ts:63`, `players/service.ts:40` | Campi leggermente diversi |
| Patch statblock (hp/conditions/deathSaves/currency/resources/hitDice/spells) | 2 | `pc-service.ts:106`, `players/service.ts:136` | La versione player omette `overrides` |
| Paginazione a cursore | 3 | `campaigns.repository.ts:20`, `scenes.repository.ts:17`, `actors.repository.ts:17` | Stesso blocco `where/orderBy/limit+1` |
| `idParamsSchema` | **12 file** | tutte le `server/src/**/routes.ts` | Duplicazione pura |
| Hook `requireDm` | 8 route usano `preHandler`, 4 lo chiamano per handler | `actions/actors/assets/campaigns/dice/maps/scenes/sessions` vs `ai/export/players/program` (+ `realtime`) | Facile dimenticare l'auth su una nuova route |
| `messageFor` nei testi UI | ~10 | vedi sopra | Incoerenza: alcuni mostrano il messaggio grezzo del server |
| Helper E2E (`openCampaign`, `campaignId`, `ensureScene`, `createGoblin`, …) | 5–6 copie | `client/e2e/*.spec.ts` | Nessun `fixtures.ts` condiviso |
| Helper test server (`createCampaign`, `createScene`, `sendAction`) | 4–5 copie | `server/test/*.spec.ts` | Nessun helper condiviso oltre `helpers.ts` |

### 2.2 Duplicazione di schema Zod

| Schema | Copie | File |
|---|---|---|
| `startView` / `MapView` / `Viewport` | 3 definizioni identiche (`{x,y,zoom}`) | `scene.ts:206`, `map.ts:8`, `program.ts:12` |
| Stato iniziativa | 2 inline + 1 schema | `scene.ts:214`, `scene.ts:223`, `program.ts:175` |
| Liste paginate `{ items, nextCursor }` | 3 | `campaign.ts:45`, `actor.ts:91`, `scene.ts:356` |
| `displayCompositionSchema` | 2 | `shared/src/schemas/program.ts:187` e ridefinito in `server/src/program/routes.ts:35` |
| Enum abilità ripetuto in campi manuali | molte | `overridesSchema.saves`, `abilityGeneration.base`, `abilityModifiers`, `abilitySchema` |
| Skills ripetute | 2+ | `skillSchema` + `overridesSchema.skills` (18 campi a mano) |
| `mime` immagini | 2 | `asset.ts:6`, `export.ts:11` |
| `feature` SRD / `resolvedFeature` | 2 | `srd.ts:37`, `sheet.ts:97` |
| `DmSheetView` / `PlayerSheetView` | campi comuni duplicati | `actor.ts:155`, `actor.ts:182` |

**Raccomandazione:** spostare le costanti e gli schemi comuni in `shared`, usare `z.infer` e generici (`Paginated<T>`), e derivare i campi skills da `skills` invece di riscriverli.

### 2.3 Duplicazione nei test

- `client/e2e`: `openCampaign` in 6 file, `campaignId` in 5, `ensureScene` in 3, `createGoblin` in 2. Manca un `e2e/fixtures.ts`.
- `server/test`: `createCampaign`, `createScene`, `sendAction` ripetuti in `api`, `phase5`, `phase6`, `phase7`.
- `global-setup.ts` e `playwright.config.ts` ripetono la stessa configurazione ambiente (`DATABASE_PATH`, `UPLOAD_DIR`, `PORT`, ecc.). Estrarre `e2e/env.ts`.

---

## 3. Code smell e architettura

### 3.1 God component: `DmShellPage`

`dm-shell.page.ts` gestisce contemporaneamente:

- autenticazione e scelta/campagna;
- CRUD scene e mappe;
- caricamento asset e ritratti;
- azioni di scena, undo/redo, history;
- iniziativa e dadi;
- fog, strumenti, impostazioni;
- regia (`ProgramState`, schermi, viewport, polling);
- sessioni;
- chat IA/parser statblock;
- upload/export/import;
- pannelli, accordion e preferenze locali;
- WebSocket di presenza e timer.

Nel template convivono 9 accordion copiati a mano, 18 dialog, 62 bottoni. È il punto che cambia per qualunque feature. **Va spezzato** in almeno:

- `CampaignShellStore` (campagna attiva, scene, sessione);
- `RegiaStore` / `ScreensStore` (program, display, viewport);
- `SceneToolsStore` (tool, fog, misure, impostazioni);
- componenti di sidebar (`SidebarSection`, `SceneList`, `ActorList`, `ScreenList`, `SessionCard`);
- componente `DmToolbar` e `DmStatusbar`.

Segnali **morti** già presenti: `currentInitiative`, `programVersion`, `displayCode` (usato solo da `displayUrl`, a sua volta mai referenziato). Sono il sintomo di stato rimasto dopo refactor.

### 3.2 God component: `SceneCanvasComponent`

Un unico componente gestisce:

- stage e layer Konva;
- caricamento mappa, preview e tile LOD;
- griglia quadrata/esagonale;
- porte e luci;
- fog (visione + operazioni manuali + draft);
- token e ritratti;
- disegni;
- misura;
- camera, zoom, pan, resize;
- drag&drop, puntatori, tastiera;
- export PNG.

Suggerito: `KonvaStageService` (stage, camera, resize, zoom), `MapLayerRenderer`, `GridRenderer`, `FogRenderer`, `TokenRenderer`, `CanvasInputController`. La logica di collisione/visibilità è già in `shared`: va tenuta lì.

### 3.3 Altri componenti sovraccarichi

- `ActorSheetPage`: scheda + editing + HP + condizioni + riposi + level-up + ritratto + link giocatore. Estrarre `SheetHeader`, `SheetTabs`, `CombatPanel`, `SpellPanel`, `InventoryPanel`, `NotesPanel`, `PortraitEditor`, `LevelUpDialog`, `PlayerLinkPanel`.
- `MapEditorPage` + `MapEditorCanvasComponent`: separare documento, history, inspector, toolbar, rendering.
- `CharacterWizardStore`: contiene regole di costruzione del PG che dovrebbero stare in `shared` (D55/D58). Il componente poi le duplica.

### 3.4 Stato di modulo / singleton

Violano la regola “niente stato applicativo in singleton o variabili di modulo”:

- `server/src/realtime/hub.ts`: `clients`, `database` globali;
- `server/src/dice/service.ts`: `idempotency` Map globale;
- `server/src/actors/roll-stats.ts`: `rolls` Map globale.

Conseguenze: test non isolabili, impossibile avere due istanze dell'app nello stesso processo, cleanup non deterministico. Meglio un `RealtimeHub` iniettato in `buildApp` e passato ai service, e cache con TTL esplicito e `dispose()`.

### 3.5 Due sistemi di realtime

Il piano (D67, 5.11.2) chiede **un solo `RealtimeService`**. Oggi:

- `DisplayPage` apre un WebSocket proprio (`display.page.ts:167`);
- `DmShellPage` apre un secondo WebSocket solo per la presenza (`dm-shell.page.ts:2121`);
- le azioni delle console passano da **polling HTTP ogni 2 s** (`action.store.ts:173`), non dal WebSocket.

Tre meccanismi, due copie della logica di riconnessione/backoff, nessun punto unico. Va introdotto `RealtimeService` che incapsula connessione, envelope, backoff, `seq`, filtro di ruolo e dispatch agli store.

### 3.6 `ActionStore`: crescita non limitata

`seen` è un `Set<string>` che accumula ogni `id` di azione inviata e non viene mai ripulito (`action.store.ts:43,187`). In una sessione lunga cresce senza limite. Inoltre `syncNow` può sovrapporsi ai tick di `setInterval` (nessun flag `inFlight`), con possibilità di doppio `load`/applicazione. Aggiungere TTL/LRU e un guard.

### 3.7 Error handling duplicato e incoerente

- Alcune funzioni mappano i codici HTTP in messaggi italiani.
- Altre mostrano `error.error.error.message` grezzo (`maps.page.ts:161`, `map-editor.page.ts:707`), contro la regola 5.11.6 (“mai il messaggio grezzo del server”).
- `actor-sheet` e `character-wizard` hanno un `serverMessage()` identico.
- `auth.service` ha una terza mappatura.

Soluzione: `core/http-error.ts` con `toUserMessage(error, context)` e un `ErrorHandler` globale con toast (oggi assente).

### 3.8 Accessibilità e wrapper

- `app-button` non inoltra attributi/ARIA al `<button>` interno: un `aria-describedby` o `aria-pressed` sull’host non arriva al controllo reale. Il wrapper dichiara `ariaLabel` ma non supporta `aria-expanded`/`aria-pressed`, usati dai toggle degli accordion.
- `app-dialog` non collega il titolo al `<dialog>` con `aria-labelledby`/`aria-describedby`: il titolo è visibile ma non è l’etichetta accessibile del dialog.
- `dm-shell` ha `aria-busy="false"` statico e non aggiornato; la statusbar non è `aria-live`, quindi i messaggi di sincronizzazione non vengono annunciati.
- I canvas Konva non sono focusabili e non hanno alternativa da tastiera: pan/zoom/selezione/disegno sono solo mouse/touch. Per un VTT va previsto almeno un fallback per le azioni distruttive e una descrizione `aria-label`/`role="img"` sullo stage.
- `prefers-reduced-motion` copre solo lo skeleton, non spinner, dado e transizioni.

### 3.9 Compatibilità export

`schemaVersion` è `z.literal(1)` (`shared/src/schemas/export.ts:16`) e non esiste una pipeline di migrazione. D33 promette compatibilità con tutte le versioni passate: oggi è vero solo perché esiste una sola versione. Prima di cambiare lo schema va introdotta una funzione `migrateExport(bundle)` con fixture per versione, altrimenti il primo cambio romperà i backup.

---

## 4. Incongruenze funzionali e possibili bug

### P0 — perdita dati / sicurezza

1. **`alignment` del PG viene scartato.**
   - `CreatePc` include `alignment` (`shared/src/schemas/actor.ts:99`).
   - Il wizard lo invia (`character-wizard.page.ts:384`).
   - `createPc` non lo legge (`server/src/actors/pc-service.ts:22-61`).
   - `buildPcStatblock` non lo imposta (`shared/src/lib/sheet/build-statblock.ts`).
   - `PcStatblock` ha il campo (`sheet.ts:299`) ma resta sempre `undefined`.
   → L’allineamento inserito dall’utente sparisce senza errori.

2. **Export/import perde dati.**
   - `insertPcActor` forza `xp: 0` (`server/src/db/actors.repository.ts:109`); `importCampaign` non riallinea `actor.xp` dopo la creazione (`export/service.ts:203-211`). I PG importati perdono gli XP.
   - `playerNotes` non è mai esportato (`export/service.ts:104-123`, schema `actorSchema` senza campo) e in import è forzato a `null` (`:208`). Il flag `includePrivateNotes` previsto da D31 **non esiste**.
   - `sheetVersion`, `createdAt`, `updatedAt` vengono azzerati/rigenerati.
   - L’import non è transazionale: se fallisce a metà, restano campagna, asset, mappe e attori orfani.

3. **Gli originali caricati sono serviti pubblicamente.**
   - `@fastify/static` espone **tutta** `env.uploadDir` sotto `/uploads/` (`server/src/app.ts:169-175`), inclusi `originals/`.
   - L’hash è esposto nel DTO `Asset`, quindi `/uploads/originals/<hash>.png` è ricostruibile.
   - Il commento in `assets/service.ts:57` dice “il file servito è sempre il WebP”, ma non è vero per gli originali.
   → Se l’upload è una foto con EXIF/GPS, i metadati sono raggiungibili. Servire solo `webp/`, `previews/`, `thumbs/`, `tiles/` oppure negare `originals/`.

4. **Il codice display usa `Math.random()`.**
   - `displays.repository.ts:10`: `Math.floor(Math.random() * ALPHABET.length)`.
   - Un codice di pairing deve essere imprevedibile; usare `randomInt`/`randomBytes` da `node:crypto`.
   - Inoltre le GET sono esenti dal rate limit (`app.ts:70`), quindi il codice è attaccabile senza throttling.

5. **Idempotenza azioni non verificata per campagna/scena.**
   - `applySceneAction` cerca `request.id` globalmente e, se esiste, restituisce l’entry senza controllare `campaignId`/`sceneId` (`actions/service.ts:151-163`).
   - Un client che conosce un UUID di un’altra campagna può leggere payload/inverso. Verificare campagna e scena prima del return.

### P1 — comportamento incoerente

6. **Anteprima schermo ≠ schermo reale.**
   - `screen-preview` renderizza layer `map` e `initiative` in **qualsiasi** posizione (`screen-preview.component.html:9-58`).
   - `display.page.html` renderizza `map` solo come base (`:18`) e non gestisce affatto `initiative` come layer: base `initiative` → layer vuoto; overlay `map` → layer vuoto.
   - Quindi la regia può mostrare in anteprima una cosa che lo schermo reale non mostra. Estrarre un componente `DisplayLayerView` condiviso.

7. **`Dialog` emette `closed` due volte su Esc.**
   - `cancel()` emette `closed` senza `preventDefault` (`dialog.ts:37-43`).
   - Il browser chiude il dialog e scatena anche `close` → `close()` emette di nuovo (`dialog.html:1`).
   - Doppia esecuzione di handler come `closeScreenDialog()`/`cancelFogChange()`. Chiamare `preventDefault()` in `cancel`, oppure non emettere da entrambi.

8. **Campi `editable` dichiarati ma non supportati.**
   - `playerEditableFieldSchema` include `tempHp`, `inventory`, `equipment` (`shared/src/schemas/actor.ts:164-176`).
   - `PlayerSheetPatch` non ha quei campi (`:215-227`); il server confronta le chiavi del patch con `editable`, quindi quei permessi non producono mai effetti.
   - Inoltre non esiste un endpoint per modificare i singoli campi editabili: solo `editingEnabled`. D22 (“permessi per campo”) è implementato solo a metà.

9. **Token-sync bypassa il modello ad azioni.**
   - `updateTokensForActor` scrive `scenes.state` e incrementa `stateVersion` senza `action_log` (`actors/token-sync.ts:58-83`).
   - D34 dice che il server applica azioni in transazione e scrive il log; qui lo stato cambia fuori dal log. I client se ne accorgono solo dal gap di versione e ricaricano.
   - Se il log è la fonte di verità per l’undo, queste modifiche non sono annullabili e rendono la history non contigua.

10. **`PUT /scenes/:id/state` è un residuo fuori modello.**
    - Endpoint attivo (`scenes/routes.ts:47`), usato solo dai test (`server/test/api.spec.ts`, `phase6.spec.ts`), non dal client.
    - D34/D2 dicono che il flusso normale non fa autosave full-document. Va documentato come “solo recovery” o rimosso.

11. **Fog base ignorata quando c’è visione.**
    - `renderFog` con `vision !== null` riempie sempre di nero e “buca” le celle visibili, indipendentemente da `fog.base` (`scene-canvas.component.ts:844-875`).
    - Una scena con `fog.base = 'revealed'` e visione attiva parte coperta. `createSceneFromMap` può produrre questa combinazione. Decidere una precedenza esplicita (visione > base, oppure base come fallback) e testarla.

12. **`token.update` non annulla i campi opzionali.**
    - `invertAction` costruisce il patch inverso con `Object.keys(action.patch)` (`actions.ts:197-203`).
    - Se il campo originale era `undefined`, il patch inverso contiene `undefined`; `withPatch` salta i valori `undefined` (`actions.ts:7-25`).
    - Risultato: `ac`, `deathSaves`, `owner`, `light` non tornano a “assente” con l’undo. Oggi l’UI usa solo `visible`/`hp`, quindi il bug è latente, ma il tipo permette gli altri campi.

13. **`beforeunload` incompleto.**
    - `map-editor.page.ts:102-106` fa solo `preventDefault()` senza `event.returnValue`. In alcuni browser la conferma non compare e le modifiche non salvate vengono perse.

14. **`persistPanels` non gestisce `localStorage` disabilitato.**
    - `restorePanels` ha il `try/catch` sul parse, ma `getItem` è fuori (`dm-shell.page.ts:1706`).
    - `persistPanels` non ha alcun `try/catch` (`:1733-1747`).
    - In private mode o storage pieno, un click su un accordion può lanciare e interrompere l’handler. Il resto del progetto usa il pattern `try/catch` ovunque: qui è incoerente.

15. **Campi numerici dell’editor mappa possono diventare `NaN`.**
    - `updateLightField`, `updateSpawnField`, `updateGridField`, `updateTerrainField` usano `Number(...)` senza `Number.isFinite` (`map-editor.page.ts:430-516`).
    - Un input svuotato produce `0`, un valore non numerico produce `NaN`, che finisce nel documento e fallisce solo al salvataggio con un errore generico.

16. **Import: `remap` riscrive qualsiasi stringa.**
    - `remapUnknown` sostituisce ogni stringa che coincide con un vecchio id, in tutto l’albero (`export/service.ts:57-73`), non solo nei campi `*Id`.
    - Una label o una nota uguale a un UUID verrebbe riscritta. `refs()` è già selettivo sui nomi di campo: usare la stessa selettività anche nel remap.

17. **Due modi di costruire gli URL.**
    - I display usano `location.origin` (`dm-shell.page.ts:445-448`, peraltro codice morto) e path relativi.
    - I link giocatore usano `env.publicUrl` (`players/service.ts:86`).
    - In `npm run dev` il link generato punta a `http://localhost:3000` mentre il client gira su `:4200`; senza `client/dist` il link non funziona. Scegliere una fonte unica.

18. **`defaultTerrain` ha tre default diversi per `visionEnabled`.**
    - `defaultTerrain.visionEnabled = false` (`scene.ts:105`).
    - `terrainSchema.visionEnabled` default `true` (`:113`).
    - `mapTerrainDefaults.visionEnabled = true` (`map.ts:131`).
    - Una scena creata “vuota” nasce con visione spenta; una scena da mappa con visione accesa. Allineare.

19. **Stringa corrotta in `actions.ts`.**
    - `shared/src/lib/scene/actions.ts:64` contiene `U+FFFD` (`non pu� attraversare`). È un errore di encoding committato; il messaggio utente è visibilmente rotto.

20. **Lingua incoerente nei dati.**
    - `actor-wizard.page.ts:84` inizializza `languages = 'Common'` (inglese), mentre il resto della UI e `LANGUAGE_POOL` usano “Comune”. Il valore viene mostrato così com’è.

### P2 — robustezza / type safety

21. `display.page.ts:60` e `screen-preview.component.ts:77` fanno `token.conditions.map((name) => ({ name } as Condition))`: cast non verificato di una `string` a `ConditionName`. Se il server invia una condizione sconosciuta, la UI la accetta silenziosamente. Meglio `conditionNameSchema` nel DTO pubblico.
22. `actor-sheet.page.ts:536-540` fa `as Ability` sui valori di `<select>` senza validare. Usare `abilitySchema.options.includes`.
23. `character-wizard.page.ts:449` analizza la bozza come `Partial<StoredDraft>` senza Zod. Una bozza corrotta può produrre `build` invalida fino al salvataggio. Il progetto ha già Zod: validare la bozza con uno schema `storedDraftSchema`.
24. `displays.repository.ts:104`, `programs.repository.ts:15`, `mappers.ts:101-110` decodificano JSON con `as`, non con lo schema. Le colonne `SceneState`/`MapDocument` sono validate, queste no. Incoerente e fragile alle migrazioni.
25. `shared/src/lib/sheet/validate.ts:732-780`: 11 chiamate `validateX(context)` con lo stesso pattern e centinaia di `addError(context, step, code, message, field)`. Funziona, ma un helper `check(condition, error)` ridurrebbe rumore e errori di copia.
26. `parseMonsterText` calcola due volte la stessa regex per `hp.current` e `hp.max` (`server/src/ai/parse.ts:35-36`). Minore, ma è duplicazione.

---

## 5. Piano vs implementazione

| Regola / scelta del piano | Stato nel codice | Evidenza |
|---|---|---|
| Signal Forms per i wizard (righe 62, 618, 725) | ❌ assente | nessun import `@angular/forms` (dipendenza presente ma inutilizzata) |
| `resource()` / `httpResource` (63, 617) | ❌ assente | tutti i servizi usano `firstValueFrom` manuale |
| `RealtimeService` unico (630, 722) | ❌ assente | 2 WebSocket nei componenti + polling |
| Toast + `ErrorHandler` globale (619, 681) | ❌ assente | nessun componente toast, nessun `ErrorHandler` |
| `@defer` per pannelli pesanti (621) | ❌ assente | nessun `@defer` |
| Container query (670) | ❌ assente | nessun `@container` |
| `hover` solo su pointer fine (667) | ❌ assente | nessun `@media (hover: hover)` |
| `prefers-reduced-motion` (674) | ⚠️ solo skeleton | `dm-shell.page.scss:1154`; spinner e animazioni non coperti |
| Nessun `alert/confirm/prompt` (681) | ❌ violato | `map-editor.page.ts:628` usa `window.confirm` |
| Nessun attributo `style` nei template (668, D54) | ⚠️ violato | `[style]`/`[style.*]` in `display`, `screen-preview`, `dm-shell`, `actor-sheet` |
| Solo token CSS, niente colori hardcoded (665) | ❌ violato | 23 valori letterali `#hex`/`rgb()` nelle feature |
| Nessun selettore globale di elemento fuori dal reset (669) | ❌ violato | `input`, `button`, `h1`, `h2`, `code`, `img`, `ul`, `li` stilizzati nelle feature |
| Nessuna larghezza massima di pagina (673) | ❌ violato | `maps.page.scss:12` `max-width: 90rem`, `player.page.scss:10` `48rem`, `dm-state` `30rem` |
| Console NON usa `grid-12` (671) | ❌ contraddetto | `dm-shell.page.scss:101` usa `layout.grid-12`; anche `actor-sheet` |
| UUID v7 per le nuove entità (631/D6) | ❌ client usa v4 | `crypto.randomUUID()` in scene/token/drawing; solo il server usa `uuidv7` |
| `no-restricted-imports` per i confini (523) | ❌ assente | nessuna regola nell’ESLint config |
| `exactOptionalPropertyTypes` e `verbatimModuleSyntax` sul client (D29) | ❌ assente | `client/tsconfig.json` non estende `tsconfig.base.json` |
| `max-len` 110 (522) | ❌ 120 | `eslint.config.js:40` |
| Budget Angular 700 kB / 1.2 MB (445) | ❌ 500 kB / 1 MB | `client/angular.json:42-43` |
| Coverage `shared` 80/75 (556) | ❌ non configurata | nessun `coverage`/threshold |
| Export `includePrivateNotes` (D31) | ❌ assente | nessun flag in route/service/schema |
| `action_log` unico writer (D34) | ⚠️ parziale | `token-sync.ts` scrive fuori log |

Questi scostamenti non sono tutti bug, ma vanno riconciliati: o si aggiorna il piano, o si aggiorna il codice. Oggi un lettore di `PLAN.md` si aspetta un’app diversa da quella che trova.

---

## 6. Analisi CSS: mixin e function

### 6.1 Inventario quantitativo

Scansione dei 19 file SCSS in `client/src`:

| Pattern | Occorrenze | Nota |
|---|---:|---|
| `border: var(--border-width) solid var(--color-border)` | 61 | stesso bordo su pannelli, input, card, toolbar |
| `display: grid; gap: var(--space-*)` | 54 | stack verticale ripetuto |
| `font-family: var(--font-mono)` | 26 | label, badge, statusbar, timer |
| `background: transparent` | 21 | bottoni ghost/icona/tab |
| `background: var(--color-bg-raised)` | 20 | superfici |
| `list-style: none` + `margin:0; padding:0` | 14 + 12 | reset liste |
| `border-radius: 999px` | 9 | pillole |
| `text-overflow: ellipsis` | 8 | tutte in `dm-shell` |
| `text-transform: uppercase` | 7 | eyebrow/label |
| Colori hardcoded nelle feature | 23 | `#000`, `#111`, `#4ea1ff`, … |

Classi ridefinite con lo stesso nome in più file:

| Classe | Definizioni | File |
|---|---:|---|
| `.field` | 5 | `styles.scss`, `dm-shell`, `actor-sheet`, `actor-wizard`, `dice-overlay` |
| `.surface` | 3 | `styles.scss`, `actor-sheet`, `actor-wizard` |
| `.badge` | 3 | `styles.scss`, `dm-shell`, `actor-sheet` |
| `.file-input` | 4 | `actor-sheet`, `dm-shell`, `map-editor`, `maps` |
| `.panel-head` | 4 | `dm-shell` (2), `actor-wizard`, `character-wizard` |
| `.state--error` | 3 | `actor-sheet`, `actor-wizard`, `character-wizard` |
| `.back` | 2 | `actor-sheet`, `actor-wizard` |
| `.notes` | 2 | `actor-sheet`, `actor-wizard` |
| `.actions` | 2 | `actor-sheet`, `character-wizard` |

**Problema di cascata:** le ridefinizioni locali non azzerano tutte le proprietà globali.
- `.surface` globale ha `box-shadow: var(--shadow-1)`; le versioni locali non lo rimuovono → le card di scheda e wizard hanno un’ombra, contro lo stile “thin” (ombre solo su overlay/dialog).
- `.badge` globale ha `border: 1px solid var(--color-border)`; `dm-shell` locale imposta solo `background/color/border-radius` → il badge “attiva” ha un bordo grigio attorno al riempimento accent.
- `.field` globale imposta `display:grid; gap`; le locali aggiungono solo `font-size` e stili dei controlli, duplicando il resto.

### 6.2 Mixin proposti

Sì: **la maggior parte della duplicazione CSS è un candidato mixin**, perché sono blocchi di dichiarazioni con parametri piccoli (raggio, colore, dimensione). Le function Sass servono solo per valori calcolati a compile time (breakpoint, z-index, spaziature), non per i token runtime, che sono CSS custom properties.

Creare `client/src/styles/_mixins.scss` e importarlo con `@use '../../../styles/mixins' as mx;` (oppure esporre i mixin da `_layout.scss` per compatibilità).

```scss
// client/src/styles/_mixins.scss
@use 'sass:map';

// --- layout -------------------------------------------------------------
@mixin stack($gap: var(--space-2)) {
  display: grid;
  gap: $gap;
}

@mixin row($gap: var(--space-2), $wrap: wrap) {
  display: flex;
  flex-wrap: $wrap;
  align-items: center;
  gap: $gap;
}

@mixin list-reset {
  margin: 0;
  padding: 0;
  list-style: none;
}

@mixin fill-height {
  flex: 1 1 auto;
  min-height: 0;
}

// --- superfici ----------------------------------------------------------
@mixin bordered($radius: var(--radius-md), $bg: var(--color-bg-raised)) {
  border: var(--border-width) solid var(--color-border);
  border-radius: $radius;
  background: $bg;
}

@mixin surface($radius: var(--radius-md), $padding: null) {
  @include bordered($radius);
  @if $padding != null {
    padding: $padding;
  }
}

@mixin panel($gap: var(--space-3), $padding: var(--space-3)) {
  @include bordered(var(--radius-md), var(--color-bg-raised));
  display: flex;
  flex-direction: column;
  gap: $gap;
  min-height: 0;
  padding: $padding;
}

// --- controlli ----------------------------------------------------------
@mixin control($radius: var(--radius-sm)) {
  width: 100%;
  min-height: var(--control-height);
  padding: var(--space-1) var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: $radius;
  background: var(--color-bg-raised);
  color: var(--color-text);
  transition: border-color var(--transition), background var(--transition);

  &:hover {
    border-color: var(--color-border-strong);
  }

  &:focus-visible {
    border-color: var(--color-focus);
    outline: none;
  }
}

@mixin field($control-radius: var(--radius-sm)) {
  display: grid;
  gap: var(--space-1);
  font-size: var(--text-sm);

  > label,
  > .field-label {
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  input,
  select,
  textarea {
    @include control($control-radius);
  }
}

@mixin button-base($radius: var(--radius-md)) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-height: var(--control-height);
  padding: 0 var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: $radius;
  background: var(--color-bg-raised);
  color: var(--color-text);
  font-size: var(--text-sm);
  line-height: 1;
  transition: background var(--transition), border-color var(--transition), color var(--transition);

  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

@mixin icon-button($size: 1.8rem) {
  display: grid;
  place-items: center;
  width: $size;
  height: $size;
  padding: 0;
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);

  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.4;
  }
}

// --- tipografia ---------------------------------------------------------
@mixin truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@mixin mono-label($size: var(--text-xs)) {
  font-family: var(--font-mono);
  font-size: $size;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@mixin eyebrow {
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@mixin pill($bg: transparent) {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.05rem var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: 999px;
  background: $bg;
  font-size: var(--text-xs);
}

// --- sovrapposizioni / canvas ------------------------------------------
@mixin frame-layer {
  position: absolute;
  left: calc(var(--frame-x, 0) * 100%);
  top: calc(var(--frame-y, 0) * 100%);
  width: calc(var(--frame-width, 1) * 100%);
  height: calc(var(--frame-height, 1) * 100%);
  opacity: var(--layer-opacity, 1);
}

@mixin overlay-card {
  max-width: 80%;
  padding: var(--space-4);
  border: 1px solid rgb(255 255 255 / 25%);
  border-radius: var(--radius-lg);
  background: rgb(0 0 0 / 65%);
  text-align: center;
}

@mixin konva-surface {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
}

@mixin visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### 6.3 Function proposte

```scss
// client/src/styles/_functions.scss
@use 'sass:map';

$breakpoints: (
  'sm': 520px,
  'md': 720px,
  'lg': 980px,
  'xl': 1050px,
  'xxl': 1200px,
);

$z-layers: (
  'base': 0,
  'stage': 10,
  'topbar': 20,
  'dialog': 100,
  'toast': 200,
);

@function bp($name) {
  @if not map.has-key($breakpoints, $name) {
    @error 'Breakpoint sconosciuto: #{$name}';
  }
  @return map.get($breakpoints, $name);
}

@function z($name) {
  @if not map.has-key($z-layers, $name) {
    @error 'Livello z sconosciuto: #{$name}';
  }
  @return map.get($z-layers, $name);
}

// Non usare funzioni per i colori: sono CSS custom properties runtime.
// Questa funzione è accettabile solo per mescolare token già risolti:
@function alpha($token, $percent) {
  @return color-mix(in srgb, var($token) #{$percent}, transparent);
}
```

```scss
@mixin respond($name) {
  @media (max-width: bp($name)) {
    @content;
  }
}
```

**Nota importante:** i mixin **non riducono il CSS emesso**, lo duplicano a ogni `@include`. Se l’obiettivo è anche il peso del bundle, affiancare:
- classi utility globali per i pattern semplici (`.stack`, `.row`, `.truncate`, `.surface`, `.pill`);
- oppure `@extend` solo in casi controllati (rischioso con Angular view encapsulation);
- componenti Angular condivisi per i pattern complessi (button, badge, field).

Per questo progetto, con view encapsulation emulata, la soluzione più solida è: **mixin per i pattern parametrici** + **classi globali** per i pattern identici + **componenti** per gli elementi interattivi.

### 6.4 Piano di migrazione CSS

1. **Base:** creare `_mixins.scss` e `_functions.scss`; importare i token da `_tokens.scss`/`_themes.scss`; aggiungere `--text-base` ai token.
2. **Globali:** in `styles.scss` usare i mixin per `.surface`, `.field`, `.input/.select/.textarea`, `.btn`, `.badge`, `.eyebrow`; eliminare le ridefinizioni locali di `.field`/`.surface`/`.badge`.
3. **Feature:** sostituire i blocchi `display:grid; gap` con `@include mx.stack(...)`, i bordi con `@include mx.bordered(...)`, i bottoni con `@include mx.button-base`/`mx.icon-button`, le pillole con `mx.pill`, le truncate con `mx.truncate`.
4. **Duplicati strutturali:**
   - `.display-layer` + `.screen-preview__layer` → `@include mx.frame-layer`;
   - `.display-text/actor` + `.screen-preview__card` → `@include mx.overlay-card`;
   - `.scene-canvas` + `.map-editor-canvas` → `@include mx.konva-surface`;
   - `.slot__portrait`, `.portrait-editor__frame`, `.map-card__preview` → mixin `@mixin media-frame($ratio)`.
5. **Breakpoint:** sostituire i 6 valori sparsi con `@include mx.respond('lg')`.
6. **Colori hardcoded:** associare a token semantici (`--canvas-bg`, `--overlay-bg`, `--overlay-text`, `--wall-color`, `--draft-color`), non a `--color-*` generici.
7. **Rimozione:** `_layout.scss` `fill-height` è morto; usarlo nei `:host` di pagina o rimuoverlo. `grid-12` va usato solo nei wizard, secondo 5.11.5 (e va corretta la contraddizione con D64).
8. **Verifica:** screenshot test Playwright/`toHaveScreenshot` sulle route principali, oppure almeno E2E esistenti + controllo manuale di light/dark.

### 6.5 Bug CSS concreti

- **`--text-base` non esiste** (`actor-sheet.page.scss:338`). Il fallback è la dimensione inherit: la regola non fa nulla. Definire `--text-base` o usare `--text-md`.
- **`.surface` con ombra** in scheda/wizard (vedi 6.1).
- **`.badge` di `dm-shell` con bordo globale** (vedi 6.1).
- **Raggio incoerente:** `.input` globale usa `--radius-sm`; i `.field input` locali usano `--radius-md`; `.surface` globale usa `--radius-lg`, le locali `--radius-md`. Scegliere una scala.
- **`:host` mancante o `display` diverso** in alcune route (`display` block, `dm-shell` flex, `maps` block). La catena `fill-height` non è uniforme.
- **`display: contents`** su `app-dialog`/`app-dice-overlay`: corretto per non creare un box, ma va documentato perché rende gli `@HostBinding`/`:host` inutili.
- **Animazioni:** `shimmer` e `spin` sono definite localmente; spostarle in `_animations.scss` e aggiungere `prefers-reduced-motion` per entrambe.

---

## 7. Performance

1. **Polling console ogni 2 s** (`action.store.ts:173`) + `loadScreens` su ogni `presence.updated` + polling display 5 s. Con più console e display il carico cresce linearmente. Il WebSocket esiste già: usarlo per le azioni.
2. **`projectDisplay` fa N+1 query**: `publicScene` chiama `getActor`/`getAsset` per ogni token, `projectDisplay` per ogni display. Con 30 token e 3 display sono centinaia di query sincrone per ogni broadcast. Precaricare attori/asset in una mappa `id → entità`.
3. **`applySceneAction` riserializza l’intero `SceneState`** (fino a 1 MB) a ogni azione e lo ri-valida con Zod. Accettabile per un’app locale, ma è il collo di bottiglia se si aggiungono più console. Valutare patch JSON o snapshot incrementali.
4. **`updateTokensForActor` scandisce tutte le scene della campagna** per ogni modifica di scheda (`token-sync.ts:64`). Con molte scene/azioni è O(scene × token).
5. **Map editor: `structuredClone` + 50 snapshot completi** a ogni modifica (`map-editor.page.ts:670-684`). Con 4.000 muri e 500 spawn, la history può occupare centinaia di MB. Usare patch/undo command o limitare la history in base alla dimensione.
6. **Map editor: `renderAll()` a ogni wheel/pointermove** (`map-editor-canvas.component.ts:240-265, 327-346`). Ridisegna mappa, griglia, muri, luci, attori e overlay. Separare i layer e ridisegnare solo quello necessario.
7. **Griglia editor: un `Konva.Line` per cella** (`map-editor-canvas.component.ts:548-614`) contro un singolo `Konva.Shape` in `scene-canvas` (`:683`). La versione editor è molto più pesante e incoerente.
8. **`getComputedStyle` a ogni render** (`scene-canvas.component.ts:1608-1618`) e chiamate multiple per frame. Cache per tema/`data-theme`.
9. **Cache immagini mai svuotata** (`loadingImages`, `portraitImages` in `scene-canvas`). Con molte mappe/attori in una sessione lunga cresce.
10. **`insertSession` carica tutte le sessioni** per calcolare il prossimo numero (`sessions.repository.ts:32`). Usare `MAX(number)`.
11. **`listActorPage`/`listScenes`/`listCampaigns`** ripetono lo stesso pattern con `limit+1`: corretto, ma il cursore `createdAt+id` non usa un indice composito in tutti i casi. Verificare i piani SQLite con `EXPLAIN QUERY PLAN`.

---

## 8. Sicurezza

| Tema | Osservazione |
|---|---|
| Originali pubblici | `/uploads/originals/*` raggiungibile; EXIF/GPS potenzialmente esposti |
| Codice display | `Math.random()` invece di CSPRNG; GET esenti da rate limit |
| Password DM | `passwordMatches` usa HMAC con chiave costante `'dm-password'` invece di un KDF con salt; meglio `scrypt`/`argon2` o almeno `crypto.timingSafeEqual` su hash con salt |
| CSP | `connect-src 'self' ws: wss:` permette WebSocket verso qualsiasi host; restringere a `'self'` se possibile |
| Import | non transazionale; file JSON fino a `MAX_JSON_MB` (default 2 MB) ma asset base64 possono essere grandi; nessun limite aggregato |
| Idempotenza azioni | lookup globale per `id` senza controllo campagna/scena |
| Rate limit | `allowList` esclude tutte le GET, incluse quelle che leggono dati sensibili (history azioni, sheet giocatore) |
| Cookie | `sameSite: strict`, `httpOnly`, `secure` auto: buono; TTL 30 giorni senza rotazione/revoca per-device (dichiarato D27) |
| Path upload | `uploadDir` è configurabile e validato come path assoluto; bene. `originalPath`/`thumbPath` non sono normalizzati contro `..`, ma derivano da hash SHA-256, quindi non controllabili dall’utente |

---

## 9. Test e qualità

- **Punti forti:** `shared` ha test significativi su azioni, fog, visione, griglia, dadi, validazione, level-up. I test server usano `app.inject` e coprono API reali. Gli E2E coprono le fasi 2–9.
- **Gap:** il client ha 8 test. I componenti più critici (`SceneCanvas`, `DmShell`, `ActorSheet`, `Dialog`) non hanno test unitari. Le regressioni su canvas/fog/regia sono coperte solo da E2E, lenti e non esaustivi.
- **Nessuna coverage configurata**, nonostante il piano.
- **Nessun test di contract tra client e server**: `Client` dichiara a mano i tipi delle risposte HTTP (`http.get<Campaign>`), quindi una divergenza server→client non è intercettata se non a runtime. Valutare test di schema condivisi o generazione di tipi OpenAPI (il server ha già `fastify-type-provider-zod`).
- **Test E2E:** `waitForTimeout(100)` e `networkidle` sono anti-pattern; preferire `expect.poll`/locator. Ci sono già molti `expect.poll`, quindi la linea è quasi giusta.
- **Test helper duplicati** (vedi 2.3): un `fixtures.ts` ridurrebbe ~200 righe e renderebbe i test più leggibili.

---

## 10. Backlog prioritizzato

### P0 — correggere prima di nuove feature

1. Persistere `alignment` nel `PcStatblock` e passarlo da `createPc`; test di regressione.
2. Export/import: preservare `xp`, `playerNotes` (con flag), `sheetVersion`; rendere l’import transazionale; test su campagna con PG e note.
3. Non servire `originals/`; verificare con test che `/uploads/originals/...` risponda 404.
4. Sostituire `Math.random()` con CSPRNG per i codici display; aggiungere rate limit alle GET sensibili.
5. Verificare campagna/scena nell’idempotenza di `applySceneAction`.
6. Correggere `Dialog` (doppio `closed`) e aggiungere test.
7. Allineare `display` e `screen-preview` con un `DisplayLayerView` condiviso; coprire layer `map`/`initiative` in E2E.
8. Decidere la precedenza `fog.base` vs visione e testarla.

### P1 — debito strutturale

9. Estrarre i mixin CSS e migrare `styles.scss`, `dm-shell`, `actor-sheet`, `actor-wizard`, `character-wizard`, `player`, `dice-overlay`, `display`, `screen-preview`, `map-editor`.
10. Creare `core/http-error.ts`, `core/labels.ts` (abilità/skill/sensi/taglie), `shared/lib/scene/geometry.ts` (pointInPolygon/distanceToSegment).
11. Spostare in `shared` le regole del wizard: `pcAbilityScores`, `preparedCasters`, `maxSpellLevel`, `spentCopper`, `sizeCells`.
12. Creare `RealtimeService` e migrare display + presenza DM + azioni.
13. Uniformare le route server: helper `registerDmRoutes` con `preHandler`, `idParamsSchema` condiviso, `requireCampaign`.
14. Uniformare `messageFor` e i messaggi d’errore; introdurre `ErrorHandler` + toast.
15. Risolvere `defaultTerrain`, `--text-base`, `tsconfig` client, `no-restricted-imports`, budget, `max-len`.

### P2 — manutenzione

16. Spezzare `DmShellPage` in store + componenti di sezione.
17. Spezzare `SceneCanvasComponent` in renderer/servizi.
18. Spezzare `ActorSheetPage`.
19. Sostituire la history dell’editor mappa con comandi/patch.
20. Aggiungere coverage e test sui componenti critici.
21. Aggiornare `PLAN.md` o il codice per Signal Forms/`resource()`/`@defer`.

---

## Appendice A — comandi usati

```text
npm run typecheck   # OK
npm run lint        # OK
npm run test        # OK: 120 shared + 65 server + 8 client
```

Il report è statico: non sono stati eseguiti profiling runtime, test di carico o pentest.

## Appendice B — file chiave citati

- `client/src/app/features/dm/dm-shell.page.ts` / `.html`
- `client/src/app/features/scene/scene-canvas.component.ts`
- `client/src/app/features/actor/actor-sheet.page.ts` / `.scss`
- `client/src/app/features/character/character-wizard.page.ts` / `character-wizard.store.ts`
- `client/src/app/features/maps/map-editor.page.ts` / `map-editor-canvas.component.ts`
- `client/src/app/core/action.store.ts`, `scene.store.ts`, `dice.store.ts`, `auth.service.ts`
- `client/src/app/components/dialog/*`
- `client/src/styles.scss`, `client/src/styles/_layout.scss`, `_tokens.scss`, `_themes.scss`
- `server/src/actions/service.ts`, `server/src/program/service.ts`, `server/src/export/service.ts`
- `server/src/realtime/hub.ts` / `routes.ts`
- `server/src/actors/pc-service.ts`, `token-sync.ts`, `server/src/db/*.repository.ts`
- `shared/src/schemas/*.ts`, `shared/src/lib/scene/*.ts`, `shared/src/lib/sheet/*.ts`
- `PLAN.md`, `eslint.config.js`, `tsconfig.base.json`, `client/tsconfig.json`, `client/angular.json`

---

## 11. Stato implementazione — 1 novembre 2026

Questa sezione traccia le correzioni applicate dopo la review iniziale.

### Completate

- `alignment` del PG: `buildPcStatblock` accetta e persiste il campo; `createPc` lo passa; test in `shared/src/lib/sheet/build-statblock.spec.ts`.
- Export/import: `playerNotes` opzionali con flag `includePrivateNotes`, XP dei PG preservati, import in transazione e remap selettivo solo sui campi `*Id`.
- Originali upload non più serviti: `allowedPath` esclude `originals/`; test in `server/test/api.spec.ts`.
- Codici display con `randomInt` (CSPRNG); GET `/api/v1/displays/...` non più esente dal rate limit.
- Idempotenza `applySceneAction` verificata anche per campagna/scena.
- Dialog: niente doppio `closed`, `aria-labelledby` sul titolo; `aria-pressed`/`expanded`/`controls` inoltrati da `app-button`.
- Anteprima e schermo reale condividono `DisplayLayerComponent`: layer `map` e `initiative` coerenti.
- Fog: la base `revealed` non viene più sovrascritta dalla visione automatica.
- `token.update`: l’inverso rimuove davvero i campi opzionali (`null` = assente); test in `actions.spec.ts`.
- `defaultTerrain`/`defaultGridConfig` allineati; `visionEnabled` con un solo default.
- Encoding corretto in `actions.ts`; lingua `Comune` nel wizard mostri.
- UUID v7 condiviso (`newId`) usato dal client e dal server per le nuove entità.
- Geometria comune (`pointInPolygon`, `distanceToSegment`) in `shared`, usata da fog, vision, scene canvas e map editor.
- `SIZE_CELLS`/`sizeCells`, `pcAbilityScores`, `isPreparedCaster`, `maxSpellLevelForClass`, `equipmentCostCopper`, `hpMaxFor` condivisi.
- Label UI (abilità, skill, taglie, sensi, velocità) in `core/labels.ts`; helper errori in `core/http-error.ts`.
- Route server: `idParamsSchema` e `dmPreHandler` condivisi; `envelope` WebSocket in un unico modulo.
- CSS: `_mixins.scss` e `_functions.scss`; `styles.scss`, scheda, wizard, dado, console, player e canvas migrati sui mixin; display con stili condivisi.
- `--text-base` e i token display/editor/overlay aggiunti.
- `client/tsconfig.json` estende `tsconfig.base.json` (`exactOptionalPropertyTypes` e `verbatimModuleSyntax` attivi); lint con `no-explicit-any`, `no-floating-promises`, `no-misused-promises` e `no-restricted-imports` per i confini.
- `@angular/forms` rimosso dalle dipendenze client; budget Angular 700 kB / 1.2 MB.
- `ActionStore`: cache `seen` con TTL e guard anti-sovrapposizione; `persistPanels`/`restorePanels` gestiscono storage assente; `beforeunload` con `returnValue`; `window.confirm` sostituito da dialog; input numerici editor protetti da `NaN`; numero sessione calcolato con `MAX(number)`.
- Test: 126 shared, 66 server, 8 client; build di produzione verde.

### Rinviate (richiedono un refactor dedicato)

- Split di `DmShellPage`, `SceneCanvasComponent` e `ActorSheetPage` in store/componenti più piccoli.
- `RealtimeService` unico: restano polling azioni e due WebSocket (display + presenza DM).
- `token-sync` continua a scrivere `SceneState` fuori da `action_log`: va modellato come azione o documentato come eccezione.
- `PUT /scenes/:id/state` resta come endpoint di recovery usato dai test.
- Storia editor mappa con 50 cloni completi: valutare comandi/patch o un limite dinamico.
- `projectDisplay` ha ancora N+1 residui tra layer/display; la cache locale copre i token della singola scena.
- Signal Forms, `resource()`, `@defer`, container query e toast/`ErrorHandler` non sono stati introdotti: sono scelte di prodotto/architettura, non patch isolate.
- `max-len` resta 120 (il piano indica 110) per non generare un diff di formattazione enorme; da allineare in un commit dedicato.
