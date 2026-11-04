# P3 — Refactor history editor mappe a comandi

> Nota: con il documento mappa v2 (issue [#18](https://github.com/dardino/dnd-vtt/issues/18))
> i percorsi citati sotto (`terrain.walls`, `terrain.lights`, `spawns`,
> `playerStarts`) sono confluiti nei layer `constraints` ed `elements`. Il
> progetto dei comandi resta valido; per il modello attuale vedi
> [`map-layers.md`](./map-layers.md).

Stato attuale: `MapEditorPage` mantiene `history: MapDocument[]` con snapshot completi
(`structuredClone`) limitati a 50 entry e 32 MB. Undo/redo sostituiscono l'intero
documento. Funziona, ma ogni modifica paga un clone completo e la history conserva
copie dell'intero documento.

Obiettivo: conservare in history **solo la modifica**, non il documento. Il documento
corrente resta immutabile verso l'esterno e viene clonato una volta per edit (costo
transitorio), mentre undo/redo applicano comandi inversi.

## Architettura

```ts
export interface MapCommand {
  readonly label: string;
  /** Stima UTF-16 dei dati catturati, usata per il budget. */
  readonly bytes: number;
  apply(doc: MapDocument): void;
  invert(doc: MapDocument): void;
}
```

`MapCommand` è un oggetto con due operazioni pure sul documento:

- `apply` porta il documento dallo stato "prima" allo stato "dopo";
- `invert` riporta dallo stato "dopo" allo stato "prima".

I comandi catturano **solo i dati toccati**: un elemento rimosso con indice, una
coppia `before/after` per un campo, un array di muri appena disegnati.

```ts
export class MapHistory {
  private undoStack: MapCommand[] = [];
  private redoStack: MapCommand[] = [];
  private bytes = 0;

  execute(current: MapDocument, command: MapCommand): MapDocument {
    const next = structuredClone(current);
    command.apply(next);
    this.push(this.undoStack, command);
    this.redoStack = [];
    return next;
  }

  undo(current: MapDocument): MapDocument | null { /* pop + invert + push redo */ }
  redo(current: MapDocument): MapDocument | null { /* pop + apply + push undo */ }
  clear(): void { /* svuota stack e bytes */ }
}
```

Regole:

- il clone completo avviene **una volta per edit**, non viene conservato;
- `undoStack` e `redoStack` condividono un budget (es. 32 MB) e un limite di comandi
  (es. 200), non più 50 snapshot;
- ogni `MapCommand` è immutabile dopo la creazione: `before/after` sono copie profonde
  dei soli valori catturati;
- `label` alimenta eventuali tooltip/status, non la logica.

## Catalogo comandi

### Collezioni

Un solo comando generico per le quattro collezioni:

| Collezione | Percorso |
|---|---|
| Muri | `doc.terrain.walls` |
| Luci | `doc.terrain.lights` |
| Spawn | `doc.spawns` |
| Partenze PG | `doc.playerStarts` |

```ts
type CollectionKind = 'wall' | 'light' | 'spawn' | 'start';

arrayInsert(kind, elements, index)  // apply: splice(index, 0, ...elements)
                                     // invert: rimuove per id
arrayRemove(kind, element, index)   // apply: rimuove per id
                                     // invert: splice(index, 0, element)
```

`arrayInsert` copre:

- `onWallsDrawn` (batch di muri, con ID già generati);
- `placeLight`, `placeStart`, `addSrdSpawn`, `addActorSpawn`.

`arrayRemove` copre `onWallRemoved` e `removeSelected` per tutte le collezioni.

### Aggiornamenti puntuali

```ts
replaceFields(kind, id, before: Partial<Entity>, after: Partial<Entity>)
```

- applica `Object.assign(target, after)` e inverte con `before`;
- copre `updateWall`, `updateDoor`, `updateLightField`, `updateSpawnField`,
  `updateStartLabel`, `moveElement` (x/y), `updateMapField`, `updateGridField`,
  `updateTerrainField`, `updateVisionLimit`, `setAmbient`.

Per `updateGridField` il comando cattura anche l'eventuale riduzione di
`terrain.visionLimitFeet` calcolata nello stesso handler.

### Background

`replaceBackground(before, after)` cattura `imageAssetId`, `widthPx`, `heightPx`,
`terrain.visionLimitFeet`. Dopo undo/redo la pagina deve riallineare l'anteprima
immagine dal documento (`syncImageFromDoc()`), perché `image` è uno stato UI separato.

## Integrazione nella pagina

Sostituire `updateDoc(mutator)` con:

```ts
private execute(command: MapCommand): void {
  const current = this.doc();
  if (current === null) {
    return;
  }
  this.doc.set(this.history.execute(current, command));
  this.dirty.set(true);
}
```

Ogni handler costruisce il comando **leggendo lo stato corrente**:

```ts
public onWallRemoved(id: string): void {
  const doc = this.doc();
  const index = doc?.terrain.walls.findIndex((wall) => wall.id === id) ?? -1;
  if (doc === null || index < 0) {
    return;
  }
  this.execute(arrayRemove('wall', doc.terrain.walls[index], index));
  // selection cleanup invariato
}
```

`undo`/`redo` diventano:

```ts
public undo(): void {
  const current = this.doc();
  const next = current === null ? null : this.history.undo(current);
  if (next !== null) {
    this.doc.set(next);
    this.dirty.set(true);
    this.syncImageFromDoc();
  }
}
```

## Piano di migrazione

1. **Infrastruttura** (`map-command.ts`, `map-history.ts`):
   - `MapCommand`, `MapHistory`, `arrayInsert`, `arrayRemove`, `replaceFields`,
     `replaceBackground`, stima `bytes`.
   - Test unitari di round-trip per ogni comando.
2. **Conversione handler**, in blocchi piccoli e verificabili:
   - muri (add/remove/update/door);
   - luci (add/remove/update);
   - spawn (add/remove/update/move);
   - partenze (add/remove/update/move);
   - griglia/terreno/mappa;
   - background.
3. **Rimozione** di `snapshotOf`/`pushBoundedHistory` e delle chiamate `structuredClone`
   nello storico; il clone resta solo dentro `MapHistory.execute`.
4. **Test pagina**: sequenza mista (add → move → update → remove), undo completo e redo
   completo; selezione coerente; dirty flag.
5. **Benchmark**: 1000 modifiche su documento con 4000 muri e 500 spawn; misurare
   memoria degli stack e latenza mediana per edit. Criterio: nessuna crescita MB
   proporzionale al documento e mediana < 50 ms.

## Test da aggiungere

- round-trip di ogni comando: `apply` poi `invert` restituisce il documento iniziale;
- `invert` poi `apply` (redo) restituisce lo stato modificato;
- comandi su ID inesistenti: no-op, nessuna corruzione;
- history: eviction per byte e per numero, redo svuotato dopo nuovo edit;
- 1000 edit: `history.bytes <= budget`, undo/redo completi;
- page: `onWallsDrawn` batch, `removeSelected`, `moveElement`, `replaceBackground`
  con `syncImageFromDoc`.

## Rischi e decisioni

- **Clone transitorio**: il clone per edit resta O(documento). Elimina la memoria
  storica, non il costo CPU. Se il benchmark supera 50 ms, il passo successivo è
  copy-on-write per path (clonare solo gli oggetti toccati), non un ritorno agli
  snapshot.
- **Comandi con closure**: non serializzabili. Va bene per undo locale; per una
  futura collaborative editing servirebbero patch JSON pure.
- **Side effect immagine**: `replaceBackground` richiede `syncImageFromDoc()` dopo
  undo/redo; senza, l'anteprima può non corrispondere al documento.
- **Selezione**: non entra nella history (comportamento attuale). Se un comando
  rimuove l'elemento selezionato, la pagina azzera la selezione come oggi.
- **Limite budget**: un singolo comando enorme (es. replace di 4000 muri) può superare
  il budget; in quel caso la history si svuota e resta solo il documento corrente,
  come già avviene con lo snapshot oversize.
