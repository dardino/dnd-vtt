import {
  isImageGraphic,
  isPolygonGraphic,
  isTextGraphic,
  type CellPoint,
  type MapGraphic,
} from '@dnd-vtt/shared';
import type { GraphicField } from './map-graphic-inspector.component';
import { TEXT_FONT_FAMILIES } from './map-text-fonts';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Limite dello schema per il testo libero di una grafica. */
export const GRAPHIC_TEXT_MAX_LENGTH = 120;

/** Limite dello schema per i vertici di un poligono grafico. */
export const GRAPHIC_POLYGON_MAX_VERTICES = 200;

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
};

/** Stesse regole dello schema: niente testo vuoto, oltre 120 o con control. */
export const isValidGraphicText = (value: string): boolean =>
  value.length >= 1 && value.length <= GRAPHIC_TEXT_MAX_LENGTH && !hasControlCharacter(value);

const isFontFamily = (value: string): boolean =>
  (TEXT_FONT_FAMILIES as readonly string[]).includes(value);

/**
 * Valida un aggiornamento dell'inspector per la variante della grafica.
 * Ritorna `null` quando il campo non appartiene al tipo o il valore è invalido.
 */
export const validateGraphicField = (
  graphic: MapGraphic,
  field: GraphicField,
  value: number | string,
): number | string | null => {
  if (typeof value === 'string') {
    if (field === 'fill') {
      return isPolygonGraphic(graphic) && HEX_COLOR.test(value) ? value : null;
    }
    if (field === 'text') {
      return isTextGraphic(graphic) && isValidGraphicText(value) ? value : null;
    }
    if (field === 'fontFamily') {
      return isTextGraphic(graphic) && isFontFamily(value) ? value : null;
    }
    if (field === 'color') {
      return isTextGraphic(graphic) && HEX_COLOR.test(value) ? value : null;
    }
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  if (field === 'opacity') {
    return value >= 0 && value <= 1 ? value : null;
  }
  if (field === 'scale') {
    return isImageGraphic(graphic) && value > 0 ? value : null;
  }
  if (field === 'rotation') {
    return isImageGraphic(graphic) ? value : null;
  }
  if (field === 'fontSize') {
    return isTextGraphic(graphic)
      && Number.isInteger(value)
      && value >= 8
      && value <= 200
      ? value
      : null;
  }
  if (field === 'x' || field === 'y') {
    if (isImageGraphic(graphic)) {
      return value;
    }
    // Lo schema del testo richiede coordinate intere; le immagini restano libere.
    return isTextGraphic(graphic) && Number.isInteger(value) ? value : null;
  }
  return null;
};

export interface TranslationBounds {
  /** Coordinata massima ammessa su X, in celle. */
  maxX: number;
  /** Coordinata massima ammessa su Y, in celle. */
  maxY: number;
}

/**
 * Trasla i vertici di un poligono di `dx`/`dy` celle, clampando il delta
 * affinché l'intera forma resti dentro la mappa e la geometria non si deformi.
 */
export const translatePolygonPoints = (
  points: readonly CellPoint[],
  dx: number,
  dy: number,
  bounds: TranslationBounds,
): CellPoint[] => {
  if (points.length === 0) {
    return [];
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const clampedX = Math.min(bounds.maxX - maxX, Math.max(-minX, dx));
  const clampedY = Math.min(bounds.maxY - maxY, Math.max(-minY, dy));
  return points.map((point) => ({
    x: point.x + clampedX,
    y: point.y + clampedY,
  }));
};
