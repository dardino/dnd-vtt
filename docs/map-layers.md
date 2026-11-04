# Mappe a layer — documento v2, derivati e limiti

Implementato con la issue [#18](https://github.com/dardino/dnd-vtt/issues/18).
Descrive il formato persistito, la migrazione dai documenti storici, il
contratto del `PUT` per i derivati e che cosa resta fuori scope.

## Modello v2

`MapDocument` è il documento **v2**: `schemaVersion: 2`, `strictObject`, nessun
campo piatto della v1 (`imageAssetId`, `backgroundTransform`, `terrain`,
`spawns`, `playerStarts`). I contenuti vivono in `layers`, una **tupla** di
quattro elementi nell'ordine fisso background → graphics → constraints →
elements: ordine, unicità e presenza sono garantiti dallo schema.

| Layer | Contenuto | Dettagli |
|---|---|---|
| `background` | un solo raster | `imageAssetId` e `imageTransform` (`x`, `y`, `scale`, `rotation`, `flipH`, `flipV`) |
| `graphics` | immagini decorative | `MapGraphic`: `assetId`, `x`, `y`, `scale`, `rotation`, `flipH`, `flipV`, `opacity`, `z`; massimo 500 |
| `constraints` | muri e aree bloccate | `WallSegment` oppure `BlockedArea` (`rect` con due angoli, `polygon` con almeno tre vertici); massimo 4000 |
| `elements` | luci, spawn, partenze, loot | unione discriminata su `type`; massimo 2000 |

Ogni layer ha `id`, `kind`, `visible`, `locked`, `opacity` (0..1). Il layer
`locked` non accetta modifiche dall'editor; `visible` e `opacity` valgono sia
per il rendering editor sia per i derivati.

Restano a livello documento `name`, `backgroundColor`, `widthPx`, `heightPx`,
`grid`, `ambientLight`, `visionLimitFeet`, `visionEnabled`, `startView`,
`fogBase`, `showDoorIcons`, `notes`. Nel DTO `Map` il campo denormalizzato
`imageAssetId` coincide sempre con `backgroundLayer.imageAssetId` ed è usato da
liste e conteggio riferimenti; non fa parte del documento.

## Migrazione v1 → v2

`migrateMapDocument(input)` è pura e idempotente:

1. prova `mapDocumentV2Schema`; se valido restituisce il documento;
2. altrimenti valida con `legacyMapDocumentSchema` (copia congelata della v1) e
   converte:
   - background da `imageAssetId` + `backgroundTransform`;
   - graphics vuoto;
   - constraints da `terrain.walls`;
   - elements da `terrain.lights`, `spawns`, `playerStarts`, con il
     discriminante `type`;
   - `ambientLight`, `visionLimitFeet`, `visionEnabled` da `terrain`.

La lettura migra al volo; la scrittura è sempre v2 e il `PUT` valida solo v2.
L'import di un bundle legacy normalizza le voci mappa piatte con la stessa
funzione (`campaignImportSchema`), mentre l'export produce sempre v2.

## Persistenza dei derivati

La tabella `maps` ha due colonne nullable (migrazione Drizzle `0010`):
`thumb_asset_id` e `composite_asset_id`. Sono riferimenti rigenerabili, fuori
dal documento v2.

`PUT /api/v1/maps/:id` accetta:

```json
{ "version": 7, "document": { ... }, "thumbAssetId": "uuid | null", "compositeAssetId": "uuid | null" }
```

Semantica dei derivati:

- **campo assente** (`undefined`): conserva il riferimento corrente;
- **`null`**: azzera il riferimento;
- **uuid**: imposta il riferimento, ma l'asset deve esistere, altrimenti `404`
  e nessuna scrittura.

L'aggiornamento è atomico: conflitto di `version` (`409`), asset di sfondo o
derivato mancante vengono validati **prima** dell'update. Il vecchio sfondo e i
derivati sostituiti vengono eliminati solo se `countAssetReferences` è zero;
il conteggio copre colonne `maps` (`image`, `thumb`, `composite`), JSON del
documento (sfondo e graphics), scene, attori, layer immagine dei program e i
campi legacy.

`MapSummary.thumbUrl` usa la thumbnail persistita e ripiega sulla thumbnail
dell'asset di sfondo; se non esiste nessuna delle due è `null` e la card mostra
il foglio CSS con `backgroundColor`.

## Thumbnail e composito

Al salvataggio il client genera i derivati con un canvas 2D fuori schermo
(`MapRenderService`, non Konva) ed esporta WebP:

- **thumbnail**: lato lungo massimo **640 px**, tutti i layer visibili
  (background, graphics, constraints, elements con marker semplici) senza
  griglia, handle, etichette o selezione;
- **composito**: lato lungo massimo **4096 px**, solo background + graphics
  visibili, con `backgroundColor` come base; è ciò che la scena usa in gioco.

La scala è uniforme e non c'è upscale oltre le dimensioni native. I due render
e i due upload sono indipendenti: un errore produce un warning non bloccante e
il `PUT` prosegue senza quel campo, quindi i riferimenti precedenti restano
validi. La thumbnail viene rigenerata a ogni salvataggio, perché constraints ed
elements possono cambiare.

## Scena da mappa

`createSceneFromMap` usa `compositeAssetId` come immagine della scena con
transform **cover** calcolato sulle dimensioni della mappa; se il composito
manca ripiega su sfondo + `backgroundTransform`. Muri e luci alimentano il
terrain, i token nascono da spawn e partenze, e il loot viene copiato in
`SceneState.loot` (`id`, `itemId`, `x`, `y`, `quantity`, `visible`).

## Limiti noti

- **Aree bloccate**: solo dati e authoring; non partecipano alle collisioni di
  `token.move` né alla validazione del movimento.
- **Loot**: copiato nella scena, ma rendering e pickup su scena/display restano
  fuori scope.
- **Griglia esagonale**: le aree bloccate sono disponibili solo su griglia
  quadrata; muri e luci seguono i limiti già esistenti.
- **Riordino layer**: l'ordine è fisso, non è possibile spostare un layer.
- **Editing collaborativo**: nessun merge dei documenti; il conflitto è
  risolto dal controllo di `version`.
- **Derivati**: rigenerati a ogni save, senza skip basato su hash; l'editor non
  mostra i token reali nella thumbnail, solo i marker degli elementi.

## Riferimenti

- `shared/src/schemas/map-layers.ts`, `map-document.ts`, `map-legacy.ts`,
  `map.ts`
- `server/src/maps/service.ts`, `server/src/maps/derived-assets.ts`,
  `server/src/db/assets.repository.ts`
- `client/src/app/features/maps/map-render.service.ts`,
  `map-image-renderer.ts`
- `client/e2e/phase-18-map-layers.spec.ts`
