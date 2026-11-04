import {
  defaultTerrain,
  isFootprintPlaceable,
  wallsOf,
  type Map,
  type Terrain,
} from '@dnd-vtt/shared';

export interface PlacementCell {
  x: number;
  y: number;
}

export interface PlacementBounds {
  cols: number;
  rows: number;
}

export const cellKey = (cell: PlacementCell): string => `${cell.x},${cell.y}`;

export const placementBounds = (map: Map): PlacementBounds => ({
  cols: Math.ceil((map.widthPx - map.grid.offsetX) / map.grid.cellSizePx),
  rows: Math.ceil((map.heightPx - map.grid.offsetY) / map.grid.cellSizePx),
});

/** Terreno di piazzamento: i muri della mappa, senza luci di scena. */
export const placementTerrain = (map: Map): Terrain => ({
  ...defaultTerrain,
  ambientLight: map.ambientLight,
  visionLimitFeet: map.visionLimitFeet,
  visionEnabled: map.visionEnabled,
  walls: wallsOf(map),
});

/** Anello Chebyshev di raggio `radius` attorno a `origin`, ordinato per y poi x. */
const ringCells = (origin: PlacementCell, radius: number): PlacementCell[] => {
  const cells: PlacementCell[] = [];
  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== radius) {
        continue;
      }
      cells.push({ x, y });
    }
  }
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
};

/**
 * Cella definitiva di un token: l'offset richiesto se piazzabile, altrimenti
 * la prima cella libera scandendo gli anelli Chebyshev crescenti. `null` se
 * dentro la griglia non esiste alcuna cella valida.
 */
export const placeTokenCell = (
  desired: PlacementCell,
  size: number,
  terrain: Terrain,
  bounds: PlacementBounds,
  occupied: ReadonlySet<string>,
): PlacementCell | null => {
  const span = Math.max(1, Math.ceil(size));
  const available = (cell: PlacementCell): boolean =>
    cell.x >= 0
    && cell.y >= 0
    && cell.x + span <= bounds.cols
    && cell.y + span <= bounds.rows
    && !occupied.has(cellKey(cell))
    && isFootprintPlaceable(cell, size, terrain);
  if (available(desired)) {
    return desired;
  }
  const maxRadius = Math.max(bounds.cols, bounds.rows)
    + Math.max(Math.abs(desired.x), Math.abs(desired.y))
    + span;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (const cell of ringCells(desired, radius)) {
      if (available(cell)) {
        return cell;
      }
    }
  }
  return null;
};
