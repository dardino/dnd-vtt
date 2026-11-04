import { graphicsLayer, type MapDocument, type MapGraphic } from '@dnd-vtt/shared';
import type { MapCommand } from './map-command';
import { sortedGraphics } from './map-graphics-renderer';
import { estimateJsonBytes } from './map-history';

/** Direzione di spostamento di una grafica nello stack `z`. */
export type GraphicZDirection = 'up' | 'down' | 'top' | 'bottom';

const GRAPHIC_Z_LABELS: Record<GraphicZDirection, string> = {
  up: 'Porta su la grafica',
  down: 'Porta giù la grafica',
  top: 'Porta in cima la grafica',
  bottom: 'Porta in fondo la grafica',
};

/** Indice di destinazione nella lista ordinata per `z`; fuori dai bordi resta fermo. */
export const nextGraphicZIndex = (
  index: number,
  length: number,
  direction: GraphicZDirection,
): number => {
  switch (direction) {
    case 'up':
      return Math.min(length - 1, index + 1);
    case 'down':
      return Math.max(0, index - 1);
    case 'top':
      return length - 1;
    case 'bottom':
      return 0;
  }
};

/**
 * Sposta una grafica nello stack e normalizza `z` a 0..n-1.
 *
 * L'ordine visivo vive solo in `z`: l'array del layer resta invariato, così
 * l'inversione ripristina i valori originali (anche non contigui) senza
 * ricostruire la lista.
 */
export const moveGraphicZ = (
  id: string,
  direction: GraphicZDirection,
): MapCommand => {
  let before: Array<{ id: string; z: number }> | null = null;
  return {
    label: GRAPHIC_Z_LABELS[direction],
    bytes: estimateJsonBytes({ id, direction }),
    apply: (doc: MapDocument) => {
      const items = graphicsLayer(doc).items;
      const ordered = sortedGraphics(items);
      const index = ordered.findIndex((item) => item.id === id);
      if (index < 0) {
        return;
      }
      const target = nextGraphicZIndex(index, ordered.length, direction);
      if (target === index) {
        return;
      }
      before = items.map((item) => ({ id: item.id, z: item.z }));
      const [moved] = ordered.splice(index, 1);
      if (moved !== undefined) {
        ordered.splice(target, 0, moved);
      }
      ordered.forEach((item, position) => {
        item.z = position;
      });
    },
    invert: (doc: MapDocument) => {
      if (before === null) {
        return;
      }
      const zById = new Map(before.map((entry) => [entry.id, entry.z]));
      for (const item of graphicsLayer(doc).items) {
        const z = zById.get(item.id);
        if (z !== undefined) {
          item.z = z;
        }
      }
    },
  };
};

/**
 * Rimuove una grafica e richiude `z` a 0..n-1. L'undo ripristina i valori
 * originali, compresi eventuali buchi, e reinserisce l'elemento al suo indice.
 */
export const removeGraphic = (element: MapGraphic, index: number): MapCommand => {
  const removed = structuredClone(element);
  const fallbackIndex = Math.max(0, index);
  let before: Array<{ id: string; z: number }> | null = null;
  return {
    label: 'Rimuovi grafica',
    bytes: estimateJsonBytes(removed),
    apply: (doc: MapDocument) => {
      const items = graphicsLayer(doc).items;
      const position = items.findIndex((item) => item.id === removed.id);
      if (position < 0) {
        return;
      }
      before = items.map((item) => ({ id: item.id, z: item.z }));
      items.splice(position, 1);
      sortedGraphics(items).forEach((item, z) => {
        item.z = z;
      });
    },
    invert: (doc: MapDocument) => {
      // `apply` non ha trovato l'id: niente da reinserire, evita grafiche fantasma.
      if (before === null) {
        return;
      }
      const items = graphicsLayer(doc).items;
      const zById = new Map(before.map((entry) => [entry.id, entry.z]));
      for (const item of items) {
        const z = zById.get(item.id);
        if (z !== undefined) {
          item.z = z;
        }
      }
      // Inversione idempotente: un id già presente non viene reinserito due volte.
      if (items.some((item) => item.id === removed.id)) {
        return;
      }
      items.splice(Math.min(fallbackIndex, items.length), 0, structuredClone(removed));
    },
  };
};
