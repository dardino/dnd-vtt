import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  defaultBackgroundTransform,
  emptyMapDocument,
  type Actor,
  type Asset,
  type Map,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/actor.service';
import { AssetService } from '../../core/asset.service';
import { MapService } from '../../core/map.service';
import { SrdCatalogService } from '../../core/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const asset: Asset = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  hash: 'a'.repeat(64),
  mime: 'image/png',
  bytes: 1024,
  width: 400,
  height: 400,
  url: '/uploads/map.png',
  previewUrl: '/uploads/map-preview.png',
  thumbUrl: '/uploads/map-thumb.png',
  createdAt: '2026-11-02T00:00:00.000Z',
};

const secondAsset: Asset = {
  ...asset,
  id: 'c0ffee00-0000-4000-8000-000000000002',
  width: 400,
  height: 200,
  url: '/uploads/second.png',
  previewUrl: '/uploads/second-preview.png',
  thumbUrl: '/uploads/second-thumb.png',
};

const mapFor = (id: string, campaignId: string): Map => ({
  id,
  campaignId,
  version: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...emptyMapDocument('Mappa', null, 700, 700),
});

const actorFor = (id: string, name: string): Actor =>
  ({ id, name, kind: 'monster' } as unknown as Actor);

const chooseFile = (name: string): Event => {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    value: [new File(['image'], name, { type: 'image/png' })],
  });
  return { target: input } as unknown as Event;
};

const rename = (page: MapEditorPage, value: string): void => {
  const input = document.createElement('input');
  input.value = value;
  page.updateMapField('name', { target: input } as unknown as Event);
};

const numberInput = (value: number): Event => {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  return { target: input } as unknown as Event;
};

const textInput = (value: string): Event => {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
};

describe('MapEditorPage history', () => {
  const upload = vi.fn();
  const get = vi.fn();
  const getMap = vi.fn();
  const listByCampaign = vi.fn();

  beforeEach(() => {
    upload.mockReset();
    get.mockReset();
    getMap.mockReset();
    listByCampaign.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap } },
        { provide: AssetService, useValue: { upload, get } },
        { provide: ActorService, useValue: { listByCampaign } },
        { provide: SrdCatalogService, useValue: { load: () => Promise.resolve(), catalog: () => null } },
        { provide: Router, useValue: {} },
      ],
    });
  });

  it('mantiene undo e redo invariati con la history limitata', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Iniziale', null, 700, 700));

    rename(page, 'Uno');
    rename(page, 'Due');

    page.undo();
    expect(page.doc()?.name).toBe('Uno');
    page.undo();
    expect(page.doc()?.name).toBe('Iniziale');
    page.redo();
    expect(page.doc()?.name).toBe('Uno');
    page.redo();
    expect(page.doc()?.name).toBe('Due');

    page.undo();
    rename(page, 'Tre');
    page.redo();
    expect(page.doc()?.name).toBe('Tre');

    fixture.destroy();
  });

  it('sequenza mista add/move/update/remove con undo e redo completi', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    const initial = emptyMapDocument('Iniziale', null, 800, 800);
    page.doc.set(initial);

    page.onWallsDrawn({
      walls: [
        { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } },
        { id: 'wall-2', kind: 'door', a: { x: 1, y: 0 }, b: { x: 1, y: 1 } },
        { id: 'fuori', kind: 'wall', a: { x: 99, y: 99 }, b: { x: 100, y: 100 } },
      ],
    });
    page.placeLight({ x: 1, y: 1 });
    const light = page.doc()?.terrain.lights[0];
    if (light === undefined) {
      throw new Error('luce non creata');
    }
    page.select({ type: 'light', id: light.id });
    page.moveElement({ selection: { type: 'light', id: light.id }, cell: { x: 4, y: 5 } });
    page.updateLightField('brightFeet', numberInput(30));

    page.placeStart({ x: 2, y: 2 });
    page.updateStartLabel(textInput('Ingresso'));
    page.removeSelected();

    const edited = structuredClone(page.doc());
    expect(edited?.terrain.walls.map((wall) => wall.id)).toEqual(['wall-1', 'wall-2']);
    expect(edited?.terrain.lights[0]).toMatchObject({ x: 4, y: 5, brightFeet: 30 });
    expect(edited?.playerStarts).toEqual([]);
    expect(page.selected()).toBeNull();
    expect(page.dirty()).toBe(true);

    for (let index = 0; index < 7; index += 1) {
      page.undo();
    }
    expect(page.doc()).toEqual(initial);
    expect(page.dirty()).toBe(true);

    for (let index = 0; index < 7; index += 1) {
      page.redo();
    }
    expect(page.doc()).toEqual(edited);

    fixture.destroy();
  });

  it('la griglia riduce il limite di visione e undo ripristina entrambi', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Griglia', null, 700, 700));
    const visionLimit = page.doc()?.terrain.visionLimitFeet;

    page.updateGridField('feetPerCell', numberInput(2));
    expect(page.doc()?.grid.feetPerCell).toBe(2);
    expect(page.doc()?.terrain.visionLimitFeet).toBe(20);

    page.undo();
    expect(page.doc()?.grid.feetPerCell).toBe(5);
    expect(page.doc()?.terrain.visionLimitFeet).toBe(visionLimit);

    page.redo();
    expect(page.doc()?.grid.feetPerCell).toBe(2);
    expect(page.doc()?.terrain.visionLimitFeet).toBe(20);

    fixture.destroy();
  });

  it('carica lo sfondo in cover centrato senza cambiare widthPx/heightPx', async () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Sfondo', null, 800, 600));
    const visionLimit = page.doc()?.terrain.visionLimitFeet;
    upload.mockResolvedValue(asset);

    await page.replaceBackground(chooseFile('mappa.png'));

    expect(page.doc()).toMatchObject({
      imageAssetId: asset.id,
      widthPx: 800,
      heightPx: 600,
      backgroundTransform: { x: 0, y: -100, scale: 2 },
    });
    expect(page.doc()?.terrain.visionLimitFeet).toBe(visionLimit);
    expect(page.image()).toEqual({ url: asset.url, width: 800, height: 600 });
    expect(page.hasBackground()).toBe(true);

    fixture.destroy();
  });

  it('rimuove lo sfondo e ripristina la trasformazione neutra', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(
      emptyMapDocument('Sfondo', asset.id, 800, 600, { x: 0, y: -100, scale: 2 }),
    );
    page.image.set({ url: asset.url, width: 800, height: 600 });

    page.removeBackground();

    expect(page.doc()?.imageAssetId).toBeNull();
    expect(page.doc()?.backgroundTransform).toEqual(defaultBackgroundTransform);
    expect(page.image()).toBeNull();
    expect(page.hasBackground()).toBe(false);

    fixture.destroy();
  });

  it('adatta di nuovo lo sfondo in cover centrato', async () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Sfondo', null, 800, 600));
    upload.mockResolvedValue({ ...asset, width: 400, height: 200 });
    await page.replaceBackground(chooseFile('mappa.png'));

    const current = page.doc();
    if (current === null) {
      throw new Error('documento non caricato');
    }
    page.doc.set({
      ...current,
      backgroundTransform: { x: 0, y: 0, scale: 1 },
    });
    await page.fitBackgroundCover();

    expect(page.doc()?.backgroundTransform).toEqual({ x: -200, y: 0, scale: 3 });
    expect(page.doc()?.widthPx).toBe(800);
    expect(page.doc()?.heightPx).toBe(600);

    fixture.destroy();
  });

  it('ricarica lo sfondo dopo rimuovi+undo e Adatta', async () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Sfondo', null, 800, 600));
    upload.mockResolvedValue(asset);
    get.mockResolvedValue(asset);
    await page.replaceBackground(chooseFile('mappa.png'));

    page.removeBackground();
    page.undo();
    expect(page.doc()?.imageAssetId).toBe(asset.id);
    const restored = page.doc();
    if (restored === null) {
      throw new Error('documento non caricato');
    }
    page.doc.set({ ...restored, backgroundTransform: { x: 0, y: 0, scale: 1 } });

    await page.fitBackgroundCover();

    expect(get).toHaveBeenCalledWith(asset.id);
    expect(page.doc()?.backgroundTransform).toEqual({ x: 0, y: -100, scale: 2 });
    expect(page.image()).toEqual({ url: asset.url, width: 800, height: 600 });

    fixture.destroy();
  });

  it('dopo sostituisci+undo Adatta usa le dimensioni dell’asset ripristinato', async () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(
      emptyMapDocument('Sfondo', asset.id, 800, 600, { x: 0, y: -100, scale: 2 }),
    );
    upload.mockResolvedValue(secondAsset);
    get.mockImplementation((id: string) =>
      Promise.resolve(id === asset.id ? asset : secondAsset));
    await page.replaceBackground(chooseFile('sostituto.png'));
    expect(page.doc()?.imageAssetId).toBe(secondAsset.id);

    page.undo();
    expect(page.doc()?.imageAssetId).toBe(asset.id);
    const restored = page.doc();
    if (restored === null) {
      throw new Error('documento non caricato');
    }
    page.doc.set({ ...restored, backgroundTransform: { x: 0, y: 0, scale: 1 } });

    await page.fitBackgroundCover();

    expect(get).toHaveBeenCalledWith(asset.id);
    expect(page.doc()?.backgroundTransform).toEqual({ x: 0, y: -100, scale: 2 });
    expect(page.image()).toEqual({ url: asset.url, width: 800, height: 600 });

    fixture.destroy();
  });

  it('carica gli attori con il resource e li ricarica al cambio campagna', async () => {
    const first = actorFor('actor-1', 'Goblin');
    const second = actorFor('actor-2', 'Orso');
    getMap.mockResolvedValue(mapFor('map-1', 'campaign-1'));
    listByCampaign.mockResolvedValue([first]);

    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', 'map-1');
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    await fixture.whenStable();

    expect(listByCampaign).toHaveBeenCalledWith('campaign-1');
    expect(fixture.componentInstance.filteredActors()).toEqual([first]);

    getMap.mockResolvedValue(mapFor('map-2', 'campaign-2'));
    listByCampaign.mockResolvedValue([second]);
    fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    TestBed.tick();
    await fixture.whenStable();

    expect(listByCampaign).toHaveBeenCalledWith('campaign-2');
    expect(fixture.componentInstance.filteredActors()).toEqual([second]);

    fixture.destroy();
  });
});
