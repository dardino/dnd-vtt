import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  emptyMapDocumentV2,
  type ImageGraphic,
  type Map,
  type MapDocument,
  type MapGraphic,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import type { MapRenderAssets } from './map-image-renderer';
import { MapEditorPage } from './map-editor.page';
import { MapRenderService } from './map-render.service';

const MAP_ID = '77777777-7777-4777-8777-777777777777';
const CAMPAIGN_ID = '88888888-8888-4888-8888-888888888888';
const THUMB_ID = '99999999-9999-4999-8999-999999999999';
const COMPOSITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mapFor = (doc: MapDocument): Map => ({
  ...doc,
  id: MAP_ID,
  campaignId: CAMPAIGN_ID,
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
});

const GRAPHIC_ASSET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const polygonItem: PolygonGraphic = {
  kind: 'polygon',
  id: 'poligono-1',
  points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }],
  fill: '#4ea1ff',
  opacity: 0.35,
  z: 0,
};

const textItem: TextGraphic = {
  kind: 'text',
  id: 'testo-1',
  text: 'Sala',
  fontFamily: 'serif',
  fontSize: 32,
  color: '#ffcc00',
  x: 140,
  y: 210,
  opacity: 1,
  z: 1,
};

const imageItem: ImageGraphic = {
  kind: 'image',
  id: 'immagine-1',
  assetId: GRAPHIC_ASSET_ID,
  x: 10,
  y: 20,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 2,
};

const docWithGraphics = (items: MapGraphic[]): MapDocument => {
  const base = emptyMapDocumentV2('Mappa', null, 800, 600);
  const [background, graphics, constraints, elements] = base.layers;
  return {
    ...base,
    layers: [background, { ...graphics, items }, constraints, elements],
  };
};

const getMap = vi.fn();
const saveMap = vi.fn();
const renderAndUpload = vi.fn();
const getAsset = vi.fn();
const upload = vi.fn();

const loadPage = async (map: Map): Promise<ComponentFixture<MapEditorPage>> => {
  getMap.mockResolvedValue(map);
  const fixture = TestBed.createComponent(MapEditorPage);
  fixture.componentRef.setInput('mapId', map.id);
  fixture.detectChanges();
  await fixture.whenStable();
  TestBed.tick();
  await fixture.whenStable();
  return fixture;
};

describe('MapEditorPage save con derivati', () => {
  beforeEach(() => {
    getMap.mockReset();
    saveMap.mockReset();
    renderAndUpload.mockReset();
    getAsset.mockReset();
    upload.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { get: getAsset, upload } },
        { provide: ActorService, useValue: { listByCampaign: () => Promise.resolve([]) } },
        {
          provide: SrdCatalogService,
          useValue: { load: () => Promise.resolve(), catalog: () => null },
        },
        { provide: Router, useValue: {} },
        { provide: MapRenderService, useValue: { renderAndUpload } },
      ],
    });
  });

  it('genera i derivati e li invia insieme al documento nel PUT', async () => {
    const map = mapFor(emptyMapDocumentV2('Mappa', null, 800, 600));
    const fixture = await loadPage(map);
    const page = fixture.componentInstance;
    const doc = page.doc() as MapDocument;
    const before = structuredClone(doc);
    renderAndUpload.mockResolvedValue({
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
      warnings: [],
    });
    saveMap.mockResolvedValue({
      ...map,
      version: 2,
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
    });

    await page.save();

    expect(renderAndUpload).toHaveBeenCalledWith(
      map,
      doc,
      expect.objectContaining({ background: null, graphics: [] }),
    );
    expect(saveMap).toHaveBeenCalledWith(map.id, 1, doc, {
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
    });
    expect(page.version()).toBe(2);
    expect(page.dirty()).toBe(false);
    expect(page.warning()).toBeNull();
    expect(page.error()).toBeNull();
    expect(page.doc()).toEqual(before);
    fixture.destroy();
  });

  it('se il render totale fallisce esegue comunque il PUT senza derivati e mostra il warning', async () => {
    const map = mapFor(emptyMapDocumentV2('Mappa', null, 800, 600));
    const fixture = await loadPage(map);
    const page = fixture.componentInstance;
    const before = structuredClone(page.doc());
    renderAndUpload.mockResolvedValue({
      thumbAssetId: null,
      compositeAssetId: null,
      warnings: ['Anteprima non disponibile'],
    });
    saveMap.mockResolvedValue({ ...map, version: 2 });

    await page.save();

    const args = saveMap.mock.calls[0] as unknown[];
    expect(args[3] ?? {}).toEqual({});
    expect(page.warning()).toContain('Anteprima non disponibile');
    expect(page.error()).toBeNull();
    expect(page.version()).toBe(2);
    expect(page.dirty()).toBe(false);
    expect(page.doc()).toEqual(before);
    fixture.destroy();
  });

  it('un fallimento parziale invia solo il composito e conserva la thumb precedente', async () => {
    const map = mapFor(emptyMapDocumentV2('Mappa', null, 800, 600));
    const fixture = await loadPage(map);
    const page = fixture.componentInstance;
    renderAndUpload.mockResolvedValue({
      thumbAssetId: null,
      compositeAssetId: COMPOSITE_ID,
      warnings: ['Thumbnail non generata'],
    });
    saveMap.mockResolvedValue({ ...map, version: 2, compositeAssetId: COMPOSITE_ID });

    await page.save();

    const derivatives = saveMap.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(derivatives).toEqual({ compositeAssetId: COMPOSITE_ID });
    expect(derivatives).not.toHaveProperty('thumbAssetId');
    expect(page.warning()).toContain('Thumbnail non generata');
    expect(page.error()).toBeNull();
    fixture.destroy();
  });

  it('un errore imprevisto del renderer non blocca il salvataggio', async () => {
    const map = mapFor(emptyMapDocumentV2('Mappa', null, 800, 600));
    const fixture = await loadPage(map);
    const page = fixture.componentInstance;
    renderAndUpload.mockRejectedValue(new Error('canvas esploso'));
    saveMap.mockResolvedValue({ ...map, version: 2 });

    await page.save();

    expect(saveMap).toHaveBeenCalledTimes(1);
    expect(saveMap.mock.calls[0]?.[3] ?? {}).toEqual({});
    expect(page.warning()).toBeTruthy();
    expect(page.error()).toBeNull();
    expect(page.saving()).toBe(false);
    fixture.destroy();
  });

  it('mostra il warning nel DOM senza perdere il documento', async () => {
    const map = mapFor(emptyMapDocumentV2('Mappa', null, 800, 600));
    const fixture = await loadPage(map);
    const page = fixture.componentInstance;
    const before = structuredClone(page.doc());
    renderAndUpload.mockResolvedValue({
      thumbAssetId: null,
      compositeAssetId: null,
      warnings: ['Anteprima non disponibile'],
    });
    saveMap.mockResolvedValue({ ...map, version: 2 });

    await page.save();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Anteprima non disponibile');
    expect(page.doc()).toEqual(before);
    fixture.destroy();
  });

  it('passa al renderer anche poligoni e testi con image null', async () => {
    const doc = docWithGraphics([polygonItem, textItem, imageItem]);
    const map = mapFor(doc);
    const fixture = await loadPage(map);
    const page = fixture.componentInstance;
    getAsset.mockRejectedValue(new Error('asset assente'));
    renderAndUpload.mockResolvedValue({
      thumbAssetId: THUMB_ID,
      compositeAssetId: COMPOSITE_ID,
      warnings: [],
    });
    saveMap.mockResolvedValue({ ...map, version: 2 });

    await page.save();

    const assets = renderAndUpload.mock.calls[0]?.[2] as MapRenderAssets;
    expect(assets.graphics.map((entry) => entry.item.kind)).toEqual([
      'polygon',
      'text',
      'image',
    ]);
    expect(assets.graphics[0]).toEqual({ item: polygonItem, image: null });
    expect(assets.graphics[1]).toEqual({ item: textItem, image: null });
    expect(assets.graphics[2]).toEqual({ item: imageItem, image: null });
    fixture.destroy();
  });
});
