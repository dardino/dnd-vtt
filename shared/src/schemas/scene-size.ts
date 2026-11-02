import { z } from 'zod';

export const backgroundTransformSchema = z.strictObject({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
});
export type BackgroundTransform = z.infer<typeof backgroundTransformSchema>;

/** Trasformazione neutra: lo sfondo non è spostato né riscalato. */
export const defaultBackgroundTransform: BackgroundTransform = { x: 0, y: 0, scale: 1 };

export const resolutionPresetSchema = z.enum([
  '720p',
  '1080p',
  '1440p',
  '4k',
  'ultrawide-720p',
  'ultrawide-1080p',
  'ultrawide-1440p',
  'ultrawide-4k',
]);
export type ResolutionPreset = z.infer<typeof resolutionPresetSchema>;

export const orientationSchema = z.enum(['landscape', 'portrait']);
export type Orientation = z.infer<typeof orientationSchema>;
