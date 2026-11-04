import { describe, expect, it } from 'vitest';
import {
  isCellPlaceable,
  isFootprintPlaceable,
  lastReachableCell,
  segmentBlocksMovement,
} from './movement.js';
import { door, fixtureTerrain, fixtureWalls, terrainWith, wall } from './__fixtures__/walls.js';

describe('segmentBlocksMovement', () => {
  it('blocca muri, finestre e muri bassi', () => {
    expect(segmentBlocksMovement(wall(1, 1, 2, 1))).toBe(true);
    expect(segmentBlocksMovement(wall(1, 1, 2, 1, { kind: 'window' }))).toBe(true);
    expect(segmentBlocksMovement(wall(1, 1, 2, 1, { kind: 'lowWall' }))).toBe(true);
  });

  it('blocca le porte chiuse, segrete o senza stato', () => {
    expect(segmentBlocksMovement(door(1, 1, 2, 1, 'closed'))).toBe(true);
    expect(segmentBlocksMovement(door(1, 1, 2, 1, 'secret'))).toBe(true);
    expect(segmentBlocksMovement(wall(1, 1, 2, 1, { kind: 'door' }))).toBe(true);
  });

  it('lascia passare solo la porta aperta', () => {
    expect(segmentBlocksMovement(door(1, 1, 2, 1, 'open'))).toBe(false);
  });
});

describe('isCellPlaceable', () => {
  it('invalida la cella attraversata dal muro diagonale della scena reale', () => {
    expect(isCellPlaceable({ x: 11, y: 4 }, fixtureTerrain())).toBe(false);
  });

  it('lascia piazzabili le celle toccate dal muro solo su bordo o spigolo', () => {
    const terrain = fixtureTerrain();
    const cells = [{ x: 12, y: 4 }, { x: 11, y: 5 }, { x: 11, y: 3 }, { x: 10, y: 4 }];
    for (const cell of cells) {
      expect(isCellPlaceable(cell, terrain), `cella ${cell.x},${cell.y}`).toBe(true);
    }
  });

  it('invalida l’interno di una porta chiusa ma non quello di una porta aperta', () => {
    expect(isCellPlaceable({ x: 12, y: 3 }, terrainWith([door(13, 3, 12, 4, 'closed')]))).toBe(false);
    expect(isCellPlaceable({ x: 12, y: 3 }, terrainWith([door(13, 3, 12, 4, 'open')]))).toBe(true);
  });

  it('non invalida le celle separate da una porta chiusa sul bordo', () => {
    const terrain = terrainWith([door(3, 1, 3, 2, 'closed')]);
    expect(isCellPlaceable({ x: 2, y: 1 }, terrain)).toBe(true);
    expect(isCellPlaceable({ x: 3, y: 1 }, terrain)).toBe(true);
  });

  it('invalida una cella attraversata da un muro con coordinate frazionarie', () => {
    const terrain = terrainWith([wall(10.5, 4.2, 10.5, 4.8)]);
    expect(isCellPlaceable({ x: 10, y: 4 }, terrain)).toBe(false);
    expect(isCellPlaceable({ x: 9, y: 4 }, terrain)).toBe(true);
    expect(isCellPlaceable({ x: 11, y: 4 }, terrain)).toBe(true);
  });

  it('considera piazzabile ogni cella senza terreno o senza muri', () => {
    expect(isCellPlaceable({ x: 11, y: 4 }, undefined)).toBe(true);
    expect(isCellPlaceable({ x: 11, y: 4 }, terrainWith([]))).toBe(true);
  });

  it('non invalida una cella toccata solo su spigolo da più muri', () => {
    const terrain = terrainWith([
      wall(11, 3, 11, 4),
      wall(10, 4, 11, 4),
      wall(10, 4, 11, 3),
    ]);
    expect(isCellPlaceable({ x: 11, y: 4 }, terrain)).toBe(true);
    expect(isCellPlaceable({ x: 10, y: 4 }, terrain)).toBe(true);
  });

  it('valida l’intero footprint quando size è maggiore di 1', () => {
    const terrain = fixtureTerrain();
    expect(isCellPlaceable({ x: 10, y: 3 }, terrain, 2)).toBe(false);
    expect(isCellPlaceable({ x: 9, y: 3 }, terrain, 2)).toBe(true);
    expect(isCellPlaceable({ x: 10, y: 3 }, terrain)).toBe(true);
  });
});

describe('isFootprintPlaceable', () => {
  it('richiede che tutte le celle del footprint siano piazzabili', () => {
    const terrain = fixtureTerrain();
    expect(isFootprintPlaceable({ x: 10, y: 3 }, 2, terrain)).toBe(false);
    expect(isFootprintPlaceable({ x: 10, y: 2 }, 2, terrain)).toBe(true);
    expect(isFootprintPlaceable({ x: 9, y: 3 }, 2, terrain)).toBe(true);
  });

  it('con size 1 equivale a isCellPlaceable', () => {
    const terrain = fixtureTerrain();
    expect(isFootprintPlaceable({ x: 11, y: 4 }, 1, terrain)).toBe(false);
    expect(isFootprintPlaceable({ x: 12, y: 4 }, 1, terrain)).toBe(true);
  });
});

describe('lastReachableCell', () => {
  it('consente la fuga dal primo passo quando la cella di partenza è invalida', () => {
    expect(lastReachableCell({ x: 11, y: 4 }, { x: 12, y: 4 }, fixtureTerrain()))
      .toEqual({ x: 12, y: 4 });
  });

  it('dopo la fuga torna alle regole normali', () => {
    const terrain = terrainWith([...fixtureWalls, wall(10, 4, 10, 5)]);
    expect(lastReachableCell({ x: 11, y: 4 }, { x: 9, y: 4 }, terrain))
      .toEqual({ x: 10, y: 4 });
  });

  it('non entra in una cella non piazzabile', () => {
    expect(lastReachableCell({ x: 10, y: 3 }, { x: 11, y: 4 }, fixtureTerrain()))
      .toEqual({ x: 10, y: 3 });
  });

  it('attraversa una porta diagonale aperta', () => {
    const terrain = terrainWith([door(13, 3, 12, 4, 'open')]);
    expect(lastReachableCell({ x: 12, y: 4 }, { x: 12, y: 3 }, terrain))
      .toEqual({ x: 12, y: 3 });
  });

  it('si ferma alla porta diagonale chiusa o segreta', () => {
    const closed = terrainWith([door(13, 3, 12, 4, 'closed')]);
    const secret = terrainWith([door(13, 3, 12, 4, 'secret')]);
    expect(lastReachableCell({ x: 12, y: 4 }, { x: 12, y: 3 }, closed))
      .toEqual({ x: 12, y: 4 });
    expect(lastReachableCell({ x: 12, y: 4 }, { x: 12, y: 3 }, secret))
      .toEqual({ x: 12, y: 4 });
  });

  it('resta bloccato dal muro verticale esistente', () => {
    const terrain = terrainWith([wall(1, 1, 4, 1), wall(3, 0, 3, 10)]);
    expect(lastReachableCell({ x: 1, y: 1 }, { x: 4, y: 1 }, terrain))
      .toEqual({ x: 2, y: 1 });
  });

  it('non taglia l’angolo fra due muri perpendicolari', () => {
    const terrain = terrainWith([wall(11, 3, 11, 4), wall(10, 4, 11, 4)]);
    expect(isCellPlaceable({ x: 11, y: 4 }, terrain)).toBe(true);
    expect(lastReachableCell({ x: 10, y: 3 }, { x: 11, y: 4 }, terrain))
      .toEqual({ x: 10, y: 3 });
  });

  it('con size 2 si ferma prima di un footprint invalido', () => {
    expect(lastReachableCell({ x: 9, y: 3 }, { x: 10, y: 3 }, fixtureTerrain(), 2))
      .toEqual({ x: 9, y: 3 });
  });

  it('con size 2 attraversa un footprint valido', () => {
    expect(lastReachableCell({ x: 9, y: 3 }, { x: 9, y: 4 }, fixtureTerrain(), 2))
      .toEqual({ x: 9, y: 4 });
  });

  it('consente la fuga anche con size 2', () => {
    expect(lastReachableCell({ x: 10, y: 3 }, { x: 10, y: 2 }, fixtureTerrain(), 2))
      .toEqual({ x: 10, y: 2 });
  });

  it('senza size usa il footprint di una cella', () => {
    expect(lastReachableCell({ x: 9, y: 3 }, { x: 10, y: 3 }, fixtureTerrain()))
      .toEqual({ x: 10, y: 3 });
  });

  it('senza terreno o senza muri il movimento è libero', () => {
    expect(lastReachableCell({ x: 0, y: 0 }, { x: 3, y: 2 }, undefined))
      .toEqual({ x: 3, y: 2 });
    expect(lastReachableCell({ x: 0, y: 0 }, { x: 3, y: 2 }, terrainWith([])))
      .toEqual({ x: 3, y: 2 });
  });
});
