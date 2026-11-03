import { signal, type Signal, type WritableSignal } from '@angular/core';
import {
  disabled,
  form,
  max,
  maxLength,
  min,
  pattern,
  required,
  validate,
} from '@angular/forms/signals';
import type { MapDocument } from '@dnd-vtt/shared';

export interface MapPropertiesFormModel {
  name: string;
  notes: string;
  fogBase: 'hidden' | 'revealed';
  gridType: 'square' | 'hex';
  cellSizePx: number;
  offsetX: number;
  offsetY: number;
  feetPerCell: number;
  diagonalRule: '5-5-5' | '5-10-5';
  ambientLight: 'bright' | 'dim' | 'dark';
  visionLimitFeet: number;
  visionEnabled: boolean;
  showDoorIcons: boolean;
}

/** Limiti condivisi tra form, template e test. */
export const MAP_NAME_MAX_LENGTH = 120;
export const MAP_NOTES_MAX_LENGTH = 4000;
export const MAP_CELL_SIZE_MIN_PX = 16;
export const MAP_CELL_SIZE_MAX_PX = 400;
export const MAP_FEET_PER_CELL_MIN = 0.5;
export const MAP_VISION_LIMIT_MIN_FEET = 1;

export const emptyMapProperties = (): MapPropertiesFormModel => ({
  name: '',
  notes: '',
  fogBase: 'hidden',
  gridType: 'square',
  cellSizePx: 70,
  offsetX: 0,
  offsetY: 0,
  feetPerCell: 5,
  diagonalRule: '5-5-5',
  ambientLight: 'dark',
  visionLimitFeet: 120,
  visionEnabled: true,
  showDoorIcons: true,
});

export const mapPropertiesFromDocument = (doc: MapDocument): MapPropertiesFormModel => ({
  name: doc.name,
  notes: doc.notes,
  fogBase: doc.fogBase,
  gridType: doc.grid.type,
  cellSizePx: doc.grid.cellSizePx,
  offsetX: doc.grid.offsetX,
  offsetY: doc.grid.offsetY,
  feetPerCell: doc.grid.feetPerCell,
  diagonalRule: doc.grid.diagonalRule,
  ambientLight: doc.terrain.ambientLight,
  visionLimitFeet: doc.terrain.visionLimitFeet,
  visionEnabled: doc.terrain.visionEnabled,
  showDoorIcons: doc.showDoorIcons,
});

const PROPERTY_KEYS = [
  'name',
  'notes',
  'fogBase',
  'gridType',
  'cellSizePx',
  'offsetX',
  'offsetY',
  'feetPerCell',
  'diagonalRule',
  'ambientLight',
  'visionLimitFeet',
  'visionEnabled',
  'showDoorIcons',
] as const satisfies readonly (keyof MapPropertiesFormModel)[];

export const sameMapProperties = (
  first: MapPropertiesFormModel,
  second: MapPropertiesFormModel,
): boolean => PROPERTY_KEYS.every((key) => first[key] === second[key]);

const numericMessage = 'Inserisci un numero valido.';

/**
 * Form dei campi live dell'inspector. `maxSightFeet` resta una signal perché il
 * limite dipende da cella e piedi per cella, modificabili nello stesso form.
 */
export const createMapPropertiesForm = (
  model: WritableSignal<MapPropertiesFormModel>,
  maxSightFeet: Signal<number>,
) => form(model, (path) => {
  required(path.name, { message: 'Inserisci il nome della mappa.' });
  pattern(path.name, /\S/, { message: 'Il nome della mappa non può essere vuoto.' });
  maxLength(path.name, MAP_NAME_MAX_LENGTH, {
    message: `Il nome non può superare ${MAP_NAME_MAX_LENGTH} caratteri.`,
  });
  maxLength(path.notes, MAP_NOTES_MAX_LENGTH, {
    message: `Le note non possono superare ${MAP_NOTES_MAX_LENGTH} caratteri.`,
  });
  min(path.cellSizePx, MAP_CELL_SIZE_MIN_PX, {
    message: `La cella deve essere almeno ${MAP_CELL_SIZE_MIN_PX} px.`,
  });
  max(path.cellSizePx, MAP_CELL_SIZE_MAX_PX, {
    message: `La cella non può superare ${MAP_CELL_SIZE_MAX_PX} px.`,
  });
  min(path.feetPerCell, MAP_FEET_PER_CELL_MIN, {
    message: `Servono almeno ${MAP_FEET_PER_CELL_MIN} piedi per cella.`,
  });
  min(path.visionLimitFeet, MAP_VISION_LIMIT_MIN_FEET, {
    message: `Il limite di vista deve essere almeno ${MAP_VISION_LIMIT_MIN_FEET} ft.`,
  });
  max(path.visionLimitFeet, () => maxSightFeet(), {
    message: () => `Il limite non può superare ${maxSightFeet()} ft.`,
  });
  validate(path.offsetX, ({ value }) =>
    Number.isFinite(value()) ? null : { kind: 'number', message: numericMessage });
  validate(path.offsetY, ({ value }) =>
    Number.isFinite(value()) ? null : { kind: 'number', message: numericMessage });
  disabled(path.visionEnabled, {
    when: ({ valueOf }) => valueOf(path.gridType) !== 'square',
  });
});

export type MapPropertiesForm = ReturnType<typeof createMapPropertiesForm>;

/** Modello vuoto usato prima del caricamento del documento. */
export const createMapPropertiesModel = (): WritableSignal<MapPropertiesFormModel> =>
  signal(emptyMapProperties());
