# ISSUE 03 — Creazione scena solo da mappa ed eliminazione scene

**Stato:** piano approvato, da implementare
**Ambito:** client (`@dnd-vtt/client`): `features/dm`, `features/maps`,
`core/campaign.service.ts`; test server; documentazione
**Stima:** ~0,5–1 giornata (TDD incluso)
**Dipendenze:** nessuna

---

## 1. Contesto

### 1.1 Comportamento attuale

La console DM offre due strade diverse per creare una scena:

1. **“Crea scena”** nell'header dell'accordion Scene
   (`client/src/app/features/dm/dm-shell.page.html`, righe 131-133), che chiama
   `createScene()` in `dm-shell.page.ts` (righe 655-678) e fa
   `POST /api/v1/campaigns/:id/scenes` con dimensioni fisse 1920×1080.
2. **“Avvia da mappa”** nel corpo dell'accordion, che apre la dialog di scelta
   mappa (`openMapPicker()`), passa da “Prepara scena” e infine chiama
   `POST /api/v1/maps/:id/scenes`.

La prima strada produce una scena **senza mappa**. Non esiste oggi un modo per
associare una mappa a una scena già creata: `updateSceneSchema`
(`shared/src/schemas/scene.ts`, righe 346-354) non espone `mapId`, e la UI non
ha alcun pulsante di selezione mappa. Il pulsante “Crea scena” attuale è quindi
un vicolo cieco.

Nella stessa sezione convivono anche:

- il link **“Crea mappa”** nella sidebar (`dm-shell.page.html`, riga 141), che
  duplica il link già presente nella dialog di scelta mappa (riga 1105);
- la lista scene, che permette di attivare una scena, aprirne la mappa
  nell'editor e vedere il badge “attiva”, ma **non di eliminarla**.

Il server espone già `DELETE /api/v1/scenes/:id`
(`server/src/scenes/routes.ts`, righe 42-46) e `removeScene()`
(`server/src/scenes/service.ts`, righe 71-82), che elimina la scena e azzera
`campaign.activeSceneId` se era quella attiva. Il client non ha né il metodo
HTTP né il pulsante.

### 1.2 Richieste

- Rimuovere il pulsante “Crea scena” attuale perché crea scene senza mappa.
- Il flusso buono è quello oggi etichettato “Avvia da mappa”: sidebar e titolo
  della dialog devono diventare **“Crea scena”**.
- La dicitura “Avvia da mappa” non deve più comparire.
- Lasciare **“Crea mappa”** solo nella dialog di scelta; rimuovere il link
  duplicato dalla sidebar.
- Poter eliminare una scena esistente.
- Consentire l'eliminazione **solo di una scena che non è in onda**.
  Per “in onda” si intendono sia la scena attiva nella console sia una scena
  ancora presente nella composizione di uno schermo online.

---

## 2. Decisioni

| # | Decisione | Motivazione |
|---|---|---|
| D1 | Eliminare del tutto la creazione scena senza mappa | una scena senza mappa non è più associabile a una mappa |
| D2 | Sidebar e titolo dialog: **“Crea scena”** | descrive l'azione reale (creare una scena da una mappa) |
| D3 | Il link **“Crea mappa”** resta solo nella dialog | evita duplicazione; la dialog è il punto in cui si sceglie una mappa o se ne crea una nuova |
| D4 | Il pulsante elimina compare su ogni scena, ma è disabilitato se la scena è attiva o in onda | il vincolo è visibile e spiegato, senza nascondere la funzionalità |
| D5 | “In onda” = scena attiva **oppure** `scene.id` presente in `base`/`overlays` della composizione di uno schermo online | copre sia il badge “attiva” sia le scene già proiettate |
| D6 | Riusare `DELETE /api/v1/scenes/:id` | endpoint e semantica esistono già; nessuna migrazione |
| D7 | Ricaricare gli schermi dopo `takeSceneTo()` | mantiene aggiornato il calcolo delle scene in onda |
| D8 | Nessuna modifica allo schema o alle API server | l'intervento è client-side; il server aggiunge solo test di regressione |

---

## 3. Modifiche client

### 3.1 `client/src/app/core/campaign.service.ts`

- Aggiungere:
  ```ts
  public async deleteScene(sceneId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/v1/scenes/${sceneId}`));
  }
  ```
- Rimuovere `createScene()` (righe 53-61) e il relativo import `CreateScene`,
  se non usato altrove nel client. La creazione scena passa esclusivamente da
  `MapService.createScene()`.
- Mantenere invariati `updateScene`, `getSnapshot` e gli altri metodi.

### 3.2 `client/src/app/features/dm/dm-shell.page.ts`

Rimozioni:

- `createScene()` (righe 655-678);
- `newSceneFog` (riga 226), l'assegnazione in `enterCampaign()` (riga 526) e
  `setNewSceneFog()` (righe 1184-1189), ormai privi di uso nel template.

Nuovo stato:

```ts
public readonly sceneDeleteTarget = signal<Scene | null>(null);

public readonly onAirSceneIds = computed<ReadonlySet<string>>(() => {
  const ids = new Set<string>();
  for (const screen of this.screens()) {
    const state = screen.state;
    if (state === null) {
      continue;
    }
    for (const layer of [state.composition.base, ...state.composition.overlays]) {
      if (layer.scene !== undefined) {
        ids.add(layer.scene.id);
      }
    }
  }
  return ids;
});
```

Nuovi metodi:

```ts
public canDeleteScene(scene: Scene): boolean {
  return scene.id !== this.activeScene()?.id
    && !this.onAirSceneIds().has(scene.id);
}

public deleteBlockedReason(scene: Scene): string | null {
  if (scene.id === this.activeScene()?.id) {
    return 'Non puoi eliminare la scena attiva.';
  }
  if (this.onAirSceneIds().has(scene.id)) {
    return 'La scena è in onda su uno schermo.';
  }
  return null;
}

public askDeleteScene(scene: Scene): void {
  if (!this.canDeleteScene(scene)) {
    return;
  }
  this.sceneDeleteTarget.set(scene);
}
```

`confirmDeleteScene()`:

1. legge `sceneDeleteTarget()` e la campagna attiva;
2. chiude subito la dialog di conferma;
3. chiama `campaignsApi.deleteScene(target.id)`;
4. rimuove la scena da `scenes` con `filter`;
5. imposta `statusMessage` a `Scena eliminata: <nome>`;
6. in caso di errore usa `notice` con `messageFor(error)`;
7. usa `busy` per disabilitare le azioni durante la chiamata.

Gestione difensiva: se la scena eliminata è ancora `activeScene()` (possibile
solo per una race), fermare le azioni realtime, svuotare lo scene store,
azzerare `activeScene` e `mapImage`, poi ricaricare la campagna dal server.

Aggiornamento schermi:

- in `takeSceneTo()`, dopo l'aggiornamento locale di `screens`, chiamare
  `await this.loadScreens(campaign.id)` prima di impostare lo status, così
  `onAirSceneIds` include subito la scena appena proiettata.

### 3.3 `client/src/app/features/dm/dm-shell.page.html`

Accordion Scene:

- rimuovere l'`app-button` “Crea scena” nell'header (righe 131-133);
- nel corpo, il pulsante primario diventa:
  ```html
  <app-button variant="primary" [disabled]="busy()" (pressed)="openMapPicker()">
    Crea scena
  </app-button>
  ```
- rimuovere il link `<a class="btn" routerLink="/maps">Crea mappa</a>` dalla
  sidebar (riga 141);
- aggiornare il testo vuoto in:
  “Nessuna scena: scegli una mappa e crea la scena da qui.”

Stato vuoto della scena:

- il pulsante “Avvia da mappa” (riga 559) diventa **“Crea scena”**.

Lista scene:

- nella colonna `.scene-list__actions`, dopo il pulsante di attivazione e il
  link “Modifica mappa”, aggiungere:
  ```html
  <button
    type="button"
    class="icon-button icon-button--danger"
    [disabled]="busy() || !canDeleteScene(scene)"
    [attr.aria-label]="'Elimina scena ' + scene.name"
    [title]="deleteBlockedReason(scene) ?? 'Elimina scena'"
    (click)="askDeleteScene(scene)"
  >🗑</button>
  ```
- il pulsante resta visibile anche per la scena attiva o in onda, ma
  disabilitato con tooltip esplicativo.

Dialog di scelta mappa:

- titolo: `title="Crea scena"` (riga 1077);
- mantenere il link in fondo `<a class="btn" routerLink="/maps">Crea mappa</a>`
  (riga 1105);
- aggiornare la descrizione in:
  “Scegli la mappa da cui creare la scena. I mostri e le luci vengono
  istanziati nella nuova scena.”

Nuova dialog di conferma, dopo la dialog “Prepara scena”:

```html
<app-dialog
  [open]="sceneDeleteTarget() !== null"
  title="Eliminare la scena?"
  (closed)="sceneDeleteTarget.set(null)"
>
  @if (sceneDeleteTarget(); as scene) {
    <p class="muted">
      La scena <strong>{{ scene.name }}</strong> verrà eliminata con token,
      nebbia e disegni. La mappa resta disponibile nell'editor.
    </p>
  }
  <div dialog-actions>
    <app-button (pressed)="sceneDeleteTarget.set(null)">Annulla</app-button>
    <app-button variant="danger" [disabled]="busy()" (pressed)="confirmDeleteScene()">
      Elimina
    </app-button>
  </div>
</app-dialog>
```

### 3.4 `client/src/app/features/dm/dm-shell.page.scss`

Aggiungere accanto a `.icon-button`:

```scss
.icon-button--danger {
  color: var(--color-danger);
}
```

### 3.5 `client/src/app/features/maps/maps.page.html`

Aggiornare la copy:

- da “Poi avvia la scena dalla console.”
- a “Poi crea la scena dalla console.”

---

## 4. Modifiche server

Nessuna modifica di logica o schema: `DELETE /api/v1/scenes/:id` esiste già e
`removeScene()` azzera `campaign.activeSceneId` quando necessario.

Aggiungere solo un test di regressione in `server/test/api.spec.ts`:

- crea campagna e due scene;
- elimina la seconda → `204`;
- la lista non contiene più la scena;
- `GET /scenes/:id` → `404`;
- elimina la scena attiva → la campagna ha `activeSceneId: null`.

Il blocco “scena attiva o in onda” resta un vincolo di UI: non ci sono altri
client che possano bypassarlo e il server continua a gestire l'eliminazione in
modo coerente.

---

## 5. Test

### 5.1 E2E `client/e2e/phase-9.spec.ts`

Aggiornare il test “la console avvia una scena da una mappa”:

- `getByRole('button', { name: 'Avvia da mappa' })` → `'Crea scena'`;
- titolo dialog atteso → `'Crea scena'`;
- mantenere `'Avvia scena'` nel pulsante finale di “Prepara scena”.

### 5.2 E2E `client/e2e/phase-2.spec.ts`

Il test attuale “crea una scena e la mostra come attiva” clicca un pulsante che
non esiste più. Sostituirlo con due test seriali:

1. **La console mostra la scena attiva**
   - crea una scena via `createScene(request, campaignId)`;
   - imposta `activeSceneId` via API;
   - apre la console;
   - verifica `.scene-list__item` visibile e badge “attiva”.

2. **Elimina una scena non attiva**
   - crea una seconda scena via API;
   - apre la console;
   - verifica che la scena attiva abbia il pulsante `Elimina scena …`
     disabilitato;
   - clicca `Elimina scena <nome>` sulla scena non attiva;
   - conferma nella dialog “Eliminare la scena?”;
   - verifica che la riga sparisca e che la scena attiva resti invariata.

Il flusso completo di creazione da mappa resta coperto da `phase-9`.

### 5.3 Gate

```powershell
npm run check
npm run test:e2e
```

In alternativa, per un ciclo più rapido:

```powershell
npm run build
cd client
npx playwright test e2e/phase-2.spec.ts e2e/phase-9.spec.ts
```

---

## 6. File toccati

| File | Intervento |
|---|---|
| `client/src/app/core/campaign.service.ts` | `deleteScene`; rimozione `createScene` |
| `client/src/app/features/dm/dm-shell.page.ts` | rimozione creazione generica; stato e logica eliminazione; `onAirSceneIds`; refresh schermi |
| `client/src/app/features/dm/dm-shell.page.html` | label “Crea scena”; rimozione link duplicato; pulsante elimina; dialog conferma |
| `client/src/app/features/dm/dm-shell.page.scss` | stile `.icon-button--danger` |
| `client/src/app/features/maps/maps.page.html` | copy “crea la scena” |
| `client/e2e/phase-2.spec.ts` | test scena attiva + eliminazione |
| `client/e2e/phase-9.spec.ts` | label “Crea scena” |
| `server/test/api.spec.ts` | test `DELETE /scenes/:id` |
| `README.md` | dicitura “Crea scena” |
| `PLAN.md` | dicitura “Crea scena” nella Fase 10 |

---

## 7. Criteri di accettazione

- Non esiste più alcun pulsante che crei una scena senza mappa.
- La sidebar e la dialog di scelta usano “Crea scena”; “Avvia da mappa” non
  compare più nel client.
- “Crea mappa” è presente solo nella dialog di scelta.
- Una scena non attiva e non in onda può essere eliminata dalla lista con
  conferma.
- Una scena attiva o presente su uno schermo online ha il pulsante elimina
  disabilitato con motivazione.
- `npm run check` e `npm run test:e2e` sono verdi.

---

## 8. Note e limiti

- Con una sola scena attiva il pulsante elimina resta disabilitato: per
  eliminarla bisogna prima attivarne un'altra. È la conseguenza diretta del
  vincolo “solo scene non in onda”.
- Il calcolo “in onda” usa gli schermi online già caricati in `screens()`.
  Uno schermo offline non blocca l'eliminazione.
- L'eliminazione della mappa resta invariata e fuori da questo issue: eliminare
  una mappa non elimina le scene già create.
