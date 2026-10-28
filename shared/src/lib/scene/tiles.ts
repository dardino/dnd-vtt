export const TILE_SIZE_PX = 512;
export const TILE_LOD_THRESHOLD_PX = 2048;

const log2 = (value: number): number => Math.log(value) / Math.log(2);

export const maxTileLevel = (width: number, height: number): number => {
  const longest = Math.max(width, height);
  if (longest <= TILE_SIZE_PX) {
    return 0;
  }
  return Math.max(0, Math.ceil(log2(longest / TILE_SIZE_PX)));
};

export const isTiledMap = (width: number, height: number): boolean =>
  Math.max(width, height) > TILE_LOD_THRESHOLD_PX;

export interface TileLevel {
  level: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  scale: number;
}

export const tileLevels = (width: number, height: number): TileLevel[] => {
  const max = maxTileLevel(width, height);
  return Array.from({ length: max + 1 }, (_, level) => {
    const scale = 2 ** level;
    const levelWidth = Math.ceil(width / scale);
    const levelHeight = Math.ceil(height / scale);
    return {
      level,
      width: levelWidth,
      height: levelHeight,
      columns: Math.ceil(levelWidth / TILE_SIZE_PX),
      rows: Math.ceil(levelHeight / TILE_SIZE_PX),
      scale,
    };
  });
};

/**
 * Livello da usare per una scala dello stage: ogni livello raddoppia i pixel
 * immagine coperti da una tile, così la tile resta nitida senza caricare
 * l'immagine intera.
 */
export const tileLevelForScale = (
  scale: number,
  width: number,
  height: number,
): TileLevel => {
  const levels = tileLevels(width, height);
  const safeScale = Math.max(scale, 0.0001);
  const desired = Math.floor(log2(1 / safeScale));
  const level = Math.min(Math.max(desired, 0), levels.length - 1);
  return levels[level] ?? {
    level: 0,
    width,
    height,
    columns: Math.ceil(width / TILE_SIZE_PX),
    rows: Math.ceil(height / TILE_SIZE_PX),
    scale: 1,
  };
};

export const tileUrl = (
  hash: string,
  level: number,
  column: number,
  row: number,
): string => `/uploads/tiles/${hash}/${level}/${column}_${row}.webp`;

export const previewUrl = (hash: string): string => `/uploads/previews/${hash}.webp`;
