# ISSUE 01 — Share della scheda personaggio tramite QR code

**Stato:** piano approvato, da implementare
**Ambito:** client (`@dnd-vtt/client`), documentazione, configurazione LAN
**Stima:** ~1,5 giornate (TDD incluso)
**Dipendenze:** `qrcode-generator@2.0.4` (MIT, zero dipendenze runtime)

---

## 1. Contesto

Il VTT gira in rete locale e la console DM è raggiungibile via IP + porta
(es. `http://192.168.1.50:3000`). Obiettivo: dal pulsante **"Condividi scheda"**
della scheda personaggio, mostrare un **QR code** che apra sul telefono la
scheda giocatore, senza login e senza esporre la console DM.

La condivisione esiste già:

- route DM-only `/dm/campaigns/:campaignId/actors/:actorId/sheet`
  (contiene `dmNotes`: **non** va messa nel QR);
- route pubblica `/play/:token` con token revocabile, editing on/off e DTO
  senza note private (`server/src/players/routes.ts`,
  `client/src/app/features/player/player.page.ts`);
- `createPlayerLink()` in `ActorSheetPage` chiama il server, che costruisce
  l'URL da `env.publicUrl` (`server/src/players/service.ts`).

Il QR è quindi solo un **renderer dell'URL già restituito**. Questo è anche
quanto previsto da `PLAN.md` (D21 e §1740: "QR generato lato client dall'URL
costruita su `PUBLIC_URL`").

### 1.1 Cosa c'è nello StackBlitz di riferimento

Progetto: <https://stackblitz.com/edit/pure-javascript-custom-components?file=index.ts>

Il QR non è una feature del web component: è un **port TypeScript di
`qrcode.js` di Kazuhiko Arase** (MIT, 2009), lo stesso motore usato da quasi
tutte le librerie QR in JavaScript.

| File | Ruolo |
|---|---|
| `components/barcode/factories/QRCode/*.ts` (9 file, ~1.300 righe) | generatore: `QRCode`, `QRUtil`, `QRRSBlock`, `QRPolynomial`, `QRBitBuffer`, `QR8bitByte`, `QRMath`, `QRMode`, `QRMaskPattern`, `QRErrorCorrectLevel` |
| `components/barcode/factories/qrcode.ts` | factory: `new QRCode(typeNumber, errorCorrectionLevel)` → `addData(url)` → `make()` → matrice moduli |
| `components/barcode/app-barcode.component.ts` + template | rendering: un `<span>` per modulo in CSS grid, quiet zone di 4 moduli per lato (`moduleCount + 8`), dimensioni in mm |

API effettiva:

```ts
const qr = new QRCode(0 /* versione automatica */, QRErrorCorrectLevel.M);
qr.addData('http://192.168.1.50:3000/play/<token>');
qr.make();
qr.moduleCount;                  // es. 33 per versione 4
qr.isDark(row, col);             // matrice
qr.getModulesBitsWithPaddings(); // matrice + bordo bianco
```

Limiti del codice così com'è:

- stile vecchio (`var`, campi `#modules = null`) che non compila con lo
  `strict` + `noUncheckedIndexedAccess` di questo repo;
- `QR8bitByte` usa `charCodeAt` senza UTF-8: sufficiente per un URL ASCII,
  non per contenuti arbitrari;
- rendering con **attributi `style` inline** e CSS grid in mm: incompatibile
  con la CSP a nonce e con la regola "niente attributi `style`" del progetto;
- nessun entry point/tipi: è codice di esempio, non un pacchetto.

**Decisione:** non vendorizzare. Si usa `qrcode-generator` (stesso algoritmo
Arase, mantenuto, MIT, ESM + tipi) e si scrive il renderer SVG in casa.

---

## 2. Decisioni

| # | Decisione | Motivazione |
|---|---|---|
| D1 | `qrcode-generator@2.0.4` + rendering SVG nostro | MIT, zero dipendenze, tipi inclusi, CSP-safe, stesso algoritmo del riferimento |
| D2 | QR solo alla creazione + **"Rigenera link e QR"** con conferma | il token è salvato solo come hash SHA-256: non è recuperabile dopo un reload; ruotarlo invalida il link precedente |
| D3 | Estrarre `PlayerLinkPanel` | `ActorSheetPage` ha ~900 righe (TODO R3); il pannello è autonomo e testabile |
| D4 | Nessun endpoint server nuovo | `PUBLIC_URL` resta l'unica fonte di verità e l'allowlist degli `Host` non viene allargata |
| D5 | Il QR contiene **solo** l'URL `/play/<token>` | mai dati della scheda, mai note private, nessun servizio QR esterno |
| D6 | Metodo **TDD** (red → green → refactor) | ogni comportamento del piano nasce da un test che lo nomina |

---

## 3. Vincolo critico: IP + porta in LAN

Generare il QR non basta. Se `PUBLIC_URL` resta `http://localhost:3000`:

1. il QR contiene un URL che il telefono non raggiunge;
2. il server rifiuta le richieste con `Host: 192.168.x.x` con
   `421 Host non consentito` (`server/src/app.ts`, `allowedHosts` in
   `server/src/config/env.ts`).

Configurazione corretta (già documentata in `docs/deploy-docker.md`):

```dotenv
HOST=0.0.0.0
PORT=3000
PUBLIC_URL=http://192.168.1.50:3000        # IP LAN reale del server
ALLOWED_ORIGINS=http://192.168.1.50:3000
DM_PASSWORD=almeno-12-caratteri             # obbligatoria fuori dal loopback
```

Requisiti operativi:

- porta TCP 3000 aperta solo sul profilo **Privato** del firewall Windows;
- telefono sulla stessa subnet, senza isolamento client (guest WiFi/hotspot
  possono rompere la raggiungibilità);
- IP statico o prenotazione DHCP: se l'IP cambia, i QR già condivisi smettono
  di funzionare;
- con Docker Compose `HOST=0.0.0.0` è già forzato (`docker-compose.yml`);
- **dev mode**: `ng serve` gira su `:4200` e fa proxy a `:3000`; l'URL generata
  da `PUBLIC_URL` punta a `:3000`, dove senza `client/dist` non c'è la SPA.
  Per provare dal telefono usare build o container, non `ng serve`;
- fallback sempre disponibile: copiare/digitare l'URL mostrato accanto al QR.

Nessun endpoint che elenca gli IPv4 LAN: potrebbe solo suggerire l'IP, non
aggirare l'allowlist degli `Host`, quindi non elimina la configurazione.

---

## 4. Design tecnico

### 4.1 Dipendenza

```powershell
npm install qrcode-generator@2.0.4 -w @dnd-vtt/client
```

- `.npmrc` ha `save-exact=true`, quindi la versione resta pinnata;
- peso atteso: ~50 kB raw / ~12 kB gzip, dentro il budget Angular
  (warning 700 kB, errore 1.2 MB);
- i tipi usano `export =` con `verbatimModuleSyntax` attivo: il primo
  `npm run typecheck` conferma `import qrcode from 'qrcode-generator'`.
  Se TS protesta, si aggiunge un piccolo wrapper `.d.ts` locale, senza
  impatto runtime.

### 4.2 `QrCode` component

`client/src/app/components/qr-code/` (stesso pattern di `components/button`
e `components/dialog`):

- `qr-code.ts` — standalone, `OnPush`:
  - `value = input.required<string>()`
  - `size = input(160)`
  - `label = input('QR code')`
- `qr-matrix.ts` — funzione pura
  `qrMatrix(value, margin = 4): { size: number; path: string }`:
  - `qrcode(0, 'M')` → `addData(value)` → `make()`;
  - costruisce il path SVG unendo i rettangoli verticali consecutivi
    (un solo `<path>` = poche centinaia di byte);
  - include la quiet zone di 4 moduli per lato.
- `qr-code.html`:
  - `<svg [attr.viewBox]="..." role="img" [attr.aria-label]="label()">`;
  - `<rect>` bianco + `<path>` nero, `shape-rendering="crispEdges"`;
  - **nessun attributo `style`** (solo attributi SVG), compatibile con la CSP;
  - colori fissi bianco/nero: il QR deve restare scansionabile anche con tema
    scuro.
- `qr-code.scss`: `display: block; max-width: 100%;`.

### 4.3 `PlayerLinkPanel`

`client/src/app/features/actor/player-link-panel.component.ts|html|scss`
(naming coerente con `screen-preview.component.ts`).

Sposta da `ActorSheetPage`:

- signal `playerUrl`, `playerEditing`, `playerLinkBusy`, `playerLinkError`;
- metodi `createPlayerLink()`, `togglePlayerEditing()`;
- lettura iniziale `players.getLink(actorId)` oggi dentro `load()`;
- blocco template `.player-link` (`actor-sheet.page.html`, righe ~118-137);
- stili `.player-link` (`actor-sheet.page.scss`, righe ~328-346).

Comportamento:

| Stato | UI |
|---|---|
| nessun link attivo | pulsante primario **"Condividi scheda"** |
| link attivo, URL non in memoria (dopo reload) | "Link attivo" + **"Rigenera link e QR"** con `app-dialog` di conferma che avvisa dell'invalidazione del link precedente |
| URL appena creato | QR + URL read-only + "Copia link" + "Rigenera link e QR" + toggle matita |

Dettagli:

- il pulsante "Condividi scheda" esce dall'header
  (`actor-sheet.page.html:42-44`): l'azione vive nel pannello, così non ci sono
  due fonti di stato;
- il pannello è renderizzato da `ActorSheetPage` solo per i `pc`:
  `@if (pc() !== null) { <app-player-link-panel [actorId]="actorId()" /> }`;
- avviso non bloccante se `new URL(url).hostname` è
  `localhost`/`127.0.0.1`/`::1`/`0.0.0.0`, o se differisce dall'host da cui il
  DM sta aprendo la console: *"Il link usa PUBLIC_URL e il telefono potrebbe
  non raggiungerlo: imposta l'IP LAN del server."*;
- il token non viene mai persistito lato browser né in chiaro nel DB.

### 4.4 Documentazione

`.env.example` e `docs/deploy-docker.md`, nuova sezione
**"QR e link giocatore"**: configurazione `HOST`/`PUBLIC_URL`/
`ALLOWED_ORIGINS`, firewall, stessa subnet, IP statico, limite di `ng serve`,
fallback manuale, comportamento dopo reload (rigenerazione = rotazione).

---

## 5. Metodo TDD

Regole del ciclo:

1. **un solo comportamento per ciclo**: prima lo spec, poi l'implementazione
   minima;
2. il test deve fallire **per il motivo giusto** (asserzione mancante o modulo
   assente, non per un typo);
3. vietato codice di produzione non coperto da un test già rosso;
4. **refactor solo a verde**, con i test ri-eseguiti dopo ogni passaggio;
5. gate a ogni ciclo: `lint` + `typecheck` del workspace toccato; suite
   completa solo a fine giornata;
6. test deterministici: niente IP reali, niente clock, niente snapshot fragili.

### Ciclo 0 — Dipendenza (pre-requisito, non test-first)

```powershell
npm install qrcode-generator@2.0.4 -w @dnd-vtt/client
npm run typecheck -w @dnd-vtt/client
```

Serve solo a verificare che l'import passi con `verbatimModuleSyntax`. Se
fallisce, si aggiunge un wrapper `.d.ts` locale **prima** del ciclo 1.

### Ciclo 1 — `qr-matrix` (unit, funzione pura)

Spec: `client/src/app/components/qr-code/qr-matrix.spec.ts` (scritto per
primo, rosso).

| Test (nome in italiano, coerente col repo) | Asserzione |
|---|---|
| `genera una matrice quadrata con quiet zone` | `size % 4 === 1`; tutti i moduli del bordo esterno chiari |
| `sceglie la versione automaticamente` | URL di 62 caratteri (IP LAN + porta + token da 32) → `size === 33` (versione 4/M); URL di 120 caratteri → `size > 33` |
| `produce un path SVG non vuoto` | `path.startsWith('M')`, numero di sottopath > 0, coordinate dentro `0..size` |
| `include la quiet zone nel viewBox` | `viewBox === '0 0 N N'` con `N = size` |

Esecuzione mirata:

```powershell
cd client
npx ng test --watch=false --include="src/app/components/qr-code/qr-matrix.spec.ts"
```

Se `--include` non è supportato dal builder `@angular/build:unit-test`,
fallback: `npm test -w @dnd-vtt/client`.

Poi implementazione minima di `qr-matrix.ts`, quindi **refactor**
dell'algoritmo di merge dei moduli in rettangoli verticali con i test verdi.
Target: branch coverage del file ~100% (la coverage non è ancora configurata,
verifica manuale).

### Ciclo 2 — `QrCode` component (unit, DOM)

Spec: `client/src/app/components/qr-code/qr-code.spec.ts`, con `TestBed` come
`app.spec.ts`.

Test rossi, in ordine:

1. `renderizza un svg accessibile` → `role="img"`, `aria-label` = label input;
2. `disegna sfondo bianco e path nero` → `rect[fill="#fff"]`, `path[fill="#000"]`;
3. `rispetta la size richiesta` → `width`/`height` cambiano con l'input;
4. `ricalcola il QR quando cambia il valore` → `d` diverso tra due URL.

Solo dopo: template SVG con `shape-rendering="crispEdges"`, nessun attributo
`style`.

### Ciclo 3 — `PlayerLinkPanel` (unit, `PlayerService` mockato)

Spec: `client/src/app/features/actor/player-link-panel.component.spec.ts`.

Setup del test:

- mock di `PlayerService` con `vi.fn()` per `getLink`/`createLink`/`setEditing`;
- stub di `HTMLDialogElement.prototype.showModal`/`close` se jsdom non li
  implementa (da verificare al primo run);
- nessuna chiamata HTTP reale.

Test rossi, uno per comportamento:

| # | Test | Asserzione |
|---|---|---|
| 1 | `senza link mostra solo Condividi scheda` | bottone visibile, `svg` assente |
| 2 | `crea il link e mostra URL e QR` | `createLink(actorId)`, input URL valorizzato, `app-qr-code` presente |
| 3 | `con link esistente chiede Rigenera` | "Rigenera link e QR" visibile, nessun QR, toggle matita visibile |
| 4 | `annulla la rigenerazione` | click Rigenera → dialog aperto → Annulla → `createLink` non chiamato |
| 5 | `conferma la rigenerazione` | Conferma → `createLink` chiamato, nuovo URL, QR presente |
| 6 | `avvisa se l'URL non è raggiungibile` | host `localhost`/`127.0.0.1`/`0.0.0.0` → warning; host `192.168.x.x` → nessun warning |
| 7 | `mostra l'errore di creazione` | `createLink` reject → messaggio, `busy === false` |

Implementazione incrementale: test 1 → componente minimo; ogni test successivo
aggiunge un solo pezzo. Il refactor consiste nel rimuovere signal e metodi da
`ActorSheetPage` e sostituirli con
`<app-player-link-panel [actorId]="actorId()" />`.

### Ciclo 4 — Integrazione `ActorSheetPage` (regressione)

Prima della modifica, il test E2E esistente `client/e2e/phase-8.spec.ts`
("condivide la scheda, modifica note e HP…") deve restare verde: è la rete di
sicurezza dell'estrazione. Dopo l'integrazione:

```powershell
npm test -w @dnd-vtt/client
npm run test:e2e -w @dnd-vtt/client -- e2e/phase-8.spec.ts
```

Il `PlayerService` mockato copre i rami; l'E2E copre il wiring reale (route,
HTTP, token).

### Ciclo 5 — E2E QR e rotazione (test prima)

Nuovo file `client/e2e/phase-8-qr.spec.ts`, scritto e fatto fallire **prima**
di agganciare il componente alla scheda.

| Test | Passi | Asserzione |
|---|---|---|
| `mostra il QR della scheda condivisa` | crea PC → apri scheda → "Condividi scheda" | `svg[role="img"]` visibile, input URL contiene `/play/`, `page.goto(url)` apre la scheda giocatore |
| `la rigenerazione invalida il link precedente` | condividi → salva URL → Rigenera → Conferma | nuovo URL ≠ vecchio; `goto(vecchio)` → "Scheda non trovata" |
| `avvisa quando PUBLIC_URL è loopback` | apri scheda | warning visibile, perché l'ambiente E2E usa `PUBLIC_URL=http://127.0.0.1:3100` |

Esecuzione (richiede i bundle, il `webServer` E2E usa `server/dist`):

```powershell
npm run build
cd client
npx playwright test e2e/phase-8-qr.spec.ts
```

Il terzo test è voluto: fissa il comportamento nell'ambiente E2E e impedisce
che il warning venga rimosso per errore. Il caso "host LAN → nessun warning"
resta coperto dallo unit test del ciclo 3.

### Ciclo 6 — Documentazione (senza test)

`.env.example`, `docs/deploy-docker.md`, sezione "QR e link giocatore".
Verifica finale con `npm run check`.

---

## 6. Matrice di copertura del piano

| Comportamento | Livello | File di test |
|---|---|---|
| Matrice QR, versione automatica, quiet zone | unit puro | `qr-matrix.spec.ts` |
| Rendering SVG accessibile | unit DOM | `qr-code.spec.ts` |
| Stati del pannello, conferma, warning, errori | unit DOM | `player-link-panel.component.spec.ts` |
| Estrazione senza regressioni | E2E | `phase-8.spec.ts` |
| QR visibile, link valido, rotazione | E2E | `phase-8-qr.spec.ts` |

---

## 7. File toccati

| File | Tipo |
|---|---|
| `client/package.json`, `package-lock.json` | dipendenza `qrcode-generator` |
| `client/src/app/components/qr-code/qr-matrix.ts` | nuovo |
| `client/src/app/components/qr-code/qr-matrix.spec.ts` | nuovo |
| `client/src/app/components/qr-code/qr-code.ts|html|scss` | nuovo |
| `client/src/app/components/qr-code/qr-code.spec.ts` | nuovo |
| `client/src/app/features/actor/player-link-panel.component.ts|html|scss` | nuovo |
| `client/src/app/features/actor/player-link-panel.component.spec.ts` | nuovo |
| `client/src/app/features/actor/actor-sheet.page.ts` | rimozione stato/metodi link |
| `client/src/app/features/actor/actor-sheet.page.html` | rimozione blocco link, inserimento pannello |
| `client/src/app/features/actor/actor-sheet.page.scss` | rimozione stili `.player-link` |
| `client/e2e/phase-8-qr.spec.ts` | nuovo |
| `.env.example` | commenti `PUBLIC_URL`/LAN |
| `docs/deploy-docker.md` | sezione QR |

---

## 8. Criteri di accettazione

- Il QR contiene **solo** `http(s)://<PUBLIC_URL>/play/<token>`, mai dati della
  scheda o note private.
- Scansionabile da telefono in LAN con la configurazione documentata; nessuna
  chiamata a servizi QR esterni.
- Nessun attributo `style` inline, nessuna violazione CSP.
- Dopo reload il QR è ottenibile solo ruotando il link, con conferma esplicita
  che il link precedente viene invalidato.
- Fallback sempre visibile: URL copiabile/digitabile accanto al QR.
- `ActorSheetPage` scende di ~70 righe e il pannello è testabile in isolamento.
- Ogni comportamento elencato nella matrice ha un test che lo nomina.
- Nessun test scritto dopo l'implementazione, tranne quelli di regressione già
  esistenti.
- Test del pannello senza rete, senza dialog nativo reale e senza dipendenza
  dall'IP della macchina.

---

## 9. Gate finali

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run audit
```

In alternativa, il gate aggregato:

```powershell
npm run check
```

---

## 10. Rischi residui

| Rischio | Mitigazione |
|---|---|
| Telefono su hotspot/guest WiFi con isolamento client | messaggio chiaro nel pannello + fallback URL manuale |
| Cambio IP del server: i QR già condivisi smettono di funzionare | IP statico/prenotazione DHCP documentati |
| QR che espone il token in foto/cronologia | token revocabile e ruotabile; QR senza dati della scheda |
| `PUBLIC_URL` loopback dimenticato | warning in UI + documentazione + test E2E dedicato |
| `qrcode-generator` non digerito da `verbatimModuleSyntax` | wrapper `.d.ts` locale nel ciclo 0 |
| jsdom senza `HTMLDialogElement.showModal` | stub nel setup dello spec del pannello |
