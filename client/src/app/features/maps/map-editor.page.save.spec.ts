import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  emptyMapDocumentV2,
  type Map,
  type MapDocument,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
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
});
