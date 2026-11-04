# Movimento di scena, muri diagonali e frecce della console

Regole condivise fra client e server per decidere dove un token può stare e
come si muove. La fonte unica è `shared/src/lib/scene/movement.ts`; server e
client importano le stesse funzioni, quindi la validazione della console non
può divergere da quella applicata alle azioni.


## Validazione del movimento

`lastReachableCell(from, to, terrain, size = 1)` percorre la linea retta fra
origine e destinazione (`cellsAlongLine`, un passo per cella, `max(|dx|, |dy|)`
passi) e restituisce l'ultima cella raggiungibile. Non è un pathfinding: non
aggira gli ostacoli, si ferma al primo passo bloccato.

- **Passo ortogonale**: l'edge condiviso fra le due celle non deve essere
  bloccante.
- **Passo diagonale**: non si tagliano gli angoli, quindi entrambe le
  componenti ortogonali devono essere libere; in più il footprint di
  destinazione deve essere piazzabile.
- **Footprint**: `size` indica il lato in celle. Una cella di destinazione è
  valida solo se tutte le celle coperte dall'origine sono piazzabili.
- **Blocchi**: muri, finestre, muri bassi e porte non `open`. Una porta `open`
  è attraversabile anche in diagonale; una porta chiusa o `secret` blocca.

## Celle invalide e muri diagonali

`segmentBlocksMovement` decide se un segmento partecipa ai blocchi: qualunque
muro sempre, una porta solo se non è aperta.

`isCellPlaceable(cell, terrain, size)` e `isFootprintPlaceable(origin, size,
terrain)` rifiutano una cella quando un segmento bloccante entra nel suo
**interno aperto**. Bordi, spigoli e tratti collineari al bordo sono contatti,
non attraversamenti: un muro diagonale che passa da un angolo all'altro non
invalida le celle che tocca solo sul bordo, mentre invalida la cella che taglia
davvero. È il caso reale `(11,5)->(12,4)`, che attraversa l'interno di
`(11,4)`.

La stessa regola vale per:

- editor mappe: `placeStart`, `requestSpawn`, `addSrdSpawn`, `addActorSpawn` e
  `moveElement` non piazzano né spostano elementi su celle invalide;
- console: `SceneTokensStore.spawnActorToken` rifiuta lo spawn con un messaggio
  di stato;
- azione `token.add`: il server risponde `409` se il footprint non è
  piazzabile.

## Fuga da una cella invalida

Una scena può contenere token già finiti dentro un muro (mappe vecchie o muri
disegnati dopo). Se il footprint di partenza non è piazzabile,
`lastReachableCell` ignora gli edge per il **primo** passo e richiede solo che
la destinazione sia valida; dal secondo passo tornano le regole normali. Così
il token esce dalla cella invalida senza attraversare muri e senza richiedere
`force`.

## Creazione della scena

`createSceneFromMap` materializza spawn e partenze PG con `placeTokenCell`:

1. usa la cella richiesta (compreso l'offset `index % 3` / `floor(index / 3)`
   degli spawn multipli) se è dentro la griglia, libera e piazzabile;
2. altrimenti scandisce gli anelli Chebyshev crescenti attorno alla cella
   richiesta, ordinati per `y` poi `x`, e prende la prima cella valida;
3. se non esiste alcuna cella valida salta il token.

Esempio di regressione coperto dai test: uno spawn o una partenza in `(11,4)`
viene ricollocato in `(10,3)`. Le celle occupate vengono riservate, quindi due
token non finiscono mai sulla stessa cella.

## Console DM

Con lo strumento **seleziona** e un token selezionato, le frecce spostano il
token di una cella:

| Tasto | Effetto |
| --- | --- |
| `Freccia` | sposta il token selezionato di una cella, validata con `lastReachableCell` |
| `Shift` + `Freccia` | pan della camera (comportamento storico) |
| `Alt` + `Freccia` | movimento forzato: ignora i muri e invia `force: true` |
| `+` / `-` | zoom |
| `Esc` | deseleziona |

Dettagli:

- il movimento con le frecce vale solo su griglia **quadrata**, con strumento
  di selezione, scena scrivibile e token selezionato; negli altri casi la
  freccia resta al pan;
- `Ctrl`/`Meta` sono lasciati al browser (nessuna scorciatoia catturata);
- la destinazione viene limitata alla mappa rispettando il footprint
  (`origin + size <= cols/rows`);
- click o pointer down sul canvas portano il focus sull'host, ma non se il
  target è un campo editabile o un `<dialog>`/`[role="dialog"]`;
- il drag di un token usa lo stesso snap e la stessa validazione, con `Alt` per
  forzare;
- l'inverso di `token.move` propaga `force` solo quando l'azione originale lo
  aveva, così l'undo di un movimento forzato riporta esattamente la cella di
  partenza.

## Limiti noti

- **Nessun pathfinding**: il movimento è sempre una linea retta; per aggirare
  un ostacolo servono più azioni.
- **Griglia esagonale**: le frecce continuano a fare pan; il movimento del
  token con la tastiera è solo su griglia quadrata.
- **Aree bloccate** (`constraints`): restano dati di authoring, non entrano
  nella collisione.
- **Visione e fog invariate**: il movimento non riscrive gli edge usati da LOS
  e luce; i muri diagonali continuano a essere derivati in edge di cella.
- **Un solo token**: le frecce muovono il token selezionato, non un gruppo.

## Riferimenti

- `shared/src/lib/scene/movement.ts`, `movement.spec.ts`,
  `__fixtures__/walls.ts`
- `shared/src/lib/scene/edges.ts`, `shared/src/lib/scene/actions.ts`
- `server/src/maps/scene-placement.ts`, `server/src/maps/scene-tokens.ts`
- `client/src/app/features/scene/scene-canvas.component.ts`,
  `client/src/app/core/ui/canvas-keyboard.ts`
- `client/e2e/phase-9.spec.ts`, `client/e2e/phase-18-map-layers.spec.ts`
