import type { MapDocument } from '@dnd-vtt/shared';

/** Riduce la risposta completa della mappa al documento salvabile. */
export const toMapDocument = (map: {
  name: string;
  imageAssetId: string | null;
  backgroundTransform: MapDocument['backgroundTransform'];
  widthPx: number;
  heightPx: number;
  grid: MapDocument['grid'];
  terrain: MapDocument['terrain'];
  spawns: MapDocument['spawns'];
  playerStarts: MapDocument['playerStarts'];
  startView?: MapDocument['startView'];
  fogBase: MapDocument['fogBase'];
  showDoorIcons: boolean;
  notes: string;
}): MapDocument => ({
  name: map.name,
  imageAssetId: map.imageAssetId,
  backgroundTransform: map.backgroundTransform,
  widthPx: map.widthPx,
  heightPx: map.heightPx,
  grid: map.grid,
  terrain: map.terrain,
  spawns: map.spawns,
  playerStarts: map.playerStarts,
  ...(map.startView === undefined ? {} : { startView: map.startView }),
  fogBase: map.fogBase,
  showDoorIcons: map.showDoorIcons,
  notes: map.notes,
});
