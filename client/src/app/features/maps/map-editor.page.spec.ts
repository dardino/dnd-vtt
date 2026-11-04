import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  defaultBackgroundTransform,
  emptyMapDocument,
  type Actor,
  type Asset,
  type BackgroundLayer,
  type BackgroundTransform,
  type ElementsLayer,
  type Map,
  type MapDocument,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
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
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...emptyMapDocument('Mappa', null, 700, 700),
});

const actorFor = (id: string, name: string): Actor =>
  ({ id, name, kind: 'monster' } as unknown as Actor);

const backgroundOf = (doc: MapDocument): BackgroundLayer => doc.layers[0];
const elementsOf = (doc: MapDocument): ElementsLayer => doc.layers[3];

const wallsOf = (doc: MapDocument): WallSegment[] =>
  doc.layers[2].items.filter((item): item is WallSegment => 'kind' in item);

const startsOf = (doc: MapDocument): ElementsLayer['items'] =>
  elementsOf(doc).items.filter((item) => item.type === 'start');

const withBackground = (
  doc: MapDocument,
  imageAssetId: string | null,
  imageTransform: BackgroundTransform,
): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [
      { ...background, imageAssetId, imageTransform: { ...imageTransform } },
      graphics,
      constraints,
      elements,
    ],
  };
};

const chooseFile = (name: string): Event => {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    value: [new File(['image'], name, { type: 'image/png' })],
  });
  return { target: input } as unknown as Event;
};

const rename = (page: MapEditorPage, value: string): void => {
  page.propertiesForm.name().value.set(value);
  page.commitMapField('name');
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
    const current = page.doc();
    if (current === null) {
      throw new Error('documento non caricato');
    }
    const light = elementsOf(current).items.find((item) => item.type === 'light');
    if (light === undefined) {
      throw new Error('luce non creata');
    }
    page.select({ type: 'light', id: light.id });
    page.moveElement({ selection: { type: 'light', id: light.id }, cell: { x: 4, y: 5 } });
    page.updateLightField('brightFeet', numberInput(30));

    page.placeStart({ x: 2, y: 2 });
    page.updateStartLabel(textInput('Ingresso'));
    page.removeSelected();

    const edited = structuredClone(page.doc()) as MapDocument;
    expect(wallsOf(edited).map((wall) => wall.id)).toEqual(['wall-1', 'wall-2']);
    expect(elementsOf(edited).items.find((item) => item.type === 'light'))
      .toMatchObject({ x: 4, y: 5, brightFeet: 30 });
    expect(startsOf(edited)).toEqual([]);
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

  it('carica solo i campi del documento v2 senza identità né asset denormalizzati', async () => {
    const map = {
      ...mapFor('map-1', 'campaign-1'),
      thumbAssetId: 'thumb-1',
      compositeAssetId: 'composite-1',
    } as unknown as Map;
    getMap.mockResolvedValue(map);

    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', 'map-1');
    fixture.detectChanges();
    await fixture.whenStable();

    const doc = fixture.componentInstance.doc() as MapDocument;
    expect(doc).not.toBeNull();
    for (const key of [
      'id',
      'campaignId',
      'version',
      'createdAt',
      'updatedAt',
      'imageAssetId',
      'thumbAssetId',
      'compositeAssetId',
    ]) {
      expect(doc).not.toHaveProperty(key);
    }
    expect(doc.schemaVersion).toBe(2);
    expect(doc.layers.map((layer) => layer.kind))
      .toEqual(['background', 'graphics', 'constraints', 'elements']);

    fixture.destroy();
  });

  it('blocca il commit di un nome invalido e riallinea il form dopo undo', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Iniziale', null, 700, 700));
    TestBed.tick();

    page.propertiesForm.name().value.set('');
    page.commitMapField('name');
    expect(page.doc()?.name).toBe('Iniziale');

    rename(page, 'Cripta');
    expect(page.doc()?.name).toBe('Cripta');

    page.undo();
    fixture.detectChanges();
    expect(page.propertiesForm.name().value()).toBe('Iniziale');

    fixture.destroy();
  });

  it('la griglia riduce il limite di visione e undo ripristina entrambi', () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Griglia', null, 700, 700));
    const visionLimit = page.doc()?.visionLimitFeet;

    page.propertiesForm.feetPerCell().value.set(2);
    page.commitGridField('feetPerCell');
    expect(page.doc()?.grid.feetPerCell).toBe(2);
    expect(page.doc()?.visionLimitFeet).toBe(20);

    page.undo();
    expect(page.doc()?.grid.feetPerCell).toBe(5);
    expect(page.doc()?.visionLimitFeet).toBe(visionLimit);

    page.redo();
    expect(page.doc()?.grid.feetPerCell).toBe(2);
    expect(page.doc()?.visionLimitFeet).toBe(20);

    fixture.destroy();
  });

  it('carica lo sfondo in cover centrato senza cambiare widthPx/heightPx', async () => {
    const fixture = TestBed.createComponent(MapEditorPage);
    const page = fixture.componentInstance;
    page.doc.set(emptyMapDocument('Sfondo', null, 800, 600));
    const visionLimit = page.doc()?.visionLimitFeet;
    upload.mockResolvedValue(asset);
    const before = page.doc() as MapDocument;

    await page.replaceBackground(chooseFile('mappa.png'));

    const doc = page.doc() as MapDocument;
    expect(doc).toMatchObject({ widthPx: 800, heightPx: 600 });
    expect(backgroundOf(doc)).toMatchObject({
      imageAssetId: asset.id,
      imageTransform: { x: 0, y: -100, scale: 2 },
    });
    // Solo il layer background cambia: gli altri restano intatti.
    expect(doc.layers[1]).toEqual(before.layers[1]);
    expect(doc.layers[2]).toEqual(before.layers[2]);
    expect(doc.layers[3]).toEqual(before.layers[3]);
    expect(page.doc()?.visionLimitFeet).toBe(visionLimit);
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

    expect(backgroundOf(page.doc() as MapDocument).imageAssetId).toBeNull();
    expect(backgroundOf(page.doc() as MapDocument).imageTransform)
      .toEqual(defaultBackgroundTransform);
    expect(page.image()).toEqual({ url: '', width: 800, height: 600 });
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
    page.doc.set(withBackground(
      current,
      backgroundOf(current).imageAssetId,
      { x: 0, y: 0, scale: 1 },
    ));
    await page.fitBackgroundCover();

    expect(backgroundOf(page.doc() as MapDocument).imageTransform)
      .toEqual({ x: -200, y: 0, scale: 3 });
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
    expect(backgroundOf(page.doc() as MapDocument).imageAssetId).toBe(asset.id);
    const restored = page.doc();
    if (restored === null) {
      throw new Error('documento non caricato');
    }
    page.doc.set(withBackground(
      restored,
      backgroundOf(restored).imageAssetId,
      { x: 0, y: 0, scale: 1 },
    ));

    await page.fitBackgroundCover();

    expect(get).toHaveBeenCalledWith(asset.id);
    expect(backgroundOf(page.doc() as MapDocument).imageTransform)
      .toEqual({ x: 0, y: -100, scale: 2 });
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
    expect(backgroundOf(page.doc() as MapDocument).imageAssetId).toBe(secondAsset.id);

    page.undo();
    expect(backgroundOf(page.doc() as MapDocument).imageAssetId).toBe(asset.id);
    const restored = page.doc();
    if (restored === null) {
      throw new Error('documento non caricato');
    }
    page.doc.set(withBackground(
      restored,
      backgroundOf(restored).imageAssetId,
      { x: 0, y: 0, scale: 1 },
    ));

    await page.fitBackgroundCover();

    expect(get).toHaveBeenCalledWith(asset.id);
    expect(backgroundOf(page.doc() as MapDocument).imageTransform)
      .toEqual({ x: 0, y: -100, scale: 2 });
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
    expect(fixture.componentInstance.image()).toEqual({ url: '', width: 700, height: 700 });

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
