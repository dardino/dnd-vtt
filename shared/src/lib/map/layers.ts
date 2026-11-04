import type { MapDocumentV2 } from '../../schemas/map-document.js';
import type {
  BackgroundLayer,
  ConstraintsLayer,
  ElementsLayer,
  GraphicsLayer,
  MapConstraint,
  MapElement,
  MapLayers,
} from '../../schemas/map-layers.js';
import type { MapSpawn, PlayerStart } from '../../schemas/map-spawn.js';
import type { Light, WallSegment } from '../../schemas/scene.js';
import type { BackgroundTransform } from '../../schemas/scene-size.js';

/** Qualsiasi documento che espone i quattro layer canonici (documento o DTO). */
export interface MapLayersOwner {
  layers: MapLayers;
}

/** Layer background: unico proprietario di asset e trasformazione immagine. */
export const backgroundLayer = (doc: MapLayersOwner): BackgroundLayer => doc.layers[0];

/** Layer delle grafiche decorative libere. */
export const graphicsLayer = (doc: MapLayersOwner): GraphicsLayer => doc.layers[1];

/** Layer dei vincoli: muri e aree bloccate convivono nello stesso array. */
export const constraintsLayer = (doc: MapLayersOwner): ConstraintsLayer => doc.layers[2];

/** Layer degli elementi logici: luci, spawn, partenze e loot. */
export const elementsLayer = (doc: MapLayersOwner): ElementsLayer => doc.layers[3];

const isWall = (constraint: MapConstraint): constraint is WallSegment => 'kind' in constraint;

/** Muri del layer `constraints`, esclusi filtri e aree bloccate. */
export const wallsOf = (doc: MapLayersOwner): WallSegment[] =>
  constraintsLayer(doc).items.filter(isWall);

/** Luci del layer `elements`, senza gli altri tipi di elemento. */
export const lightsOf = (doc: MapLayersOwner): Array<Light & { type: 'light' }> =>
  elementsLayer(doc).items.filter(
    (item): item is MapElement & { type: 'light' } => item.type === 'light',
  );

/** Spawn del layer `elements`. */
export const spawnsOf = (doc: MapLayersOwner): Array<MapSpawn & { type: 'spawn' }> =>
  elementsLayer(doc).items.filter(
    (item): item is MapElement & { type: 'spawn' } => item.type === 'spawn',
  );

/** Partenze PG del layer `elements`. */
export const startsOf = (doc: MapLayersOwner): Array<PlayerStart & { type: 'start' }> =>
  elementsLayer(doc).items.filter(
    (item): item is MapElement & { type: 'start' } => item.type === 'start',
  );

/** Loot del layer `elements`. */
export const lootOf = (doc: MapLayersOwner): Array<MapElement & { type: 'loot' }> =>
  elementsLayer(doc).items.filter(
    (item): item is MapElement & { type: 'loot' } => item.type === 'loot',
  );

/**
 * Sostituisce asset e trasformazione del solo layer background, lasciando
 * intatti gli altri layer. È immutabile: serve a server e comandi history.
 */
export const withBackgroundLayer = (
  doc: MapDocumentV2,
  imageAssetId: string | null,
  imageTransform: BackgroundTransform,
): MapDocumentV2 => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [
      { ...background, imageAssetId, imageTransform: { ...imageTransform } },
      graphics,
      constraints,
      elements,
    ],
  };
};
