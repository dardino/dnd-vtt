import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  mapDocumentSchema,
  type Map,
  type MapDocument,
  type PolygonGraphic,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import {
  MAP_ID,
  baseDocument,
  graphicsOf,
  withGraphics,
} from './map-editor.page.graphics.test-helpers';
import { MapEditorPage } from './map-editor.page';

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-graphics-limits',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  ...doc,
});

const polygon = (overrides: Partial<PolygonGraphic> = {}): PolygonGraphic => ({
  kind: 'polygon',
  id: 'p1',
  points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 0,
  ...overrides,
});

/** Punti interi dentro la griglia 10x10 della mappa di prova (700px, celle 70px). */
const gridPoints = (count: number): Array<{ x: number; y: number }> =>
  Array.from({ length: count }, (_, index) => ({
    x: index % 10,
    y: Math.floor(index / 10) % 10,
  }));

describe('MapEditorPage limiti e clamp dei poligoni', () => {
  const getMap = vi.fn();
  const saveMap = vi.fn();

  beforeEach(() => {
    getMap.mockReset();
    saveMap.mockReset();
    saveMap.mockResolvedValue({ version: 2 });
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        {
          provide: AssetService,
          useValue: { upload: vi.fn(), get: vi.fn().mockRejectedValue(new Error('assente')) },
        },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        {
          provide: SrdCatalogService,
          useValue: { load: () => Promise.resolve(), catalog: () => null },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  const render = async (
    doc: MapDocument = baseDocument(),
  ): Promise<ComponentFixture<MapEditorPage>> => {
    getMap.mockResolvedValue(toMap(doc));
    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', MAP_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('addGraphicPolygon con 201 punti è un no-op e lascia il documento valido', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());

    page.addGraphicPolygon(gridPoints(201));

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);
    expect(mapDocumentSchema.safeParse(page.doc()).success).toBe(true);

    fixture.destroy();
  });

  it('addGraphicPolygon con 200 punti inserisce regolarmente', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const points = gridPoints(200);

    page.addGraphicPolygon(points);

    const items = graphicsOf(page.doc());
    expect(items).toHaveLength(1);
    const added = items[0] as PolygonGraphic;
    expect(added.points).toEqual(points);
    expect(added.points).toHaveLength(200);
    expect(page.dirty()).toBe(true);
    expect(mapDocumentSchema.safeParse(page.doc()).success).toBe(true);

    fixture.destroy();
  });

  it('translateGraphic con offset clampa il bordo destro e inferiore in pixel', async () => {
    const base = baseDocument();
    const grid = { ...base.grid, offsetX: 10, offsetY: 20 };
    const doc: MapDocument = {
      ...withGraphics(base, [
        polygon({ points: [{ x: 7, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 8 }] }),
      ]),
      grid,
    };
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    page.translateGraphic({ id: 'p1', dx: 100, dy: 100 });

    const moved = graphicsOf(page.doc())[0] as PolygonGraphic;
    const world = moved.points.map((point) => ({
      x: grid.offsetX + point.x * grid.cellSizePx,
      y: grid.offsetY + point.y * grid.cellSizePx,
    }));

    expect(Math.max(...world.map((point) => point.x))).toBeLessThanOrEqual(doc.widthPx);
    expect(Math.max(...world.map((point) => point.y))).toBeLessThanOrEqual(doc.heightPx);
    // La forma resta rigida: nessun vertice agganciato singolarmente.
    expect(moved.points[1]!.x - moved.points[0]!.x).toBe(1);
    expect(moved.points[2]!.y - moved.points[1]!.y).toBe(1);
    expect(mapDocumentSchema.safeParse(page.doc()).success).toBe(true);

    fixture.destroy();
  });

  it('translateGraphic con offset clampa il bordo sinistro e superiore', async () => {
    const base = baseDocument();
    const grid = { ...base.grid, offsetX: 10, offsetY: 20 };
    const doc: MapDocument = {
      ...withGraphics(base, [
        polygon({ points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }),
      ]),
      grid,
    };
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    page.translateGraphic({ id: 'p1', dx: -100, dy: -100 });

    const moved = graphicsOf(page.doc())[0] as PolygonGraphic;
    const world = moved.points.map((point) => ({
      x: grid.offsetX + point.x * grid.cellSizePx,
      y: grid.offsetY + point.y * grid.cellSizePx,
    }));

    expect(Math.min(...world.map((point) => point.x))).toBeGreaterThanOrEqual(0);
    expect(Math.min(...world.map((point) => point.y))).toBeGreaterThanOrEqual(0);
    expect(moved.points[1]!.x - moved.points[0]!.x).toBe(1);
    expect(moved.points[2]!.y - moved.points[1]!.y).toBe(1);

    fixture.destroy();
  });
});
