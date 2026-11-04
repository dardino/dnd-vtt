import { describe, expect, it } from 'vitest';
import {
  createMapSchema,
  emptyMapDocument,
  mapDocumentSchema,
  SCENE_PRESETS,
  sceneDimensions,
} from './map.js';
import { createSceneSchema, updateSceneSchema } from './scene.js';
import { backgroundTransformSchema, defaultBackgroundTransform } from './scene-size.js';

describe('preset di risoluzione', () => {
  it('espone le dimensioni landscape e portrait della tabella', () => {
    expect(sceneDimensions('720p', 'landscape')).toEqual({ widthPx: 1280, heightPx: 720 });
    expect(sceneDimensions('720p', 'portrait')).toEqual({ widthPx: 720, heightPx: 1280 });
    expect(sceneDimensions('1080p', 'landscape')).toEqual({ widthPx: 1920, heightPx: 1080 });
    expect(sceneDimensions('1080p', 'portrait')).toEqual({ widthPx: 1080, heightPx: 1920 });
    expect(sceneDimensions('1440p', 'landscape')).toEqual({ widthPx: 2560, heightPx: 1440 });
    expect(sceneDimensions('4k', 'landscape')).toEqual({ widthPx: 3840, heightPx: 2160 });
    expect(sceneDimensions('ultrawide-4k', 'landscape')).toEqual({ widthPx: 5120, heightPx: 2160 });
  });

  it('ripiega sul landscape per gli ultrawide in portrait', () => {
    expect(SCENE_PRESETS['ultrawide-1080p'].portrait).toBeNull();
    expect(sceneDimensions('ultrawide-1080p', 'portrait')).toEqual({ widthPx: 2560, heightPx: 1080 });
  });
});

describe('backgroundTransform', () => {
  it('applica i default neutri', () => {
    expect(backgroundTransformSchema.parse({})).toEqual(defaultBackgroundTransform);
  });

  it('rifiuta una scala non positiva', () => {
    expect(backgroundTransformSchema.safeParse({ scale: 0 }).success).toBe(false);
  });
});

describe('schemi mappa e scena', () => {
  it('mapDocumentSchema applica la trasformazione di default', () => {
    const doc = mapDocumentSchema.parse({
      name: 'Mappa',
      imageAssetId: null,
      widthPx: 1280,
      heightPx: 720,
      grid: {},
      terrain: {},
    });
    expect(doc.backgroundTransform).toEqual(defaultBackgroundTransform);
  });

  it('emptyMapDocument include la trasformazione e il colore di default', () => {
    const doc = emptyMapDocument('Mappa', null, 1280, 720);
    expect(doc.backgroundTransform).toEqual(defaultBackgroundTransform);
    expect(doc.backgroundColor).toBe('rgba(255, 255, 255, 1)');
    expect(mapDocumentSchema.safeParse({ ...doc, backgroundColor: 'red' }).success).toBe(false);
  });

  it('createMapSchema default 1080p landscape e sfondo opzionale', () => {
    const input = createMapSchema.parse({ name: 'Mappa' });
    expect(input.preset).toBe('1080p');
    expect(input.orientation).toBe('landscape');
    expect(input.imageAssetId).toBeUndefined();
  });

  it('createSceneSchema accetta preset; updateSceneSchema rifiuta la risoluzione', () => {
    const created = createSceneSchema.parse({
      name: 'Scena',
      preset: '4k',
      orientation: 'portrait',
      backgroundTransform: { x: 10, y: -5, scale: 1.5 },
    });
    expect(created.preset).toBe('4k');
    expect(created.backgroundTransform).toEqual({ x: 10, y: -5, scale: 1.5 });

    const updated = updateSceneSchema.parse({ name: 'Scena rinominata' });
    expect(updated.name).toBe('Scena rinominata');
    expect(updateSceneSchema.safeParse({ orientation: 'portrait' }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ preset: '4k' }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ widthPx: 1280 }).success).toBe(false);
    expect(updateSceneSchema.safeParse({ heightPx: 720 }).success).toBe(false);
  });
});
