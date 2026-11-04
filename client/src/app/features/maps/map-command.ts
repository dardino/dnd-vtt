import {
  backgroundLayer,
  constraintsLayer,
  elementsLayer,
  graphicsLayer,
  type BackgroundTransform,
  type BlockedArea,
  type GridConfig,
  type Light,
  type MapConstraint,
  type MapDocument,
  type MapElement,
  type MapGraphic,
  type MapLayerKind,
  type MapLayers,
  type MapSpawn,
  type PlayerStart,
  type WallSegment,
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

/** Elementi delle collezioni modificabili con i comandi generici. */
export interface MapCollectionItems {
  wall: WallSegment;
  light: Light;
  spawn: MapSpawn;
  start: PlayerStart;
  graphic: MapGraphic;
  area: BlockedArea;
  loot: MapElement & { type: 'loot' };
}

export type MapCollectionTarget = keyof MapCollectionItems;

/** Collezioni modificabili con i comandi generici, aree incluse. */
export type MapCollectionKind = keyof MapCollectionItems;

type MapCollectionItem = MapCollectionItems[MapCollectionTarget];

/** Elemento del layer reale: i vincoli misti convivono con elementi e grafiche. */
type LayerItem = MapConstraint | MapElement | MapGraphic;

const COLLECTION_NOUNS: Record<MapCollectionTarget, string> = {
  wall: 'muri',
  light: 'luci',
  spawn: 'spawn',
  start: 'partenze',
  graphic: 'grafiche',
  area: 'aree',
  loot: 'oggetti',
};

const isCollectionKind = (target: string): target is MapCollectionTarget =>
  target === 'wall'
  || target === 'light'
  || target === 'spawn'
  || target === 'start'
  || target === 'graphic'
  || target === 'area'
  || target === 'loot';

/** Discriminante delle grafiche: immagini, poligoni e testi condividono il layer. */
const GRAPHIC_KINDS: ReadonlySet<string> = new Set(['image', 'polygon', 'text']);

const matchesKind = (kind: MapCollectionTarget, item: LayerItem): boolean => {
  if (kind === 'wall') {
    return 'a' in item && 'b' in item && 'kind' in item;
  }
  if (kind === 'area') {
    return 'shape' in item;
  }
  if (kind === 'graphic') {
    // Non basta `assetId`: poligoni e testi non hanno asset ma sono grafiche.
    return 'kind' in item && GRAPHIC_KINDS.has(item.kind);
  }
  return 'type' in item && item.type === kind;
};

/** Muri e aree convivono nello stesso array: il layer mescola i due vincoli. */
const isConstraintsKind = (kind: MapCollectionTarget): boolean =>
  kind === 'wall' || kind === 'area';

/** Ritorna l'array vivo del layer: le mutazioni finiscono nel documento. */
const mutableCollectionOf = (doc: MapDocument, kind: MapCollectionTarget): LayerItem[] => {
  if (isConstraintsKind(kind)) {
    return constraintsLayer(doc).items;
  }
  return kind === 'graphic' ? graphicsLayer(doc).items : elementsLayer(doc).items;
};

/** Normalizza un elemento di collezione nella forma richiesta dal layer v2. */
const toLayerItem = (kind: MapCollectionTarget, element: MapCollectionItem): LayerItem => {
  if (isConstraintsKind(kind)) {
    return structuredClone(element) as WallSegment | BlockedArea;
  }
  if (kind === 'graphic') {
    return structuredClone(element) as MapGraphic;
  }
  return { ...structuredClone(element), type: kind } as unknown as MapElement;
};

/** Converte l'indice di collezione nell'indice reale dell'array misto del layer. */
const rawIndex = (
  items: readonly LayerItem[],
  kind: MapCollectionTarget,
  index?: number,
): number => {
  if (index === undefined) {
    return items.length;
  }
  const matching = items.filter((item) => matchesKind(kind, item));
  const target = matching[Math.max(0, index)];
  return target === undefined ? items.length : items.indexOf(target);
};

/** Inserisce gli elementi alla posizione richiesta, con clamping ai bordi. */
export const arrayInsert = <K extends MapCollectionTarget>(
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
      const at = rawIndex(items, kind, index);
      items.splice(at, 0, ...inserted.map((element) => toLayerItem(kind, element)));
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
export const arrayRemove = <K extends MapCollectionTarget>(
  kind: K,
  element: MapCollectionItems[K],
  _index: number,
): MapCommand => {
  const removed = toLayerItem(kind, element);
  let removedAt: number | null = null;
  return {
    label: `Rimuovi ${COLLECTION_NOUNS[kind]}`,
    bytes: estimateJsonBytes(removed),
    apply: (doc) => {
      const items = mutableCollectionOf(doc, kind);
      const position = items.findIndex((item) => item.id === removed.id);
      if (position >= 0) {
        removedAt = position;
        items.splice(position, 1);
      }
    },
    invert: (doc) => {
      // Nessun elemento rimosso in `apply`: l'inversione non deve inserirne uno.
      if (removedAt === null) {
        return;
      }
      const items = mutableCollectionOf(doc, kind);
      // Inversione idempotente: un id già presente non viene reinserito due volte.
      if (items.some((item) => item.id === removed.id)) {
        return;
      }
      items.splice(
        Math.min(removedAt, items.length),
        0,
        structuredClone(removed),
      );
    },
  };
};

type FieldScope = 'map' | 'grid';

const scopeLabel = (target: MapCollectionTarget | FieldScope): string => {
  if (isCollectionKind(target)) {
    return COLLECTION_NOUNS[target];
  }
  switch (target) {
    case 'map':
      return 'mappa';
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
  target: MapCollectionTarget | FieldScope,
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
    case 'grid':
      applyPatch(doc.grid, remove, add);
      return;
  }
};

/** Aggiornamento puntuale di un elemento di collezione, identificato per id. */
export function replaceFields<K extends MapCollectionTarget>(
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
/** Aggiornamento dei campi della griglia. */
export function replaceFields(
  scope: 'grid',
  before: Partial<GridConfig>,
  after: Partial<GridConfig>,
): MapCommand;
export function replaceFields(
  target: MapCollectionTarget | FieldScope,
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

/** Layer canonico del documento: unione dei quattro tipi della tupla. */
export type MapLayer = MapLayers[number];

const findLayer = (doc: MapDocument, kind: MapLayerKind): MapLayer | undefined =>
  doc.layers.find((layer) => layer.kind === kind);

/**
 * Aggiorna i campi di un layer senza toccare i suoi `items`.
 *
 * Il patch `before` descrive i soli campi modificati: i valori originali delle
 * chiavi presenti in `after` ma non in `before` vengono catturati al primo
 * `apply`, così l'inversione ripristina anche i campi non dichiarati dal
 * chiamante (es. `opacity` quando si cambia solo `visible`).
 */
export const replaceLayer = (
  kind: MapLayerKind,
  before: Partial<MapLayer>,
  after: Partial<MapLayer>,
): MapCommand => {
  const from = structuredClone(before);
  const to = structuredClone(after);
  const captured: Record<string, unknown> = {};

  const captureMissing = (layer: MapLayer): void => {
    const record = layer as Record<string, unknown>;
    for (const key of Object.keys(to)) {
      if (!(key in from) && !(key in captured)) {
        captured[key] = structuredClone(record[key]);
      }
    }
  };

  const assign = (
    doc: MapDocument,
    remove: Partial<MapLayer>,
    add: Partial<MapLayer>,
  ): void => {
    const layer = findLayer(doc, kind);
    if (layer !== undefined) {
      applyPatch(layer, remove, add);
    }
  };

  return {
    label: `Modifica layer ${kind}`,
    bytes: estimateJsonBytes({ before: from, after: to }),
    apply: (doc) => {
      const layer = findLayer(doc, kind);
      if (layer === undefined) {
        return;
      }
      captureMissing(layer);
      applyPatch(layer, from, to);
    },
    invert: (doc) => {
      const restored: Record<string, unknown> = { ...from };
      for (const [key, value] of Object.entries(captured)) {
        if (!(key in restored)) {
          restored[key] = structuredClone(value);
        }
      }
      assign(doc, to, restored);
    },
  };
};

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
  const background = backgroundLayer(doc);
  background.imageAssetId = state.imageAssetId;
  background.imageTransform = { ...state.backgroundTransform };
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

export {
  moveGraphicZ,
  nextGraphicZIndex,
  removeGraphic,
} from './map-command-graphics';
export type { GraphicZDirection } from './map-command-graphics';
