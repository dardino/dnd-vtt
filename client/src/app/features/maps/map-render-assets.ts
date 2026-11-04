import type { Asset } from '@dnd-vtt/shared';
import type { MapRenderImage } from './map-image-renderer';

/** URL e dimensioni naturali di un asset, sufficienti a caricarne l'immagine. */
export interface RenderImageSource {
  url: string;
  width: number;
  height: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Estrae la sorgente immagine da un asset; `null` se l'asset non è disponibile. */
export const renderImageSource = (
  asset: Asset | null | undefined,
): RenderImageSource | null =>
  asset === null || asset === undefined
    ? null
    : { url: asset.url, width: asset.width, height: asset.height };

/**
 * Decodifica un'immagine per il canvas 2D. Restituisce `null` su errore, URL
 * vuoto o timeout: il render salta l'elemento invece di bloccare il salvataggio.
 */
export const loadRenderImage = (
  source: RenderImageSource,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<MapRenderImage | null> => {
  if (source.url === '' || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise<MapRenderImage | null>((resolve) => {
    let settled = false;
    const finish = (image: MapRenderImage | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(image);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const settle = (image: MapRenderImage | null): void => {
      clearTimeout(timer);
      finish(image);
    };
    const element = new Image();
    element.onload = () => settle({
      width: element.naturalWidth || source.width,
      height: element.naturalHeight || source.height,
      source: element,
    });
    element.onerror = () => settle(null);
    element.src = source.url;
    if (element.complete && element.naturalWidth > 0) {
      settle({
        width: element.naturalWidth || source.width,
        height: element.naturalHeight || source.height,
        source: element,
      });
    }
  });
};
