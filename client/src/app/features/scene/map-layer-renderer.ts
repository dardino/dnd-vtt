import Konva from 'konva';
import {
  TILE_SIZE_PX,
  defaultBackgroundTransform,
  tileLevelForScale,
  tileUrl,
  type BackgroundTransform,
} from '@dnd-vtt/shared';

/** Immagine di sfondo della scena, con l'eventuale pipeline di tile. */
export interface MapImageSource {
  readonly url: string;
  readonly previewUrl: string;
  readonly hash: string;
  /** Dimensioni della scena in pixel mondo: usate per camera, griglia e clip. */
  readonly width: number;
  readonly height: number;
  /** Dimensioni native dell'asset, se diverse da quelle della scena. */
  readonly imageWidth?: number;
  readonly imageHeight?: number;
  readonly tiled: boolean;
}

/** Trasformazione dello stage: scala e traslazione in pixel schermo. */
export interface MapCamera {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Dimensioni in pixel schermo dello stage. */
export interface MapViewport {
  readonly width: number;
  readonly height: number;
}

export type MapImageLoader = (url: string) => Promise<HTMLImageElement>;

export interface MapBaseRenderParams {
  readonly layer: Konva.Layer;
  readonly map: MapImageSource;
  /** Posizione e scala dello sfondo rispetto alla scena. */
  readonly transform?: BackgroundTransform;
  /** False quando una nuova mappa ha sostituito questa durante il caricamento. */
  readonly isCurrent: () => boolean;
  readonly loadImage: MapImageLoader;
}

export interface MapTilesRenderParams {
  readonly layer: Konva.Layer;
  readonly map: MapImageSource;
  /** Posizione e scala dello sfondo rispetto alla scena. */
  readonly transform?: BackgroundTransform;
  readonly camera: MapCamera;
  readonly viewport: MapViewport;
  readonly isCurrent: () => boolean;
  /** True durante pan e zoom: le tile si riallineano a fine gesto. */
  readonly isInteracting: () => boolean;
  readonly loadImage: MapImageLoader;
  /** True quando tutte le tile richieste sono state disegnate. */
  readonly onTilesReady: (ready: boolean) => void;
}

/**
 * Disegna lo sfondo mappa su un layer Konva: immagine singola, preview a bassa
 * risoluzione e piramide di tile/LOD. Il componente conserva stage, cache delle
 * immagini, input e orchestrazione: qui arriva solo ciò che serve al disegno
 * (mappa, camera, viewport e caricatore di immagini).
 */
export class MapLayerRenderer {
  private layer: Konva.Layer | null = null;
  private previewNode: Konva.Group | null = null;

  /** Ripulisce il layer e dimentica la preview: da chiamare al cambio mappa. */
  public reset(layer: Konva.Layer | null): void {
    layer?.destroyChildren();
    this.layer = layer;
    this.previewNode = null;
  }

  /**
   * Disegna l'immagine intera o, per le mappe tiled, la preview. Ritorna true
   * quando un nodo è stato aggiunto al layer. Se la preview manca (mappe
   * precedenti alla pipeline di tile) ripiega sull'immagine completa.
   */
  public async renderBase(params: MapBaseRenderParams): Promise<boolean> {
    const { layer, map, isCurrent, loadImage } = params;
    const transform = params.transform ?? defaultBackgroundTransform;
    this.layer = layer;
    this.previewNode = null;
    const url = map.tiled ? map.previewUrl : map.url;
    try {
      const image = await loadImage(url);
      return this.place(layer, map, image, isCurrent, transform);
    } catch {
      if (!map.tiled) {
        return false;
      }
      try {
        const image = await loadImage(map.url);
        return this.place(layer, map, image, isCurrent, transform);
      } catch {
        return false;
      }
    }
  }

  /**
   * Mostra la preview e nasconde le tile durante pan e zoom. Ritorna false
   * quando non esiste una preview (mappa singola, non ancora caricata o
   * caricamento fallito): il chiamante in quel caso non tocca lo stato.
   */
  public showPreview(): boolean {
    const preview = this.previewNode;
    const layer = this.layer;
    if (preview === null || layer === null) {
      return false;
    }
    preview.visible(true);
    for (const child of layer.getChildren()) {
      if (child !== preview) {
        child.visible(false);
      }
    }
    return true;
  }

  /**
   * Disegna le sole tile visibili al livello LOD adatto alla scala corrente.
   * La preview resta nel layer finché tutte le tile non sono pronte, così il
   * pan non mostra mai un buco.
   */
  public renderTiles(params: MapTilesRenderParams): void {
    const { layer, map, camera, viewport, isCurrent, isInteracting } = params;
    if (!map.tiled || isInteracting()) {
      return;
    }
    const transform = params.transform ?? defaultBackgroundTransform;
    const scale = Math.max(camera.scale, 0.0001);
    const backgroundScale = Math.max(transform.scale, 0.0001);
    const imageWidth = map.imageWidth ?? map.width;
    const imageHeight = map.imageHeight ?? map.height;
    const level = tileLevelForScale(scale * backgroundScale, imageWidth, imageHeight);
    const worldLeft = Math.max(0, -camera.x / scale);
    const worldTop = Math.max(0, -camera.y / scale);
    const worldRight = Math.min(map.width, worldLeft + viewport.width / scale);
    const worldBottom = Math.min(map.height, worldTop + viewport.height / scale);
    // La scena è in pixel mondo: riporta il rettangolo visibile allo spazio
    // dell'asset, poi taglia su ciò che esiste davvero.
    const imageLeft = Math.max(0, (worldLeft - transform.x) / backgroundScale);
    const imageTop = Math.max(0, (worldTop - transform.y) / backgroundScale);
    const imageRight = Math.min(imageWidth, (worldRight - transform.x) / backgroundScale);
    const imageBottom = Math.min(imageHeight, (worldBottom - transform.y) / backgroundScale);
    const tileWorld = TILE_SIZE_PX * level.scale;
    const firstColumn = Math.max(0, Math.floor(imageLeft / tileWorld) - 1);
    const lastColumn = Math.min(level.columns - 1, Math.ceil(imageRight / tileWorld) + 1);
    const firstRow = Math.max(0, Math.floor(imageTop / tileWorld) - 1);
    const lastRow = Math.min(level.rows - 1, Math.ceil(imageBottom / tileWorld) + 1);

    for (const child of [...layer.getChildren()]) {
      if (child !== this.previewNode) {
        child.destroy();
      }
    }
    const clipped = new Konva.Group({
      listening: false,
      clip: { x: 0, y: 0, width: map.width, height: map.height },
    });
    const group = new Konva.Group({
      listening: false,
      x: transform.x,
      y: transform.y,
      scaleX: backgroundScale,
      scaleY: backgroundScale,
    });
    clipped.add(group);
    layer.add(clipped);
    let pending = 0;
    let failed = 0;
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        pending += 1;
        const url = tileUrl(map.hash, level.level, column, row);
        void params.loadImage(url)
          .then((image) => {
            if (!isCurrent() || isInteracting()) {
              return;
            }
            const tileWidth = Math.min(level.width - column * TILE_SIZE_PX, TILE_SIZE_PX);
            const tileHeight = Math.min(level.height - row * TILE_SIZE_PX, TILE_SIZE_PX);
            group.add(new Konva.Image({
              image,
              x: column * tileWorld,
              y: row * tileWorld,
              // Un pixel di sovrapposizione evita cuciture visibili a scale frazionarie.
              width: tileWidth * level.scale + 1,
              height: tileHeight * level.scale + 1,
              listening: false,
            }));
            layer.batchDraw();
          })
          .catch(() => {
            failed += 1;
          })
          .finally(() => {
            pending -= 1;
            if (!isCurrent() || isInteracting()) {
              return;
            }
            if (pending === 0) {
              const ready = failed === 0;
              this.previewNode?.visible(!ready);
              params.onTilesReady(ready);
              layer.batchDraw();
            }
          });
      }
    }
    if (pending === 0) {
      this.previewNode?.visible(false);
      params.onTilesReady(true);
    }
  }

  private place(
    layer: Konva.Layer,
    map: MapImageSource,
    image: HTMLImageElement,
    isCurrent: () => boolean,
    transform: BackgroundTransform,
  ): boolean {
    if (!isCurrent()) {
      return false;
    }
    const imageWidth = map.imageWidth ?? (image.naturalWidth > 0 ? image.naturalWidth : map.width);
    const imageHeight = map.imageHeight
      ?? (image.naturalHeight > 0 ? image.naturalHeight : map.height);
    const clipped = new Konva.Group({
      listening: false,
      clip: { x: 0, y: 0, width: map.width, height: map.height },
    });
    clipped.add(new Konva.Image({
      image,
      x: transform.x,
      y: transform.y,
      width: imageWidth * transform.scale,
      height: imageHeight * transform.scale,
      listening: false,
    }));
    layer.add(clipped);
    if (map.tiled) {
      this.previewNode = clipped;
    }
    layer.draw();
    return true;
  }
}
