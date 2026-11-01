import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Metadata } from 'sharp';
import { TILE_SIZE_PX, isTiledMap, tileLevels, type Asset } from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { findAssetByHash, insertAsset } from '../db/assets.repository.js';
import { actors, maps, scenes } from '../db/schema.js';
import { AppError } from '../errors.js';

const SHARP_OPTIONS = { limitInputPixels: 100_000_000, failOn: 'error' as const };
const FORMAT_EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
const FORMAT_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
const THUMB_WIDTH = 320;
const PREVIEW_MAX = 2048;

const writeTiles = async (
  uploadDir: string,
  hash: string,
  webp: Buffer,
  width: number,
  height: number,
): Promise<void> => {
  for (const level of tileLevels(width, height)) {
    const scaled = level.level === 0
      ? webp
      : await sharp(webp, SHARP_OPTIONS)
        .resize({ width: level.width, height: level.height, fit: 'fill' })
        .webp({ quality: 82 })
        .toBuffer();
    const directory = join(uploadDir, 'tiles', hash, String(level.level));
    await mkdir(directory, { recursive: true });
    const writes: Promise<void>[] = [];
    for (let row = 0; row < level.rows; row += 1) {
      for (let column = 0; column < level.columns; column += 1) {
        const left = column * TILE_SIZE_PX;
        const top = row * TILE_SIZE_PX;
        const tileWidth = Math.min(TILE_SIZE_PX, level.width - left);
        const tileHeight = Math.min(TILE_SIZE_PX, level.height - top);
        writes.push(
          sharp(scaled, SHARP_OPTIONS)
            .extract({ left, top, width: tileWidth, height: tileHeight })
            .webp({ quality: 82 })
            .toBuffer()
            .then((tile) => writeFile(join(directory, `${column}_${row}.webp`), tile)),
        );
      }
    }
    await Promise.all(writes);
  }
};

/**
 * Il file servito è sempre il WebP ri-codificato da `sharp`: niente SVG,
 * niente polyglot, niente EXIF. Con `KEEP_ORIGINALS=false` (default) il buffer
 * originale non viene scritto su disco: la deduplica usa solo l'hash nel DB.
 * Le mappe oltre 2048 px ricevono preview e piramide di tile (D48).
 */
export const storeAsset = async (
  env: AppEnv,
  db: AppDatabase,
  buffer: Buffer,
): Promise<Asset> => {
  const hash = createHash('sha256').update(buffer).digest('hex');
  const existing = findAssetByHash(db, hash);
  if (existing !== null) {
    return existing;
  }
  let source: Metadata;
  try {
    source = await sharp(buffer, SHARP_OPTIONS).metadata();
  } catch {
    throw new AppError('unsupported_media_type', 415, 'Il file non è un\'immagine supportata');
  }
  const format = source.format;
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
    throw new AppError('unsupported_media_type', 415, 'Sono ammessi solo PNG, JPEG e WebP');
  }
  const webp = await sharp(buffer, SHARP_OPTIONS).rotate().webp({ quality: 82 }).toBuffer();
  const metadata = await sharp(webp, SHARP_OPTIONS).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new AppError('unsupported_media_type', 415, 'Immagine senza dimensioni leggibili');
  }
  const width = metadata.width;
  const height = metadata.height;
  const preview = await sharp(buffer, SHARP_OPTIONS)
    .rotate()
    .resize({ width: PREVIEW_MAX, height: PREVIEW_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const thumb = await sharp(buffer, SHARP_OPTIONS)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  const originalPath = env.keepOriginals ? `originals/${hash}.${FORMAT_EXTENSION[format]}` : '';
  const webpPath = `webp/${hash}.webp`;
  const previewPath = `previews/${hash}.webp`;
  const thumbPath = `thumbs/${hash}.webp`;
  await mkdir(join(env.uploadDir, 'webp'), { recursive: true });
  await mkdir(join(env.uploadDir, 'previews'), { recursive: true });
  await mkdir(join(env.uploadDir, 'thumbs'), { recursive: true });
  const writes: Promise<void>[] = [
    writeFile(join(env.uploadDir, webpPath), webp),
    writeFile(join(env.uploadDir, previewPath), preview),
    writeFile(join(env.uploadDir, thumbPath), thumb),
  ];
  if (originalPath !== '') {
    await mkdir(join(env.uploadDir, 'originals'), { recursive: true });
    writes.push(writeFile(join(env.uploadDir, originalPath), buffer));
  }
  await Promise.all(writes);
  if (isTiledMap(width, height)) {
    await writeTiles(env.uploadDir, hash, webp, width, height);
  }
  return insertAsset(db, {
    hash,
    mime: FORMAT_MIME[format],
    bytes: buffer.byteLength,
    width,
    height,
    originalPath,
    webpPath,
    thumbPath,
  });
};

export const assetInUse = (db: AppDatabase, id: string): boolean => {
  const scene = db.select({ id: scenes.id }).from(scenes).where(eq(scenes.imageAssetId, id)).get();
  if (scene !== undefined) {
    return true;
  }
  const map = db.select({ id: maps.id }).from(maps).where(eq(maps.imageAssetId, id)).get();
  if (map !== undefined) {
    return true;
  }
  return db.select({ id: actors.id }).from(actors)
    .where(eq(actors.imageAssetId, id))
    .get() !== undefined;
};
