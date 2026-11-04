import { TestBed } from '@angular/core/testing';
import {
  emptyMapDocument,
  type ConstraintsLayer,
  type ElementsLayer,
  type MapDocument,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';
import { Router } from '@angular/router';

const wallsOf = (doc: MapDocument): WallSegment[] =>
  doc.layers[2].items.filter((item): item is WallSegment => 'kind' in item);

const withCollections = (
  doc: MapDocument,
  walls: ConstraintsLayer['items'],
  elements: ElementsLayer['items'],
): MapDocument => {
  const [background, graphics, constraints, layersElements] = doc.layers;
  return {
    ...doc,
    layers: [
      background,
      graphics,
      { ...constraints, items: walls },
      { ...layersElements, items: elements },
    ],
  };
};

describe('MapEditorPage movement', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: vi.fn() } },
        {
          provide: AssetService,
          useValue: { upload: vi.fn(), get: vi.fn() },
        },
        { provide: ActorService, useValue: { listByCampaign: vi.fn() } },
        {
          provide: SrdCatalogService,
          useValue: { load: () => Promise.resolve(), catalog: () => null },
        },
        { provide: Router, useValue: {} },
      ],
    });
  });

  it('sposta muri e punti con comandi annullabili', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    const doc = withCollections(
      emptyMapDocument('Sposta', null, 700, 700),
      [{ id: 'wall-1', kind: 'wall', a: { x: 1, y: 1 }, b: { x: 2, y: 1 } }],
      [{
        id: 'spawn-1',
        type: 'spawn',
        kind: 'monster',
        x: 1,
        y: 1,
        size: 1,
        quantity: 1,
        hidden: false,
        source: { type: 'srd', monsterId: 'goblin' },
      }],
    );
    page.doc.set(doc);

    page.moveWall({ id: 'wall-1', dx: 1, dy: 0 });
    expect(wallsOf(page.doc() as MapDocument)[0]?.a).toEqual({ x: 2, y: 1 });
    page.undo();
    expect(wallsOf(page.doc() as MapDocument)[0]?.a).toEqual({ x: 1, y: 1 });

    page.moveElement({ selection: { type: 'spawn', id: 'spawn-1' }, cell: { x: 2, y: 1 } });
    const spawnAfter = (page.doc() as MapDocument).layers[3].items
      .find((item) => item.type === 'spawn');
    expect(spawnAfter).toMatchObject({ x: 2 });
    page.undo();
    const spawnUndone = (page.doc() as MapDocument).layers[3].items
      .find((item) => item.type === 'spawn');
    expect(spawnUndone).toMatchObject({ x: 1 });

    fixture.destroy();
  });

  it('rifiuta un muro che uscirebbe dalla griglia', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    const doc = withCollections(
      emptyMapDocument('Bordi', null, 700, 700),
      [{ id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }],
      [],
    );
    page.doc.set(doc);

    page.moveWall({ id: 'wall-1', dx: -1, dy: 0 });

    expect(wallsOf(page.doc() as MapDocument)[0]?.a).toEqual({ x: 0, y: 0 });
    fixture.destroy();
  });
});
