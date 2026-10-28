import { describe, expect, it } from 'vitest';
import { isTiledMap, maxTileLevel, tileLevelForScale, tileLevels, tileUrl } from './tiles.js';

describe('piramide di tile', () => {
  it('calcola i livelli per una mappa 8k', () => {
    expect(maxTileLevel(8192, 2048)).toBe(4);
    const levels = tileLevels(8192, 2048);
    expect(levels).toHaveLength(5);
    expect(levels[0]).toMatchObject({ columns: 16, rows: 4 });
    expect(levels[4]).toMatchObject({ columns: 1, rows: 1, scale: 16 });
  });

  it('sceglie il livello adatto alla scala dello stage', () => {
    expect(tileLevelForScale(1, 8192, 2048).level).toBe(0);
    expect(tileLevelForScale(0.5, 8192, 2048).level).toBe(1);
    expect(tileLevelForScale(0.12, 8192, 2048).level).toBe(3);
    expect(tileLevelForScale(0.01, 8192, 2048).level).toBe(4);
  });

  it('usa il fallback a immagine singola sotto la soglia', () => {
    expect(isTiledMap(2048, 2048)).toBe(false);
    expect(isTiledMap(2049, 1024)).toBe(true);
    expect(tileUrl('abc', 2, 3, 4)).toBe('/uploads/tiles/abc/2/3_4.webp');
  });
});
