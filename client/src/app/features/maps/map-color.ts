export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const RGBA_PATTERN = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/;

export const parseRgba = (value: string): RgbaColor | null => {
  const match = RGBA_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const [, r, g, b, a] = match;
  if (r === undefined || g === undefined || b === undefined || a === undefined) {
    return null;
  }
  const red = Number(r);
  const green = Number(g);
  const blue = Number(b);
  const alpha = Number(a);
  if ([red, green, blue].some((channel) => channel > 255) || alpha > 1) {
    return null;
  }
  return { r: red, g: green, b: blue, a: alpha };
};

const channelHex = (value: number): string => value.toString(16).padStart(2, '0');

/** Converte `rgba(...)` in `#rrggbb`; un valore invalido ricade sul bianco. */
export const rgbaToHex = (value: string): string => {
  const color = parseRgba(value);
  if (color === null) {
    return '#ffffff';
  }
  return `#${channelHex(color.r)}${channelHex(color.g)}${channelHex(color.b)}`;
};

/** Percentuale 0–100 dell'alfa, arrotondata per il controllo range. */
export const rgbaAlphaPercent = (value: string): number => {
  const color = parseRgba(value);
  return Math.round((color?.a ?? 1) * 100);
};

/** Costruisce il valore canonico a partire dal picker hex e dall'alfa. */
export const hexAlphaToRgba = (hex: string, alphaPercent: number): string => {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff';
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const alpha = Math.min(1, Math.max(0, alphaPercent / 100));
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`;
};
