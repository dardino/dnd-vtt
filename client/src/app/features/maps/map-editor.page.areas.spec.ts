import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import {
  emptyMapDocument,
  type BlockedArea,
  type Map,
  type MapDocument,
  type MapLayerKind,
  type MapLayers,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';
import { MapEditorPage } from './map-editor.page';

const MAP_ID = 'map-areas';

const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 2, y: 0 },
};

const otherWall: WallSegment = {
  id: 'wall-2',
  kind: 'wall',
  a: { x: 0, y: 2 },
  b: { x: 2, y: 2 },
};

const rectArea: BlockedArea = {
  id: 'area-rect',
  shape: 'rect',
  points: [{ x: 1, y: 1 }, { x: 3, y: 2 }],
};

const polygonArea: BlockedArea = {
  id: 'area-polygon',
  shape: 'polygon',
  points: [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }],
};

const baseDocument = (): MapDocument => emptyMapDocument('Aree', null, 700, 700);

/** Documento con gli item indicati nel layer constraints. */
const withConstraints = (doc: MapDocument, items: MapLayers[2]['items']): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [background, graphics, { ...constraints, items }, elements],
  };
};

const withLayerState = (
  doc: MapDocument,
  kind: MapLayerKind,
  patch: { visible?: boolean; locked?: boolean },
): MapDocument => ({
  ...doc,
  layers: doc.layers.map((layer) =>
    layer.kind === kind ? { ...layer, ...patch } : layer,
  ) as MapLayers,
});

const withGridType = (doc: MapDocument, type: 'square' | 'hex'): MapDocument => ({
  ...doc,
  grid: { ...doc.grid, type },
});

const itemsOf = (doc: MapDocument | null): MapLayers[2]['items'] => doc?.layers[2].items ?? [];

const idsOf = (doc: MapDocument | null): string[] => itemsOf(doc).map((item) => item.id);

const wallsOf = (doc: MapDocument | null): WallSegment[] =>
  itemsOf(doc).filter((item): item is WallSegment => 'kind' in item);

const areasOf = (doc: MapDocument | null): BlockedArea[] =>
  itemsOf(doc).filter((item): item is BlockedArea => 'shape' in item);

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-areas',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  ...doc,
});

const canvasOf = (fixture: ComponentFixture<MapEditorPage>): MapEditorCanvasComponent => {
  const debug = fixture.debugElement.query(By.directive(MapEditorCanvasComponent));
  if (debug === null) {
    throw new Error('canvas dell’editor assente');
  }
  return debug.componentInstance as MapEditorCanvasComponent;
};

describe('MapEditorPage aree bloccate', () => {
  const getMap = vi.fn();
  const saveMap = vi.fn();

  beforeEach(() => {
    getMap.mockReset();
    saveMap.mockReset();
    saveMap.mockResolvedValue({ version: 2 });
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { upload: vi.fn(), get: vi.fn() } },
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

  it('espone solo le aree del layer constraints, senza i muri', async () => {
    const fixture = await render(withConstraints(baseDocument(), [wall, rectArea, polygonArea]));
    const page = fixture.componentInstance;

    expect(page.blockedAreas()).toEqual([rectArea, polygonArea]);

    fixture.destroy();
  });

  it('addArea inserisce l’area, la seleziona e passa dalla history', async () => {
    const fixture = await render(withConstraints(baseDocument(), [wall]));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');

    page.addArea(rectArea);

    expect(idsOf(page.doc())).toEqual(['wall-1', 'area-rect']);
    expect(wallsOf(page.doc())).toEqual([wall]);
    expect(page.selected()).toEqual({ type: 'area', id: rectArea.id });
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(idsOf(page.doc())).toEqual(['wall-1']);
    page.redo();
    expect(idsOf(page.doc())).toEqual(['wall-1', 'area-rect']);

    fixture.destroy();
  });

  it('addArea conserva i muri intercalati anche con più aree', async () => {
    const doc = withConstraints(baseDocument(), [wall, rectArea, otherWall]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');

    page.addArea(polygonArea);

    expect(idsOf(page.doc())).toEqual(['wall-1', 'area-rect', 'wall-2', 'area-polygon']);
    expect(wallsOf(page.doc())).toEqual([wall, otherWall]);

    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  it('updateAreaLabel aggiorna l’etichetta con undo e redo', async () => {
    const fixture = await render(withConstraints(baseDocument(), [wall, rectArea]));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    page.select({ type: 'area', id: rectArea.id });

    page.updateAreaLabel('Sala del trono');

    expect(areasOf(page.doc())[0]).toEqual({ ...rectArea, label: 'Sala del trono' });
    expect(wallsOf(page.doc())).toEqual([wall]);
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(areasOf(page.doc())[0]).toEqual(rectArea);
    page.redo();
    expect(areasOf(page.doc())[0]).toEqual({ ...rectArea, label: 'Sala del trono' });

    fixture.destroy();
  });

  it('removeSelected rimuove l’area selezionata e la ripristina con undo', async () => {
    const doc = withConstraints(baseDocument(), [wall, rectArea, otherWall, polygonArea]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    page.select({ type: 'area', id: rectArea.id });

    page.removeSelected();

    expect(idsOf(page.doc())).toEqual(['wall-1', 'wall-2', 'area-polygon']);
    expect(wallsOf(page.doc())).toEqual([wall, otherWall]);
    expect(page.selected()).toBeNull();
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(page.doc()).toEqual(doc);
    page.redo();
    expect(idsOf(page.doc())).toEqual(['wall-1', 'wall-2', 'area-polygon']);

    fixture.destroy();
  });

  it('un layer constraints bloccato blocca aggiunta, modifica e rimozione', async () => {
    const doc = withLayerState(
      withConstraints(baseDocument(), [wall, rectArea]),
      'constraints',
      { locked: true },
    );
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());

    page.addArea(polygonArea);
    page.select({ type: 'area', id: rectArea.id });
    page.updateAreaLabel('Bloccata');
    page.removeSelected();

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('rifiuta gli strumenti area su una griglia esagonale con lo stesso avviso dei muri', async () => {
    const fixture = await render(withGridType(baseDocument(), 'hex'));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');

    page.setTool('wall');
    const wallError = page.error();
    expect(wallError).not.toBeNull();

    page.setTool('areaRect');
    expect(page.tool()).toBe('select');
    expect(page.error()).toBe(wallError);

    page.setTool('areaPolygon');
    expect(page.tool()).toBe('select');
    expect(page.error()).toBe(wallError);

    fixture.destroy();
  });

  it('salva aree e muri misti nel layer constraints di toDocument', async () => {
    const doc = withConstraints(baseDocument(), [wall, polygonArea, otherWall]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;

    await page.save();

    const saved = saveMap.mock.calls[0]?.[2] as MapDocument;
    expect(saved.layers[2].items).toEqual([wall, polygonArea, otherWall]);

    fixture.destroy();
  });

  it('collega areaDrawn del canvas ad addArea generando un id', async () => {
    const fixture = await render(withConstraints(baseDocument(), [wall]));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    fixture.detectChanges();

    canvasOf(fixture).areaDrawn.emit({ shape: 'rect', points: [{ x: 1, y: 1 }, { x: 4, y: 3 }] });

    const areas = areasOf(page.doc());
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({
      shape: 'rect',
      points: [{ x: 1, y: 1 }, { x: 4, y: 3 }],
    });
    expect(areas[0]?.id).not.toBe('');
    expect(page.selected()).toEqual({ type: 'area', id: areas[0]?.id });
    expect(page.dirty()).toBe(true);

    fixture.destroy();
  });

  it('collega areaRemoved del canvas alla rimozione con undo', async () => {
    const doc = withConstraints(baseDocument(), [wall, rectArea, polygonArea]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    fixture.detectChanges();

    canvasOf(fixture).areaRemoved.emit({ id: rectArea.id });

    expect(idsOf(page.doc())).toEqual(['wall-1', 'area-polygon']);
    expect(wallsOf(page.doc())).toEqual([wall]);

    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });
});
