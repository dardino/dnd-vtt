import { TestBed } from '@angular/core/testing';
import { emptyMapDocument } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';
import { Router } from '@angular/router';

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
    const doc = emptyMapDocument('Sposta', null, 700, 700);
    doc.terrain.walls = [
      { id: 'wall-1', kind: 'wall', a: { x: 1, y: 1 }, b: { x: 2, y: 1 } },
    ];
    doc.spawns = [{
      id: 'spawn-1',
      kind: 'monster',
      x: 1,
      y: 1,
      size: 1,
      quantity: 1,
      hidden: false,
      source: { type: 'srd', monsterId: 'goblin' },
    }];
    page.doc.set(doc);

    page.moveWall({ id: 'wall-1', dx: 1, dy: 0 });
    expect(page.doc()?.terrain.walls[0]?.a).toEqual({ x: 2, y: 1 });
    page.undo();
    expect(page.doc()?.terrain.walls[0]?.a).toEqual({ x: 1, y: 1 });

    page.moveElement({ selection: { type: 'spawn', id: 'spawn-1' }, cell: { x: 2, y: 1 } });
    expect(page.doc()?.spawns[0]?.x).toBe(2);
    page.undo();
    expect(page.doc()?.spawns[0]?.x).toBe(1);

    fixture.destroy();
  });

  it('rifiuta un muro che uscirebbe dalla griglia', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    const doc = emptyMapDocument('Bordi', null, 700, 700);
    doc.terrain.walls = [
      { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
    ];
    page.doc.set(doc);

    page.moveWall({ id: 'wall-1', dx: -1, dy: 0 });

    expect(page.doc()?.terrain.walls[0]?.a).toEqual({ x: 0, y: 0 });
    fixture.destroy();
  });
});
