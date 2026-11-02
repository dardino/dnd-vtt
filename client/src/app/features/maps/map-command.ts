import type {
  BackgroundTransform,
  GridConfig,
  Light,
  MapDocument,
  MapSpawn,
  PlayerStart,
  Terrain,
  WallSegment,
} from '@dnd-vtt/shared';
import { estimateJsonBytes } from './map-history';

/**
 * Modifica inversibile sul documento mappa. Il documento passato è mutabile:
 * `MapHistory` ne clona uno nuovo prima di applicare o invertire il comando,
 * mentre il comando conserva solo i dati toccati.
 */
export interface MapCommand {
  readonly label: string;
  /** Byte stimati dei dati catturati, usati per il budget della history. */
  readonly bytes: number;
  apply(doc: MapDocument): void;
  invert(doc: MapDocument): void;
}

/** Elementi delle quattro collezioni modificabili con i comandi generici. */
export interface MapCollectionItems {
  wall: WallSegment;
  light: Light;
  spawn: MapSpawn;
  start: PlayerStart;
}

export type MapCollectionKind = keyof MapCollectionItems;

type MapCollectionItem = MapCollectionItems[MapCollectionKind];

const COLLECTION_NOUNS: Record<MapCollectionKind, string> = {
  wall: 'muri',
  light: 'luci',
  spawn: 'spawn',
  start: 'partenze',
};

const isCollectionKind = (target: string): target is MapCollectionKind =>
  target === 'wall' || target === 'light' || target === 'spawn' || target === 'start';

/** Ritorna l'array vivo della collezione: le mutazioni finiscono nel documento. */
const mutableCollectionOf = (
  doc: MapDocument,
  kind: MapCollectionKind,
): MapCollectionItem[] => {
  switch (kind) {
    case 'wall':
      return doc.terrain.walls;
    case 'light':
      return doc.terrain.lights;
    case 'spawn':
      return doc.spawns;
    case 'start':
      return doc.playerStarts;
  }
};

/** Inserisce gli elementi alla posizione richiesta, con clamping ai bordi. */
export const arrayInsert = <K extends MapCollectionKind>(
  kind: K,
  elements: readonly MapCollectionItems[K][],
  index?: number,
): MapCommand => {
  const inserted = elements.map((element) => structuredClone(element));
  return {
    label: `Aggiungi ${COLLECTION_NOUNS[kind]}`,
    bytes: estimateJsonBytes(inserted),
    apply: (doc) => {
      const items = mutableCollectionOf(doc, kind);
      const at = index === undefined ? items.length : Math.max(0, Math.min(index, items.length));
      items.splice(at, 0, ...inserted.map((element) => structuredClone(element)));
    },
    invert: (doc) => {
      const items = mutableCollectionOf(doc, kind);
      for (const element of inserted) {
        const position = items.findIndex((item) => item.id === element.id);
        if (position >= 0) {
          items.splice(position, 1);
        }
      }
    },
  };
};

/**
 * Rimuove l'elemento per id e lo ricorda con l'indice originale: un id
 * inesistente rende il comando un no-op invece di corrompere lo stato.
 */
export const arrayRemove = <K extends MapCollectionKind>(
  kind: K,
  element: MapCollectionItems[K],
  index: number,
): MapCommand => {
  const removed = structuredClone(element);
  const originalIndex = Math.max(0, index);
  return {
    label: `Rimuovi ${COLLECTION_NOUNS[kind]}`,
    bytes: estimateJsonBytes(removed),
    apply: (doc) => {
      const items = mutableCollectionOf(doc, kind);
      const position = items.findIndex((item) => item.id === removed.id);
      if (position >= 0) {
        items.splice(position, 1);
      }
    },
    invert: (doc) => {
      const items = mutableCollectionOf(doc, kind);
      items.splice(Math.min(originalIndex, items.length), 0, structuredClone(removed));
    },
  };
};

type FieldScope = 'map' | 'terrain' | 'grid';

const scopeLabel = (target: MapCollectionKind | FieldScope): string => {
  if (isCollectionKind(target)) {
    return COLLECTION_NOUNS[target];
  }
  switch (target) {
    case 'map':
      return 'mappa';
    case 'terrain':
      return 'terreno';
    case 'grid':
      return 'griglia';
  }
};

/**
 * Applica `add` e rimuove le chiavi presenti solo in `remove`: indispensabile
 * per ripristinare i campi opzionali (es. `door`) senza lasciare residui.
 */
const applyPatch = (target: object, remove: object, add: object): void => {
  const record = target as Record<string, unknown>;
  for (const key of Object.keys(remove)) {
    if (!(key in add)) {
      delete record[key];
    }
  }
  Object.assign(record, add);
};

const assignFields = (
  doc: MapDocument,
  target: MapCollectionKind | FieldScope,
  id: string | null,
  remove: object,
  add: object,
): void => {
  if (isCollectionKind(target)) {
    if (id === null) {
      return;
    }
    const entity = mutableCollectionOf(doc, target).find((item) => item.id === id);
    if (entity !== undefined) {
      applyPatch(entity, remove, add);
    }
    return;
  }
  switch (target) {
    case 'map':
      applyPatch(doc, remove, add);
      return;
    case 'terrain':
      applyPatch(doc.terrain, remove, add);
      return;
    case 'grid':
      applyPatch(doc.grid, remove, add);
      return;
  }
};

/** Aggiornamento puntuale di un elemento di collezione, identificato per id. */
export function replaceFields<K extends MapCollectionKind>(
  kind: K,
  id: string,
  before: Partial<MapCollectionItems[K]>,
  after: Partial<MapCollectionItems[K]>,
): MapCommand;
/** Aggiornamento dei campi di primo livello del documento. */
export function replaceFields(
  scope: 'map',
  before: Partial<MapDocument>,
  after: Partial<MapDocument>,
): MapCommand;
/** Aggiornamento dei campi del terreno. */
export function replaceFields(
  scope: 'terrain',
  before: Partial<Terrain>,
  after: Partial<Terrain>,
): MapCommand;
/** Aggiornamento dei campi della griglia. */
export function replaceFields(
  scope: 'grid',
  before: Partial<GridConfig>,
  after: Partial<GridConfig>,
): MapCommand;
export function replaceFields(
  target: MapCollectionKind | FieldScope,
  idOrBefore: string | object,
  beforeOrAfter: object,
  afterMaybe?: object,
): MapCommand {
  const entityTarget = isCollectionKind(target);
  const id = entityTarget ? (idOrBefore as string) : null;
  const before = structuredClone(entityTarget ? beforeOrAfter : (idOrBefore as object));
  const after = structuredClone(entityTarget ? (afterMaybe ?? {}) : beforeOrAfter);
  return {
    label: `Modifica ${scopeLabel(target)}`,
    bytes: estimateJsonBytes({ before, after }),
    apply: (doc) => assignFields(doc, target, id, before, after),
    invert: (doc) => assignFields(doc, target, id, after, before),
  };
}

/** Stato dello sfondo catturato dai comandi: asset e trasformazione, mai le dimensioni. */
export interface MapBackgroundState {
  readonly imageAssetId: string | null;
  readonly backgroundTransform: BackgroundTransform;
}

const cloneBackground = (state: MapBackgroundState): MapBackgroundState => ({
  imageAssetId: state.imageAssetId,
  backgroundTransform: { ...state.backgroundTransform },
});

const assignBackground = (doc: MapDocument, state: MapBackgroundState): void => {
  doc.imageAssetId = state.imageAssetId;
  doc.backgroundTransform = { ...state.backgroundTransform };
};

/**
 * Cambia sfondo senza toccare `widthPx`/`heightPx`: la risoluzione è
 * immutabile e l'aggiornamento dimensioni non fa più parte della history.
 */
export const replaceBackground = (
  before: MapBackgroundState,
  after: MapBackgroundState,
): MapCommand => {
  const from = cloneBackground(before);
  const to = cloneBackground(after);
  return {
    label: 'Cambia sfondo',
    bytes: estimateJsonBytes({ before: from, after: to }),
    apply: (doc) => assignBackground(doc, to),
    invert: (doc) => assignBackground(doc, from),
  };
};
