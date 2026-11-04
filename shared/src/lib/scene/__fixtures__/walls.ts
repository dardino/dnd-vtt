import {
  defaultTerrain,
  type DoorState,
  type Terrain,
  type WallSegment,
} from '../../../schemas/scene.js';

export const wall = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  extra: Partial<WallSegment> = {},
): WallSegment => ({
  id: `${extra.kind ?? 'wall'}-${ax}-${ay}-${bx}-${by}-${extra.door ?? 'solid'}`,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  kind: 'wall',
  ...extra,
});

export const door = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  state: DoorState = 'closed',
): WallSegment => wall(ax, ay, bx, by, { kind: 'door', door: state });

export const terrainWith = (
  walls: readonly WallSegment[],
  overrides: Partial<Terrain> = {},
): Terrain => ({ ...defaultTerrain, lights: [], walls: [...walls], ...overrides });

/**
 * Muri della scena reale che hanno rivelato il bug delle diagonali:
 * la cella (11,4) è attraversata nel suo interno dal muro (11,5)->(12,4).
 */
export const fixtureWalls: WallSegment[] = [
  wall(7, 5, 11, 5),
  wall(11, 5, 12, 4),
  door(13, 3, 12, 4, 'open'),
  door(15, 3, 16, 4, 'closed'),
];

export const fixtureTerrain = (): Terrain => terrainWith(fixtureWalls);
