import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapImageLoader } from './map-image-loader';

type ImageBehavior = 'pending' | 'sync-load' | 'fail';

/**
 * Sostituto controllabile di `Image`: registra ogni istanza e permette al test
 * di scegliere se l'evento arriva in modo sincrono, asincrono o con errore.
 */
class ImageStub {
  public static instances: ImageStub[] = [];
  public static behavior: ImageBehavior = 'pending';

  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public naturalWidth = 120;
  public naturalHeight = 80;
  public readonly srcAssignments: string[] = [];
  private currentSrc = '';

  public constructor() {
    ImageStub.instances.push(this);
  }

  public get src(): string {
    return this.currentSrc;
  }

  public set src(value: string) {
    this.currentSrc = value;
    this.srcAssignments.push(value);
    if (ImageStub.behavior === 'sync-load') {
      this.onload?.();
    } else if (ImageStub.behavior === 'fail') {
      this.onerror?.();
    }
  }

  public fireLoad(): void {
    this.onload?.();
  }
}

const instances = (): ImageStub[] => ImageStub.instances;

const last = (): ImageStub => {
  const image = instances().at(-1);
  if (image === undefined) {
    throw new Error('nessuna Image creata');
  }
  return image;
};

describe('MapImageLoader', () => {
  beforeEach(() => {
    ImageStub.instances = [];
    ImageStub.behavior = 'pending';
    vi.stubGlobal('Image', ImageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('riusa la cache: il secondo get non crea Image né richiama la callback', () => {
    const loader = new MapImageLoader();
    const onLoad = vi.fn();

    expect(loader.get('/a.png', onLoad)).toBeNull();
    expect(instances()).toHaveLength(1);
    last().fireLoad();
    expect(onLoad).toHaveBeenCalledTimes(1);

    const cached = loader.get('/a.png', onLoad);

    expect(cached).toBe(instances()[0]);
    expect(instances()).toHaveLength(1);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('con onload sincrono restituisce subito l’elemento senza callback', () => {
    ImageStub.behavior = 'sync-load';
    const loader = new MapImageLoader();
    const onLoad = vi.fn();

    const element = loader.get('/sync.png', onLoad);

    expect(element).toBe(last());
    expect(instances()).toHaveLength(1);
    // Il chiamante ha già l'immagine pronta: nessun re-render da richiedere.
    expect(onLoad).not.toHaveBeenCalled();

    expect(loader.get('/sync.png', onLoad)).toBe(element);
    expect(instances()).toHaveLength(1);
  });

  it('con onload asincrono restituisce null e invoca la callback una sola volta', () => {
    const loader = new MapImageLoader();
    const onLoad = vi.fn();

    expect(loader.get('/async.png', onLoad)).toBeNull();
    expect(onLoad).not.toHaveBeenCalled();

    last().fireLoad();

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(loader.get('/async.png', onLoad)).toBe(instances()[0]);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('con onerror non chiama la callback e non ritenta ai get successivi', () => {
    ImageStub.behavior = 'fail';
    const loader = new MapImageLoader();
    const onLoad = vi.fn();

    expect(loader.get('/broken.png', onLoad)).toBeNull();
    expect(onLoad).not.toHaveBeenCalled();
    expect(instances()).toHaveLength(1);

    expect(loader.get('/broken.png', onLoad)).toBeNull();

    // Un errore è definitivo: niente nuova Image, niente nuovo src, niente callback.
    expect(instances()).toHaveLength(1);
    expect(instances()[0]?.srcAssignments).toHaveLength(1);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('due get simultanee dello stesso URL condividono una sola Image e la callback', () => {
    const loader = new MapImageLoader();
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    expect(loader.get('/shared.png', firstCallback)).toBeNull();
    expect(loader.get('/shared.png', secondCallback)).toBeNull();
    expect(instances()).toHaveLength(1);

    last().fireLoad();

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });
});
