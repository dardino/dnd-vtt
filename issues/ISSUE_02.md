# ISSUE 02 — Icone emoji nell'editor mappe e rework dei simboli esistenti

**Stato:** piano approvato, da implementare
**Ambito:** client (`@dnd-vtt/client`): `features/maps`, `features/dm`, `features/actor`,
`features/character`, shell e componenti condivisi
**Stima:** ~1 giornata (TDD incluso)
**Dipendenze:** nessuna (glifi emoji del font di sistema)

---

## 1. Contesto

L'editor mappe (`client/src/app/features/maps/map-editor.page.*`) mostra a
sinistra una colonna di strumenti solo testuali:

- `TOOL_LABELS` in `map-editor.page.ts` definisce `tool`, `label`, `hint` per
  dieci strumenti;
- il template li renderizza in `<nav class="editor__tools">` come bottoni
  `.editor__tool` con label e tooltip;
- sotto un divisore c'è il toggle **Griglia**, oggi anch'esso solo testuale;
- lo stato attivo è veicolato da bordo e sfondo `--color-accent`
  (`.editor__tool.is-active`).

Obiettivo principale: aggiungere **un'icona emoji per ogni voce** del menu,
senza introdurre librerie di icone, SVG o dipendenze.

Obiettivo secondario (stesso issue): **rework dei simboli già in uso** nel
client, sostituendo i glifi tipografici usati come icone con emoji. Oggi la UI
mescola simboli (`↖`, `⌁`, `◐`, `▭`, `✎`, `↶`, `✕`, `☾`) e un'unica emoji
(`🎲`): il risultato è incoerente. Il rework uniforma i controlli a icona.

Le emoji colorate sono **accettate come scelta di design**: non stonano con
l'interfaccia e non vanno desaturate, filtrate o forzate in monocromia.

### 1.1 Vincoli del progetto da rispettare

| Vincolo | Applicazione qui |
|---|---|
| Nessun attributo `style` inline / CSP-safe | icone come testo nel template, stili solo in SCSS |
| Design token | `--space-2`, `--text-md`, `--color-*` già usati dai file |
| BEM | `editor__tool-icon` e selettori esistenti, nessun rename |
| Accessibilità | icona decorativa `aria-hidden="true"`; nome accessibile dalla label o dall'`aria-label` esistente |
| E2E esistenti | `phase-9` usa `getByRole('button', { name: 'Muro', exact: true })` e `'Griglia'`: l'emoji **deve** essere `aria-hidden` per non cambiare il nome accessibile |
| Test con Vitest + `TestBed` | stile `character-wizard.page.spec.ts`, `dialog.spec.ts` |
| TDD | spec rossi prima dell'implementazione, refactor solo a verde |
| `max-len` 120 | template e costanti restano sotto soglia |

---

## 2. Decisioni

| # | Decisione | Motivazione |
|---|---|---|
| D1 | Emoji del font, nessuna dipendenza | richiesta esplicita, zero peso aggiuntivo, coerente con il `🎲` già presente |
| D2 | Icona accanto alla label, non al posto della label | si mantiene il nome accessibile e la leggibilità del menu |
| D3 | `icon` dentro `TOOL_LABELS` | un'unica fonte per tool, icona, label, hint; niente mappe parallele |
| D4 | Icona anche sul toggle **Griglia** | fa parte dello stesso menu; evita una voce visivamente diversa |
| D5 | Rework di **tutti i glifi usati come icone** nel client | elimina il mix simboli/emoji e allinea i controlli |
| D6 | I glifi dentro testo, numeri o formule **restano tipografici** | `×` nelle misure, `+/−` negli stepper, `→` nella prosa non sono icone |
| D7 | Emoji colorate accettate, nessun filtro/desaturazione | scelta esplicita: il colore non stona con il tema |
| D8 | Niente registro icone centralizzato | il repo usa già glifi inline (`🎲`); un registry sarebbe indirection non richiesta |
| D9 | `aria-hidden` sulle emoji decorative, `aria-label`/`title` invariati | nessuna regressione sui nomi accessibili né sugli E2E |
| D10 | Metodo **TDD** (red → green → refactor) | ogni comportamento nasce da un test che lo nomina |

---

## 3. Mappa icone

### 3.1 Editor mappe (nuove icone)

| Tool (`EditorTool`) | Etichetta | Emoji |
|---|---|---|
| `select` | Seleziona | 🖱 |
| `wall` | Muro | 🧱 |
| `freehand` | Tratto | ✏️ |
| `door` | Porta | 🚪 |
| `window` | Finestra | 🪟 |
| `lowWall` | Muro basso | 🪵 |
| `eraser` | Gomma | 🧽 |
| `light` | Luce | 🔦 |
| `spawn` | Mostro | 👹 |
| `start` | Partenza | 🏁 |
| — (toggle griglia) | Griglia | 🔲 |

Note:

- `wall` (🧱) e `lowWall` (🪵) restano distinti;
- il toggle griglia non è un `EditorTool`: l'icona va scritta direttamente nel
  template;
- le emoji del menu sono `aria-hidden`: il nome accessibile resta la label,
  quindi `phase-9` continua a funzionare con `name: 'Muro', exact: true`.

### 3.2 Rework dei simboli esistenti

**Regola:** un glifo che da solo rappresenta un comando o un indicatore diventa
emoji; un glifo dentro testo, numeri o formule resta tipografia.

#### Conversioni

Percorsi relativi a `client/src/app/`.

| File | Posizione | Prima | Dopo |
|---|---|---|---|
| `features/dm/dm-shell.page.html` | toolbar: seleziona | `↖` | 🖱 |
| `features/dm/dm-shell.page.html` | toolbar: misura | `⌁` | 📏 |
| `features/dm/dm-shell.page.html` | toolbar: griglia | `#` | 🔲 |
| `features/dm/dm-shell.page.html` | toolbar: zoom avanti | `+` | ➕ |
| `features/dm/dm-shell.page.html` | toolbar: zoom indietro | `−` | ➖ |
| `features/dm/dm-shell.page.html` | toolbar: adatta mappa | `⤢` | 🖼 |
| `features/dm/dm-shell.page.html` | toolbar: fog rivela | `◐` | 👁 |
| `features/dm/dm-shell.page.html` | toolbar: fog nascondi | `◑` | 🌫 |
| `features/dm/dm-shell.page.html` | toolbar: fog rettangolo | `▭` | ⬜ |
| `features/dm/dm-shell.page.html` | toolbar: fog lasso | `⬠` | 🎯 |
| `features/dm/dm-shell.page.html` | toolbar: disegno | `✎` | ✏️ |
| `features/dm/dm-shell.page.html` | toolbar: esporta PNG | `⭳` | 📤 |
| `features/dm/dm-shell.page.html` | toolbar: annulla | `↶` | ↩️ |
| `features/dm/dm-shell.page.html` | toolbar: ripeti | `↷` | ↪️ |
| `features/dm/dm-shell.page.html` | toolbar: impostazioni | `⚙` | ⚙️ |
| `features/dm/dm-shell.page.html` | lista scene: attiva scena | `▶` | ▶️ |
| `features/dm/dm-shell.page.html` | lista scene: modifica mappa | `✎` | ✏️ |
| `features/dm/dm-shell.page.html` | aggiungi attore alla mappa | `+` | ➕ |
| `features/dm/dm-shell.page.html` | slot attore vuoto | `+` | ➕ |
| `features/dm/dm-shell.page.html` | token visibile / nascosto | `◉` / `◌` | 👁 / 🙈 |
| `features/dm/dm-shell.page.html` | rimuovi token | `✕` | 🗑 |
| `app.html` | toggle tema | `☾` / `☀` | 🌙 / ☀️ |
| `components/dialog/dialog.html` | chiudi dialog | `×` | ✖️ |
| `components/toast/toast.html` | chiudi notifica | `×` | ✖️ |
| `features/actor/actor-sheet.page.html` | link indietro | `←` | ⬅️ |
| `features/actor/actor-sheet.page.html` | pulsante modifica | `✎` | ✏️ |
| `features/actor/actor-wizard.page.html` | link indietro | `←` | ⬅️ |
| `features/maps/map-editor.page.html` | link indietro | `←` | ⬅️ |
| `features/character/character-wizard.page.html` | step completato | `✓` | ✅ |

`🎲` (tira dadi) è già emoji: resta invariato.

I **chevron degli accordion restano `▾` / `▸`**: la coppia triangolare già in
uso è coerente e preferita all'alternativa emoji, quindi non viene toccata.

#### Cosa resta tipografico (e perché)

| Glifo | Dove | Motivo |
|---|---|---|
| `▾` / `▸` | chevron degli accordion (`dm-shell.page.html`, 9 punti) | scelta estetica: la coppia triangolare attuale è già coerente e resta invariata |
| `×` | dimensioni (`1024 × 512 px`), badge condizione (`{{ name }} ×`) | moltiplicazione / simbolo dentro testo, non icona isolata |
| `+` / `−` | stepper `mini-button` della scheda, PF `+5`/`−5` | controlli numerici compatti: il glifo è l'operazione, non un'icona |
| `→` | prosa e log (`Livello 3 → 4`, risultati dado) | punteggiatura, non controllo |
| `·`, `…`, `–`, `—`, virgolette, `‹ ›`, `d20` | testi e marchio | tipografia |

#### Dettagli di accessibilità

- dove l'emoji è l'unico contenuto di un bottone (toolbar scena, token, zoom),
  restano `aria-label` e `title` esistenti: il testo emoji non partecipa al nome
  accessibile;
- dove l'emoji accompagna una label (menu mappe, link indietro, pulsante
  modifica) va avvolta in `<span aria-hidden="true">`, così il nome accessibile
  non cambia;
- i chevron degli accordion restano `▾` / `▸` nei loro span `aria-hidden`,
  invariati;
- il check dello step ha già `aria-label="completato"`.

---

## 4. Design tecnico

### 4.1 `map-editor.page.ts`

Estendere il tipo e i dati:

```ts
const TOOL_LABELS: Array<{ tool: EditorTool; icon: string; label: string; hint: string }> = [
  { tool: 'select', icon: '🖱', label: 'Seleziona', hint: 'Seleziona e sposta elementi' },
  // ...
];
```

Nessuna esportazione: la costante resta privata al file, come oggi.

### 4.2 `map-editor.page.html`

Nel `@for` dei tool, icona prima della label:

```html
<span class="editor__tool-icon" aria-hidden="true">{{ entry.icon }}</span>
<span>{{ entry.label }}</span>
```

Stesso markup nel bottone **Griglia**, con `🔲` e `aria-hidden="true"`.
Invariati: `[title]="entry.hint"`, `[class.is-active]`,
`(click)="setTool(...)"`, `aria-label` della `nav`.

### 4.3 `map-editor.page.scss`

```scss
&__tool {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  // resto invariato: padding, border, colore, text-align, cursor, :hover, .is-active
}

&__tool-icon {
  flex: none;
  width: 1.1rem;
  font-size: var(--text-md);
  line-height: 1;
  text-align: center;
}
```

Il media query ≤980px (menu orizzontale) non cambia: icone + label restano su
una riga.

### 4.4 Rework dei template

Sostituzioni della tabella 3.2, senza modifiche alla logica:

- `dm-shell.page.html`: toolbar scena, lista scene, token, slot attori; i
  chevron degli accordion restano invariati; nessun cambio a signal/metodi;
- `app.html`: icona tema;
- `dialog.html`, `toast.html`: glifo di chiusura;
- `actor-sheet.page.html`, `actor-wizard.page.html`, `map-editor.page.html`:
  frecce indietro e matita;
- `character-wizard.page.html`: check di step completato.

### 4.5 Ritocchi di dimensione (SCSS)

Le emoji hanno metriche diverse dai glifi tipografici: senza ritocchi
risulterebbero troppo piccole o tagliate.

| Selettore | File | Ritocco |
|---|---|---|
| `.tool` | `dm-shell.page.scss` | `font-size: 1rem` (il mixin `icon-button` usa `--text-xs`) |
| `.icon-button` | `dm-shell.page.scss` | `font-size: 0.95rem` |
| `.token-row__icon` | `dm-shell.page.scss` | `font-size: var(--text-sm)` |
| `.dialog__close` | `dialog.scss` | `line-height: 1` |
| `.toast__close` | `toast.scss` | `line-height: 1` |
| `.editor__tool-icon` | `map-editor.page.scss` | vedi 4.3 |

Nessun filtro, nessuna desaturazione, nessun `color` applicato alle emoji.

---

## 5. Metodo TDD

Regole del ciclo:

1. un comportamento per ciclo: prima lo spec, poi l'implementazione minima;
2. il test deve fallire per il motivo giusto (glifo assente o vecchio simbolo),
   non per un errore di setup;
3. vietato codice di produzione non coperto da un test già rosso, salvo le
   sostituzioni puramente tipografiche elencate al ciclo 5 (coperte da E2E e
   controllo visivo);
4. refactor solo a verde, con la suite rieseguita;
5. gate a ogni ciclo: `lint` + `typecheck` del client; suite completa a fine
   lavoro;
6. test deterministici: nessuna rete reale negli unit test, nessun IP/clock.

### Ciclo 1 — Spec dell'editor mappe (Red)

Nuovo file `client/src/app/features/maps/map-editor.page.spec.ts`. Oggi
`MapEditorPage` non ha test unitari (gap segnalato in `CODE_REVIEW.md` §test).

Setup:

- `TestBed.configureTestingModule({ imports: [MapEditorPage], providers: [...] })`
  con stub di `MapService`, `AssetService`, `ActorService`,
  `SrdCatalogService`, `Router`, come in `character-wizard.page.spec.ts`;
- mappa fixture con `emptyMapDocument('Mappa test', null, 700, 700)` di
  `@dnd-vtt/shared` più `id`, `campaignId`, `version`, `createdAt`, `updatedAt`;
  `imageAssetId: null` così `MapEditorCanvasComponent` non viene istanziato
  (niente Konva in jsdom);
- `fixture.componentRef.setInput('mapId', MAP_ID)`, `detectChanges()`,
  `await fixture.whenStable()`; il toolbar è dentro `@if (doc(); as document)`,
  quindi il documento deve essere caricato prima delle asserzioni.

Test rossi, in ordine:

| # | Test | Asserzione |
|---|---|---|
| 1 | `mostra un'icona decorativa accanto a ogni strumento` | 10 bottoni tool + 1 griglia; ognuno ha `.editor__tool-icon` con testo non vuoto e `aria-hidden="true"` |
| 2 | `mantiene le etichette testuali per l'accessibilità` | il `textContent` di ogni bottone contiene la label attesa (e `Griglia` per il toggle) |
| 3 | `usa un'icona diversa per ogni strumento` | set delle icone con cardinalità pari al numero di bottoni |
| 4 | `attiva lo strumento al click mantenendo l'icona` | click su `wall` → `tool() === 'wall'`, `.is-active` presente, icona ancora nel DOM |
| 5 | `la griglia resta un toggle con icona` | click sul toggle → `showGrid()` invertito, icona presente |

Esecuzione Red:

```powershell
npm test -w @dnd-vtt/client
```

Falliscono 1–3 e 5 (nessuna icona); il 4 fallisce sull'asserzione dell'icona.

### Ciclo 2 — Editor mappe (Green)

1. aggiungere `icon` a `TOOL_LABELS` con la mappa 3.1;
2. inserire gli `<span class="editor__tool-icon" aria-hidden="true">` nel
   template (tool + griglia);
3. aggiornare `.editor__tool` / aggiungere `.editor__tool-icon` in SCSS.

Rieseguire lo spec fino a verde.

### Ciclo 3 — Componenti condivisi (Red → Green)

Spec da estendere/creare **prima** delle sostituzioni:

| File | Test aggiunto | Asserzione |
|---|---|---|
| `app.spec.ts` | `mostra l'emoji del tema attivo` | con `ThemeService.set('dark')` il toggle contiene 🌙; con `'light'` contiene ☀️; `aria-label` invariato |
| `dialog.spec.ts` | `chiude con l'emoji e mantiene l'etichetta` | `.dialog__close` contiene ✖️ e ha `aria-label="Chiudi"` |
| `components/toast/toast.spec.ts` (nuovo) | `chiude la notifica con l'emoji` | dopo `ToastService.show(..., 0)`, `.toast__close` contiene ✖️, `aria-label="Chiudi notifica"`, click rimuove il toast |

Poi implementare le sostituzioni in `app.html`, `dialog.html`, `toast.html`.

### Ciclo 4 — Rework console DM (Red → Green)

Spec E2E nuovo `client/e2e/ui-icons.spec.ts`, scritto e fatto fallire prima
delle sostituzioni in `dm-shell.page.html`.

Setup: `campaignId(request)` + `ensureScene(request, id)` + `openCampaign(page)`
(stessi helper di `client/e2e/fixtures.ts`).

| # | Test | Asserzione |
|---|---|---|
| 1 | `la toolbar scena usa emoji` | ogni `.scene-toolbar .tool` ha testo non vuoto e non contiene più `↖⌁◐◑▭⬠✎⭳↶↷` |
| 2 | `le icone mantengono i nomi accessibili` | `getByRole('button', { name: 'Misura distanza' })` visibile; `title` invariato |
| 3 | `i chevron degli accordion restano triangolari` | ogni `.accordion__chevron` contiene `▾` o `▸`, nessuna emoji |
| 4 | `il toggle tema usa le emoji` | il bottone `/Tema:/` contiene 🌙 o ☀️ |
| 5 | `la chiusura dialog usa l'emoji` | apri "Crea scena" → `.dialog__close` contiene ✖️ |

Esecuzione:

```powershell
npm run build
cd client
npx playwright test e2e/ui-icons.spec.ts
```

Il test 2 è la rete di sicurezza: impedisce che l'emoji finisca nel nome
accessibile e rompa gli E2E esistenti.

### Ciclo 5 — Rework residuo e refactor

Sostituzioni rimanenti (template-only, senza logica):

- frecce indietro e matita in `actor-sheet`, `actor-wizard`, `map-editor`;
- check di step in `character-wizard`;
- eventuali glifi sfuggiti, verificati con la scansione dei codepoint non-ASCII
  (`↖⌁⤢◐◑▭⬠✎⭳↶↷◉◌✕✓☾☀×←`).

Queste voci sono coperte da:

- E2E esistenti (`phase-4`, `phase-9`) per l'editor mappe;
- E2E nuovo del ciclo 4 per la console;
- controllo visivo per le emoji puramente decorative (check, frecce);
- nessuna nuova astrazione, nessun registro icone.

Refactor finale: rileggere il diff per coerenza BEM/token, verificare che non
ci siano attributi `style`, che i nomi accessibili siano invariati e che le
dimensioni siano leggibili a 1280px e ≤980px, tema chiaro e scuro.

---

## 6. Matrice di copertura del piano

| Comportamento | Livello | File di test |
|---|---|---|
| Icona presente e decorativa su ogni voce dell'editor mappe | unit DOM | `map-editor.page.spec.ts` |
| Label testuali e nomi accessibili preservati | unit DOM + E2E | `map-editor.page.spec.ts`, `phase-9.spec.ts` |
| Icone univoche e stato attivo | unit DOM | `map-editor.page.spec.ts` |
| Toggle griglia con icona | unit DOM | `map-editor.page.spec.ts` |
| Tema con emoji | unit DOM | `app.spec.ts` |
| Chiusura dialog/toast con emoji | unit DOM | `dialog.spec.ts`, `toast.spec.ts` |
| Toolbar e tema della console; chevron invariati | E2E | `client/e2e/ui-icons.spec.ts` |
| Frecce, matita, check di step | E2E esistenti + visivo | `phase-4.spec.ts`, `phase-9.spec.ts` |

---

## 7. File toccati

| File | Tipo |
|---|---|
| `client/src/app/features/maps/map-editor.page.spec.ts` | nuovo (TDD Red) |
| `client/src/app/features/maps/map-editor.page.ts` | modifica (`icon` in `TOOL_LABELS`) |
| `client/src/app/features/maps/map-editor.page.html` | modifica (span icona, freccia indietro) |
| `client/src/app/features/maps/map-editor.page.scss` | modifica (`.editor__tool`, `.editor__tool-icon`) |
| `client/src/app/app.html` | modifica (tema 🌙/☀️) |
| `client/src/app/app.spec.ts` | modifica (test tema) |
| `client/src/app/components/dialog/dialog.html` | modifica (✖️) |
| `client/src/app/components/dialog/dialog.spec.ts` | modifica (test chiusura) |
| `client/src/app/components/dialog/dialog.scss` | modifica (line-height emoji) |
| `client/src/app/components/toast/toast.html` | modifica (✖️) |
| `client/src/app/components/toast/toast.scss` | modifica (line-height emoji) |
| `client/src/app/components/toast/toast.spec.ts` | nuovo (test chiusura) |
| `client/src/app/features/dm/dm-shell.page.html` | modifica (toolbar, scene, token, slot) |
| `client/src/app/features/dm/dm-shell.page.scss` | modifica (dimensione emoji) |
| `client/src/app/features/actor/actor-sheet.page.html` | modifica (indietro, matita) |
| `client/src/app/features/actor/actor-wizard.page.html` | modifica (indietro) |
| `client/src/app/features/character/character-wizard.page.html` | modifica (check ✅) |
| `client/e2e/ui-icons.spec.ts` | nuovo (TDD Red ciclo 4) |

Nessun file server/shared, nessuna migrazione, nessuna dipendenza.

---

## 8. Criteri di accettazione

- Ogni voce del menu strumenti dell'editor (dieci tool + toggle griglia) mostra
  un'icona emoji prima della label.
- Tutti i glifi usati come icone nel client sono emoji; restano tipografici i
  glifi dentro testo, numeri o formule e i chevron degli accordion (`▾` / `▸`,
  invariati per scelta) — tabella 3.2.
- Le icone decorative sono `aria-hidden`; label, `aria-label` e `title` restano
  invariati, e gli E2E esistenti continuano a trovare i bottoni per nome.
- Le emoji colorate non vengono filtrate/desaturate; lo stato attivo continua a
  leggersi da bordo/sfondo accent.
- Nessuna dipendenza aggiunta, nessun attributo `style` inline, nessun SVG.
- Layout corretto sia desktop (colonna) sia ≤980px (riga orizzontale), tema
  chiaro e scuro; emoji leggibili (ritocchi 4.5).
- Tutti i test della sezione 6 sono verdi; `lint`, `typecheck`, `build` del
  client e l'E2E nuovo passano.
- I test sono stati scritti prima dell'implementazione.

---

## 9. Gate finali

```powershell
npm test -w @dnd-vtt/client
npm run lint -w @dnd-vtt/client
npm run typecheck -w @dnd-vtt/client
npm run build -w @dnd-vtt/client
```

```powershell
cd client
npx playwright test e2e/ui-icons.spec.ts e2e/phase-4.spec.ts e2e/phase-9.spec.ts
```

Per l'intero monorepo:

```powershell
npm run check
```

---

## 10. Rischi residui

| Rischio | Mitigazione |
|---|---|
| Resa delle emoji diversa tra OS/browser | codepoint stabili, font-size espliciti, nessun filtro che possa alterarle |
| Emoji troppo grandi/piccole in controlli compatti | ritocchi 4.5 e controllo visivo desktop/mobile |
| Emoji dentro il nome accessibile di un bottone | `aria-hidden` sulle icone decorative; test 2 del ciclo 4 e `phase-9` |
| E2E esistenti che si rompono per il testo cambiato | gli E2E selezionano per `aria-label`/`role`, non per glifo; `×` delle dimensioni resta invariato |
| jsdom/Konva nel test dell'editor | `imageAssetId: null` evita l'istanza del canvas; servizi tutti stubbati |
| Test fragile sul singolo codepoint emoji | si asserisce presenza/non vuoto, unicità per il menu e assenza dei vecchi simboli |
| Nuovo E2E dipendente dal server | usa gli helper `fixtures.ts` e il `webServer` già configurato |
