# Scene resolution and optional background

Decisioni del 2 novembre 2026.

## Modello

- La dimensione di mappa/scena è scelta alla creazione, non derivata dall'immagine.
- Preset: 720p, 1080p, 1440p, 4k, ultrawide.
- Orientamenti: landscape e portrait. Niente square.
- Ultrawide è disponibile **solo landscape**.
- `widthPx` e `heightPx` sono immutabili dopo la creazione, sia per la mappa sia per la scena.
- Lo sfondo è facoltativo (`imageAssetId: null`).
- Lo sfondo ha una trasformazione:

```ts
interface BackgroundTransform {
  x: number;
  y: number;
  scale: number;
}
```

- Default al caricamento: **cover** (riempie, ritaglia), poi l'utente può spostare/scalare.
- La scena **copia** `imageAssetId` e `backgroundTransform` dalla mappa; non segue la mappa live.

## Preset

| Preset | Landscape | Portrait |
|---|---:|---:|
| 720p | 1280×720 | 720×1280 |
| 1080p | 1920×1080 | 1080×1920 |
| 1440p | 2560×1440 | 1440×2560 |
| 4k | 3840×2160 | 2160×3840 |
| ultrawide 720p | 1680×720 | — |
| ultrawide 1080p | 2560×1080 | — |
| ultrawide 1440p | 3440×1440 | — |
| ultrawide 4k | 5120×2160 | — |

## Downscale al salvataggio

Dato `asset`, `scene` e `scale`:

```text
f = min(1, scale, scene.width / asset.width, scene.height / asset.height)
targetWidth  = round(asset.width * f)
targetHeight = round(asset.height * f)
newScale = scale / f
```

- `f = 1` → nessun downscale.
- il ridimensionamento preserva l'aspetto;
- `newScale` mantiene **identica** la dimensione renderizzata;
- il target è la dimensione effettivamente renderizzata, con cap alla scena.

## Asset

- Se l'asset è referenziato **solo da questa mappa**, viene sostituito in place:
  - nuovo file WebP/preview/thumb/tile;
  - stessa riga asset (o nuova riga se l'hash collide) e mappa aggiornata;
  - vecchi file rimossi.
- Se l'asset è condiviso con altre mappe, scene o attori, viene creato un **asset derivato** e la mappa punta a quello. L'originale resta intatto.
- Il downscale avviene sul server con `sharp`; il client mostra lo stato di salvataggio.

## Rendering

- `SceneCanvasComponent` e `DisplayLayerComponent` disegnano lo sfondo a `x, y` con `width = asset.width * scale`, `height = asset.height * scale`, clippato alla scena.
- Le mappe senza sfondo disegnano solo griglia/fog.
- La scena creata da mappa copia dimensioni, asset e trasformazione.

## Impatto su P3

- La history non deve più gestire comandi di ridimensionamento (risoluzione immutabile).
- Aggiungere comandi per:
  - `background.attach` / `background.remove`;
  - `background.transform` (x/y/scale).
- `replaceBackground` non cambia più `widthPx/heightPx`; aggiorna asset e trasformazione.
- La conversione a comandi resta quella descritta in `docs/p3-map-history-design.md`.

## Test minimi

- creazione mappa/scena senza sfondo;
- preset landscape/portrait e ultrawide;
- cover con immagine di aspect diverso;
- downscale: resa invariata, file più piccolo, `newScale` corretto;
- asset condiviso → derivato; asset unico → sostituito;
- scene copy: modifica mappa non altera scena esistente;
- rendering senza sfondo.
