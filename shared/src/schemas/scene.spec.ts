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
import { legacyCompleteMapDocument } from '../test/map-documents.js';

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
  it('mapDocumentSchema è il documento v2 con i quattro layer canonici', () => {
    const doc = mapDocumentSchema.parse(emptyMapDocument('Mappa', null, 1280, 720));
    expect(doc.schemaVersion).toBe(2);
    expect(doc.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);
    expect(doc.layers[0].imageTransform).toEqual(defaultBackgroundTransform);
  });

  it('mapDocumentSchema rifiuta un documento v1 con i campi legacy', () => {
    expect(mapDocumentSchema.safeParse(legacyCompleteMapDocument()).success).toBe(false);
    for (const field of ['imageAssetId', 'backgroundTransform', 'terrain', 'spawns', 'playerStarts']) {
      const legacy = { ...emptyMapDocument('Mappa', null, 1280, 720), [field]: null };
      expect(mapDocumentSchema.safeParse(legacy).success).toBe(false);
    }
  });

  it('emptyMapDocument include la trasformazione nel layer background e il colore di default', () => {
    const doc = emptyMapDocument('Mappa', null, 1280, 720);
    expect(doc.layers[0].imageTransform).toEqual(defaultBackgroundTransform);
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
