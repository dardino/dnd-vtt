import type { Map, MapDocument } from '@dnd-vtt/shared';

/**
 * Riduce la risposta completa della mappa al documento v2 salvabile. I campi
 * di identità e i riferimenti denormalizzati restano fuori dal documento.
 */
export const toMapDocument = (map: Map): MapDocument => ({
  schemaVersion: 2,
  name: map.name,
  backgroundColor: map.backgroundColor,
  widthPx: map.widthPx,
  heightPx: map.heightPx,
  grid: structuredClone(map.grid),
  layers: structuredClone(map.layers),
  ambientLight: map.ambientLight,
  visionLimitFeet: map.visionLimitFeet,
  visionEnabled: map.visionEnabled,
  ...(map.startView === undefined ? {} : { startView: map.startView }),
  fogBase: map.fogBase,
  showDoorIcons: map.showDoorIcons,
  notes: map.notes,
});
