import { z } from 'zod';

/** Colore del foglio di una mappa/scena senza immagine, in formato CSS `rgba()`. */
export const DEFAULT_MAP_BACKGROUND_COLOR = 'rgba(255, 255, 255, 1)';

const MAP_COLOR_CHANNEL = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const MAP_COLOR_ALPHA = '(?:0|1|0?\\.\\d+)';

export const mapBackgroundColorSchema = z
  .string()
  .regex(
    new RegExp(
      `^rgba\\(${MAP_COLOR_CHANNEL}, ${MAP_COLOR_CHANNEL}, ${MAP_COLOR_CHANNEL}, ${MAP_COLOR_ALPHA}\\)$`,
    ),
    { message: 'Il colore deve essere nel formato rgba(r, g, b, a)' },
  );

/** Colore esadecimale a sei cifre usato dalle grafiche vettoriali e di testo. */
export const mapHexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export type MapHexColor = z.infer<typeof mapHexColorSchema>;
