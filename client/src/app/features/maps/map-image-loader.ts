/**
 * Cache di immagini per i renderer Konva dell'editor mappa.
 *
 * Il caricamento è condiviso per URL: richieste simultanee della stessa
 * immagine riusano una sola `Image` e accodano le callback, invocate una sola
 * volta al termine. Un errore è definitivo (`failed`): i `get` successivi non
 * ritentano e non chiamano callback. Se `onload` scatta in modo sincrono (mock
 * di test o cache del browser) l'elemento è già disponibile e il chiamante lo
 * ottiene dal valore di ritorno, senza ri-render.
 */
export class MapImageLoader {
  private readonly loaded = new Map<string, HTMLImageElement>();
  private readonly pending = new Map<string, Array<() => void>>();
  private readonly failed = new Set<string>();

  public get(url: string, onLoad: () => void): HTMLImageElement | null {
    if (this.failed.has(url)) {
      return null;
    }
    const cached = this.loaded.get(url);
    if (cached !== undefined) {
      return cached;
    }
    const waiting = this.pending.get(url);
    if (waiting !== undefined) {
      waiting.push(onLoad);
      return null;
    }
    const callbacks = [onLoad];
    this.pending.set(url, callbacks);
    let synchronous = true;
    const element = new Image();
    element.onload = () => {
      this.loaded.set(url, element);
      this.pending.delete(url);
      if (synchronous) {
        return;
      }
      for (const callback of callbacks) {
        callback();
      }
    };
    element.onerror = () => {
      this.pending.delete(url);
      this.failed.add(url);
    };
    element.src = url;
    synchronous = false;
    return this.loaded.get(url) ?? null;
  }
}
