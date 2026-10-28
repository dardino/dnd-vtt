import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Metadata } from 'sharp';
import type { Asset } from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../config/env.js';
import type { AppDatabase } from '../db/client.js';
import { findAssetByHash, insertAsset } from '../db/assets.repository.js';
import { actors, scenes } from '../db/schema.js';
import { AppError } from '../errors.js';

const SHARP_OPTIONS = { limitInputPixels: 100_000_000, failOn: 'error' as const };
const FORMAT_EXTENSION = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
const FORMAT_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
const THUMB_WIDTH = 320;

/**
 * L'originale viene conservato, ma il file servito è sempre il WebP
 * ri-codificato da `sharp`: niente SVG, niente polyglot, niente EXIF.
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
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, SHARP_OPTIONS).metadata();
  } catch {
    throw new AppError('unsupported_media_type', 415, 'Il file non è un\'immagine supportata');
  }
  const format = metadata.format;
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') {
    throw new AppError('unsupported_media_type', 415, 'Sono ammessi solo PNG, JPEG e WebP');
  }
  if (metadata.width === undefined || metadata.height === undefined) {
    throw new AppError('unsupported_media_type', 415, 'Immagine senza dimensioni leggibili');
  }
  const webp = await sharp(buffer, SHARP_OPTIONS).rotate().webp({ quality: 82 }).toBuffer();
  const thumb = await sharp(buffer, SHARP_OPTIONS)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  const extension = FORMAT_EXTENSION[format];
  const originalPath = `originals/${hash}.${extension}`;
  const webpPath = `webp/${hash}.webp`;
  const thumbPath = `thumbs/${hash}.webp`;
  await mkdir(join(env.uploadDir, 'originals'), { recursive: true });
  await mkdir(join(env.uploadDir, 'webp'), { recursive: true });
  await mkdir(join(env.uploadDir, 'thumbs'), { recursive: true });
  await Promise.all([
    writeFile(join(env.uploadDir, originalPath), buffer),
    writeFile(join(env.uploadDir, webpPath), webp),
    writeFile(join(env.uploadDir, thumbPath), thumb),
  ]);
  return insertAsset(db, {
    hash,
    mime: FORMAT_MIME[format],
    bytes: buffer.byteLength,
    width: metadata.width,
    height: metadata.height,
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
  return db.select({ id: actors.id }).from(actors)
    .where(eq(actors.imageAssetId, id))
    .get() !== undefined;
};
