import {
  newId,
  spawnsOf,
  srdMonsterToStatblock,
  startsOf,
  type Actor,
  type Map,
  type PlayerAssignment,
  type TokenState,
} from '@dnd-vtt/shared';
import type { AppDatabase } from '../db/client.js';
import { getActor, insertActor } from '../db/actors.repository.js';
import { currentSrdVersion, loadSrdCatalog } from '../srd/load.js';
import {
  cellKey,
  placeTokenCell,
  placementBounds,
  placementTerrain,
} from './scene-placement.js';

const srdMonster = (monsterId: string) => {
  const catalog = loadSrdCatalog(currentSrdVersion());
  return catalog.monsters.find((monster) => monster.id === monsterId);
};

/**
 * Materializza i token iniziali della scena a partire dagli spawn della mappa e
 * dai personaggi assegnati ai player start. Ogni cella occupata viene riservata
 * per evitare sovrapposizioni fra spawn e assignment.
 */
export const createTokens = (
  db: AppDatabase,
  map: Map,
  assignments: PlayerAssignment[],
): TokenState[] => {
  const tokens: TokenState[] = [];
  const terrain = placementTerrain(map);
  const bounds = placementBounds(map);
  const occupied = new Set<string>();
  for (const spawn of spawnsOf(map)) {
    const count = Math.max(1, spawn.quantity);
    for (let index = 0; index < count; index += 1) {
      const offset = index % 3;
      const row = Math.floor(index / 3);
      const cell = placeTokenCell(
        { x: spawn.x + offset, y: spawn.y + row },
        spawn.size,
        terrain,
        bounds,
        occupied,
      );
      if (cell === null) {
        continue;
      }
      let actor: Actor;
      if (spawn.source.type === 'srd') {
        const monster = srdMonster(spawn.source.monsterId);
        if (monster === undefined) {
          continue;
        }
        actor = insertActor(db, {
          campaignId: map.campaignId,
          kind: spawn.kind,
          name: spawn.label ?? monster.name,
          statblock: srdMonsterToStatblock(monster),
          xp: 0,
        });
      } else {
        const candidate = getActor(db, spawn.source.actorId);
        if (candidate === null || candidate.campaignId !== map.campaignId) {
          continue;
        }
        actor = candidate;
      }
      occupied.add(cellKey(cell));
      tokens.push({
        id: newId(),
        actorId: actor.id,
        label: spawn.label ?? actor.name,
        x: cell.x,
        y: cell.y,
        size: spawn.size,
        rotation: 0,
        elevation: 0,
        hp: { ...actor.statblock.hp },
        conditions: [],
        visible: !spawn.hidden,
        ...(spawn.light === undefined ? {} : { light: spawn.light }),
      });
    }
  }
  const assignedStarts = new Set<string>();
  const starts = startsOf(map);
  for (const assignment of assignments) {
    const start = starts.find((entry) => entry.id === assignment.startId);
    if (start === undefined || assignedStarts.has(start.id)) {
      continue;
    }
    const actor = getActor(db, assignment.actorId);
    if (actor === null || actor.campaignId !== map.campaignId || actor.kind !== 'pc') {
      continue;
    }
    const cell = placeTokenCell({ x: start.x, y: start.y }, 1, terrain, bounds, occupied);
    if (cell === null) {
      continue;
    }
    assignedStarts.add(start.id);
    occupied.add(cellKey(cell));
    tokens.push({
      id: newId(),
      actorId: actor.id,
      label: actor.name,
      x: cell.x,
      y: cell.y,
      size: 1,
      rotation: 0,
      elevation: 0,
      hp: { ...actor.statblock.hp },
      conditions: [],
      visible: true,
      owner: 'players',
    });
  }
  return tokens;
};
