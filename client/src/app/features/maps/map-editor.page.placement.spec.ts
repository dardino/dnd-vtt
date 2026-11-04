import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  emptyMapDocument,
  type Actor,
  type MapDocument,
  type MapElement,
  type MapLayers,
  type SrdMonster,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

type ElementItems = MapLayers[3]['items'];

const wall = (
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  extra: Partial<WallSegment> = {},
): WallSegment => ({
  id,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  ...extra,
});

/**
 * Muri della scena reale: il muro diagonale (11,5)->(12,4) attraversa
 * l'interno della cella (11,4); la porta chiusa (15,3)->(16,4) invalida (15,3).
 */
const fixtureWalls = (): WallSegment[] => [
  wall('wall-h', 7, 5, 11, 5),
  wall('wall-diag', 11, 5, 12, 4),
  wall('door-open', 13, 3, 12, 4, { kind: 'door', door: 'open' }),
  wall('door-closed', 15, 3, 16, 4, { kind: 'door', door: 'closed' }),
];

const spawn = (id: string, x: number, y: number, size = 1): ElementItems[number] => ({
  id,
  type: 'spawn',
  kind: 'monster',
  x,
  y,
  size,
  quantity: 1,
  hidden: false,
  source: { type: 'srd', monsterId: 'goblin' },
});

const start = (id: string, x: number, y: number): MapElement => ({
  id,
  type: 'start',
  x,
  y,
  label: 'PG 1',
});

const withItems = (
  doc: MapDocument,
  walls: readonly WallSegment[],
  elements: ElementItems,
): MapDocument => {
  const [background, graphics, constraints, elementsLayer] = doc.layers;
  return {
    ...doc,
    layers: [
      background,
      graphics,
      { ...constraints, items: [...walls] },
      { ...elementsLayer, items: elements },
    ],
  };
};

const withLockedElements = (doc: MapDocument): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [
      background,
      graphics,
      constraints,
      { ...elements, locked: true },
    ],
  };
};

/** Documento abbastanza grande da contenere le celle della fixture (11,4) e (15,3). */
const documentWith = (
  elements: ElementItems = [],
  walls: readonly WallSegment[] = fixtureWalls(),
): MapDocument => withItems(
  emptyMapDocument('Placement', null, 1280, 720),
  walls,
  elements,
);

const monster = (size: SrdMonster['size'] = 'medium'): SrdMonster => ({
  id: 'goblin',
  name: 'Goblin',
  size,
} as SrdMonster);

const actor = (size: Actor['statblock']['size'] = 'medium'): Actor => ({
  id: 'actor-1',
  name: 'Goblin',
  kind: 'monster',
  statblock: { size },
} as unknown as Actor);

const spawnsIn = (doc: MapDocument | null): ElementItems => {
  if (doc === null) {
    return [];
  }
  return doc.layers[3].items.filter((item) => item.type === 'spawn');
};

const startsIn = (doc: MapDocument | null): ElementItems => {
  if (doc === null) {
    return [];
  }
  return doc.layers[3].items.filter((item) => item.type === 'start');
};

describe('MapEditorPage placement', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: vi.fn(), save: vi.fn() } },
        { provide: AssetService, useValue: { upload: vi.fn(), get: vi.fn() } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn() } },
        {
          provide: SrdCatalogService,
          useValue: { load: () => Promise.resolve(), catalog: () => null },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  const pageWith = (doc: MapDocument): MapEditorPage => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(doc);
    return page;
  };

  describe('placeStart', () => {
    it('non piazza una partenza nella cella attraversata dal muro diagonale', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.tool.set('areaRect');

      page.placeStart({ x: 11, y: 4 });

      expect(page.doc()).toBe(doc);
      expect(startsIn(page.doc())).toHaveLength(0);
      expect(page.selected()).toBeNull();
      expect(page.tool()).toBe('areaRect');
      expect(page.dirty()).toBe(false);
    });

    it('piazza una partenza in una cella valida e la rende annullabile', () => {
      const doc = documentWith();
      const page = pageWith(doc);

      page.placeStart({ x: 10, y: 3 });

      const starts = startsIn(page.doc());
      expect(starts).toHaveLength(1);
      expect(starts[0]).toMatchObject({ x: 10, y: 3 });
      expect(page.selected()).toMatchObject({ type: 'start' });
      expect(page.tool()).toBe('select');
      expect(page.dirty()).toBe(true);

      page.undo();
      expect(startsIn(page.doc())).toHaveLength(0);
    });

    it('lascia invariato il comportamento fuori dalla griglia', () => {
      const doc = documentWith();
      const page = pageWith(doc);

      page.placeStart({ x: -1, y: 0 });

      expect(page.doc()).toBe(doc);
      expect(startsIn(page.doc())).toHaveLength(0);
      expect(page.dirty()).toBe(false);
    });

    it('dà precedenza al layer elements bloccato anche su una cella valida', () => {
      const doc = withLockedElements(documentWith());
      const page = pageWith(doc);

      page.placeStart({ x: 10, y: 3 });

      expect(page.doc()).toBe(doc);
      expect(startsIn(page.doc())).toHaveLength(0);
      expect(page.dirty()).toBe(false);
    });
  });

  describe('requestSpawn', () => {
    it('non apre il dialog di spawn su una cella invalida', () => {
      const page = pageWith(documentWith());
      page.spawnSearch.set('goblin');

      page.requestSpawn({ x: 11, y: 4 });

      expect(page.spawnCell()).toBeNull();
      expect(page.spawnSearch()).toBe('goblin');
    });

    it('apre il dialog su una cella valida', () => {
      const page = pageWith(documentWith());

      page.requestSpawn({ x: 10, y: 3 });

      expect(page.spawnCell()).toEqual({ x: 10, y: 3 });
      expect(page.spawnSearch()).toBe('');
      expect(page.spawnTab()).toBe('srd');
    });
  });

  describe('addSrdSpawn', () => {
    it('su cella invalida non inserisce, mantiene il dialog e segnala l’errore', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.spawnCell.set({ x: 11, y: 4 });
      page.tool.set('areaRect');

      page.addSrdSpawn(monster());

      expect(page.doc()).toBe(doc);
      expect(spawnsIn(page.doc())).toHaveLength(0);
      expect(page.spawnCell()).toEqual({ x: 11, y: 4 });
      expect(page.tool()).toBe('areaRect');
      expect(page.selected()).toBeNull();
      expect(page.dirty()).toBe(false);
      expect(page.error()).toMatch(/piazz|muro|occupat/i);
    });

    it('rifiuta uno spawn size 2 se una cella del footprint è invalida', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.spawnCell.set({ x: 10, y: 3 });

      page.addSrdSpawn(monster('large'));

      expect(page.doc()).toBe(doc);
      expect(spawnsIn(page.doc())).toHaveLength(0);
      expect(page.spawnCell()).toEqual({ x: 10, y: 3 });
      expect(page.error()).toMatch(/piazz|muro|occupat/i);
    });

    it('inserisce lo spawn in una cella valida e chiude il dialog', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.spawnCell.set({ x: 10, y: 3 });

      page.addSrdSpawn(monster());

      const spawns = spawnsIn(page.doc());
      expect(spawns).toHaveLength(1);
      expect(spawns[0]).toMatchObject({ x: 10, y: 3, size: 1 });
      expect(page.spawnCell()).toBeNull();
      expect(page.selected()).toMatchObject({ type: 'spawn' });
      expect(page.tool()).toBe('select');
      expect(page.dirty()).toBe(true);
    });
  });

  describe('addActorSpawn', () => {
    it('su cella invalida non inserisce, mantiene il dialog e segnala l’errore', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.spawnCell.set({ x: 11, y: 4 });

      page.addActorSpawn(actor());

      expect(page.doc()).toBe(doc);
      expect(spawnsIn(page.doc())).toHaveLength(0);
      expect(page.spawnCell()).toEqual({ x: 11, y: 4 });
      expect(page.dirty()).toBe(false);
      expect(page.error()).toMatch(/piazz|muro|occupat/i);
    });

    it('rifiuta un attore size 2 con footprint invalido', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.spawnCell.set({ x: 10, y: 3 });

      page.addActorSpawn(actor('large'));

      expect(page.doc()).toBe(doc);
      expect(spawnsIn(page.doc())).toHaveLength(0);
      expect(page.spawnCell()).toEqual({ x: 10, y: 3 });
    });

    it('inserisce l’attore in una cella valida', () => {
      const doc = documentWith();
      const page = pageWith(doc);
      page.spawnCell.set({ x: 12, y: 4 });

      page.addActorSpawn(actor());

      const spawns = spawnsIn(page.doc());
      expect(spawns).toHaveLength(1);
      expect(spawns[0]).toMatchObject({ x: 12, y: 4, size: 1 });
      expect(page.spawnCell()).toBeNull();
      expect(page.dirty()).toBe(true);
    });
  });

  describe('moveElement', () => {
    it('non sposta uno spawn verso una cella invalida', () => {
      const doc = documentWith([spawn('spawn-1', 10, 3)]);
      const page = pageWith(doc);

      page.moveElement({ selection: { type: 'spawn', id: 'spawn-1' }, cell: { x: 11, y: 4 } });

      expect(page.doc()).toBe(doc);
      expect(spawnsIn(page.doc())[0]).toMatchObject({ x: 10, y: 3 });
      expect(page.dirty()).toBe(false);
    });

    it('sposta uno spawn verso una cella valida e permette l’annullamento', () => {
      const doc = documentWith([spawn('spawn-1', 10, 3)]);
      const page = pageWith(doc);

      page.moveElement({ selection: { type: 'spawn', id: 'spawn-1' }, cell: { x: 12, y: 4 } });

      expect(spawnsIn(page.doc())[0]).toMatchObject({ x: 12, y: 4 });
      expect(page.dirty()).toBe(true);

      page.undo();
      expect(spawnsIn(page.doc())[0]).toMatchObject({ x: 10, y: 3 });
    });

    it('valida il footprint di uno spawn size 2', () => {
      const doc = documentWith([spawn('spawn-1', 9, 3, 2)]);
      const page = pageWith(doc);

      page.moveElement({ selection: { type: 'spawn', id: 'spawn-1' }, cell: { x: 10, y: 3 } });
      expect(spawnsIn(page.doc())[0]).toMatchObject({ x: 9, y: 3 });
      expect(page.dirty()).toBe(false);

      page.moveElement({ selection: { type: 'spawn', id: 'spawn-1' }, cell: { x: 9, y: 4 } });
      expect(spawnsIn(page.doc())[0]).toMatchObject({ x: 9, y: 4 });
      expect(page.dirty()).toBe(true);
    });

    it('non sposta una partenza verso una cella invalida', () => {
      const doc = documentWith([start('start-1', 10, 3)]);
      const page = pageWith(doc);

      page.moveElement({ selection: { type: 'start', id: 'start-1' }, cell: { x: 11, y: 4 } });

      expect(page.doc()).toBe(doc);
      expect(startsIn(page.doc())[0]).toMatchObject({ x: 10, y: 3 });
      expect(page.dirty()).toBe(false);
    });
  });
});
