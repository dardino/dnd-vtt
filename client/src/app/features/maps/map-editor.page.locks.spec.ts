import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  emptyMapDocument,
  type Asset,
  type Map,
  type MapDocument,
  type MapElement,
  type MapLayerKind,
  type MapLayers,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const MAP_ID = 'map-locks';

const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 1, y: 1 },
  b: { x: 2, y: 1 },
};

const door: WallSegment = {
  id: 'wall-2',
  kind: 'wall',
  a: { x: 2, y: 1 },
  b: { x: 2, y: 2 },
};

const light: MapElement = {
  id: 'light-1',
  type: 'light',
  x: 1,
  y: 1,
  brightFeet: 20,
  dimFeet: 40,
  color: '#ffcc80',
  enabled: true,
  shape: 'circle',
  angle: 60,
};

const asset: Asset = {
  id: 'c0ffee00-0000-4000-8000-0000000000aa',
  hash: 'a'.repeat(64),
  mime: 'image/png',
  bytes: 1024,
  width: 400,
  height: 400,
  url: '/uploads/locks.png',
  previewUrl: '/uploads/locks-preview.png',
  thumbUrl: '/uploads/locks-thumb.png',
  createdAt: '2026-11-03T00:00:00.000Z',
};

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-locks',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...doc,
});

const baseDocument = (): MapDocument => emptyMapDocument('Lock', null, 700, 700);

const withItems = (
  doc: MapDocument,
  constraintsItems: MapLayers[2]['items'],
  elementsItems: MapLayers[3]['items'],
): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [
      background,
      graphics,
      { ...constraints, items: constraintsItems },
      { ...elements, items: elementsItems },
    ],
  };
};

const withLocked = (doc: MapDocument, kinds: readonly MapLayerKind[]): MapDocument => ({
  ...doc,
  layers: doc.layers.map((layer) =>
    kinds.includes(layer.kind) ? { ...layer, locked: true } : layer,
  ) as MapLayers,
});

/** Documento con gli item indicati e i layer elencati bloccati. */
const lockedDocument = (
  locked: readonly MapLayerKind[],
  constraintsItems: MapLayers[2]['items'] = [],
  elementsItems: MapLayers[3]['items'] = [],
): MapDocument =>
  withLocked(withItems(baseDocument(), constraintsItems, elementsItems), locked);

const backgroundOf = (doc: MapDocument | null): MapLayers[0] => {
  if (doc === null) {
    throw new Error('documento non caricato');
  }
  return doc.layers[0];
};

const layerOf = (doc: MapDocument | null, kind: MapLayerKind): MapLayers[number] => {
  if (doc === null) {
    throw new Error('documento non caricato');
  }
  const layer = doc.layers.find((entry) => entry.kind === kind);
  if (layer === undefined) {
    throw new Error(`layer ${kind} assente`);
  }
  return layer;
};

const wallsOf = (doc: MapDocument | null): WallSegment[] =>
  doc === null
    ? []
    : doc.layers[2].items.filter((item): item is WallSegment => 'kind' in item);

const lightsOf = (doc: MapDocument | null): MapElement[] =>
  doc === null
    ? []
    : doc.layers[3].items.filter((item): item is MapElement => item.type === 'light');

const startsOf = (doc: MapDocument | null): MapElement[] =>
  doc === null
    ? []
    : doc.layers[3].items.filter((item): item is MapElement => item.type === 'start');

const numberInput = (value: number): Event => {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  return { target: input } as unknown as Event;
};

const chooseFile = (name: string): Event => {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', {
    value: [new File(['image'], name, { type: 'image/png' })],
  });
  return { target: input } as unknown as Event;
};

describe('MapEditorPage locks', () => {
  const getMap = vi.fn();
  const saveMap = vi.fn();
  const upload = vi.fn();
  const getAsset = vi.fn();

  beforeEach(() => {
    getMap.mockReset();
    saveMap.mockReset();
    upload.mockReset();
    getAsset.mockReset();
    saveMap.mockResolvedValue({ version: 2 });
    getAsset.mockResolvedValue(asset);
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { upload, get: getAsset } },
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

  it('moveWall non sposta un muro del layer constraints bloccato', async () => {
    const fixture = await render(lockedDocument(['constraints'], [wall], [light]));
    const page = fixture.componentInstance;
    // Layer attivo sbloccato: il divieto deve venire dal layer che possiede il muro.
    page.setActiveLayer('elements');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());

    page.moveWall({ id: wall.id, dx: 1, dy: 1 });

    expect(page.doc()).toEqual(before);
    expect(wallsOf(page.doc())[0]?.a).toEqual({ x: 1, y: 1 });
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('onWallRemoved non elimina un muro del layer constraints bloccato', async () => {
    const fixture = await render(lockedDocument(['constraints'], [wall, door], []));
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    expect(page.activeLayerLocked()).toBe(false);

    page.onWallRemoved(wall.id);

    expect(wallsOf(page.doc()).map((entry) => entry.id)).toEqual([wall.id, door.id]);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('updateWall non cambia tipo né porta di un muro bloccato', async () => {
    const fixture = await render(lockedDocument(['constraints'], [wall], []));
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    expect(page.activeLayerLocked()).toBe(false);
    page.select({ type: 'wall', id: wall.id });
    // La selezione è presente: il divieto non può venire da un muro mancante.
    expect(page.selectedWall()?.id).toBe(wall.id);

    page.updateWall('door', 'open');

    expect(wallsOf(page.doc())[0]).toMatchObject({ kind: 'wall', id: wall.id });
    expect(wallsOf(page.doc())[0]?.door).toBeUndefined();
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('moveElement non sposta una luce del layer elements bloccato', async () => {
    const fixture = await render(lockedDocument(['elements'], [wall], [light]));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());

    page.moveElement({ selection: { type: 'light', id: light.id }, cell: { x: 4, y: 4 } });

    expect(page.doc()).toEqual(before);
    expect(lightsOf(page.doc())[0]).toMatchObject({ x: 1, y: 1 });

    fixture.destroy();
  });

  it('placeLight non aggiunge luci al layer elements bloccato', async () => {
    const fixture = await render(lockedDocument(['elements'], [], [light]));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());

    page.placeLight({ x: 3, y: 3 });

    expect(page.doc()).toEqual(before);
    expect(lightsOf(page.doc())).toHaveLength(1);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('updateLightField non modifica i campi di una luce bloccata', async () => {
    const fixture = await render(lockedDocument(['elements'], [], [light]));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    expect(page.activeLayerLocked()).toBe(false);
    page.select({ type: 'light', id: light.id });
    expect(page.selectedLight()?.id).toBe(light.id);

    page.updateLightField('brightFeet', numberInput(30));

    expect(lightsOf(page.doc())[0]).toMatchObject({ brightFeet: 20 });
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('placeStart non aggiunge partenze al layer elements bloccato', async () => {
    const fixture = await render(lockedDocument(['elements']));
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());

    page.placeStart({ x: 3, y: 3 });

    expect(page.doc()).toEqual(before);
    expect(startsOf(page.doc())).toHaveLength(0);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('replaceBackground non sostituisce lo sfondo di un layer bloccato', async () => {
    const doc = withLocked(
      emptyMapDocument('Sfondo', asset.id, 800, 600, { x: 0, y: -100, scale: 2 }),
      ['background'],
    );
    upload.mockResolvedValue({ ...asset, width: 400, height: 200 });
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    const before = structuredClone(page.doc());

    await page.replaceBackground(chooseFile('sostituto.png'));

    expect(page.doc()).toEqual(before);
    expect(backgroundOf(page.doc())).toMatchObject({
      imageAssetId: asset.id,
      imageTransform: { x: 0, y: -100, scale: 2 },
    });
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('removeBackground non rimuove lo sfondo di un layer bloccato', async () => {
    const fixture = await render(withLocked(
      emptyMapDocument('Sfondo', asset.id, 800, 600, { x: 0, y: -100, scale: 2 }),
      ['background'],
    ));
    const page = fixture.componentInstance;

    page.removeBackground();

    expect(backgroundOf(page.doc()).imageAssetId).toBe(asset.id);
    expect(backgroundOf(page.doc()).imageTransform).toEqual({ x: 0, y: -100, scale: 2 });
    expect(page.hasBackground()).toBe(true);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('fitBackgroundCover non ritrasforma lo sfondo di un layer bloccato', async () => {
    const fixture = await render(withLocked(
      emptyMapDocument('Sfondo', asset.id, 800, 600, { x: 0, y: 0, scale: 1 }),
      ['background'],
    ));
    const page = fixture.componentInstance;

    await page.fitBackgroundCover();

    expect(backgroundOf(page.doc()).imageTransform).toEqual({ x: 0, y: 0, scale: 1 });
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('il lock di un layer non blocca le modifiche agli altri layer', async () => {
    const wallsFixture = await render(lockedDocument(['constraints'], [wall], [light]));
    const wallsPage = wallsFixture.componentInstance;
    wallsPage.setActiveLayer('elements');
    wallsPage.moveElement({ selection: { type: 'light', id: light.id }, cell: { x: 4, y: 4 } });
    expect(lightsOf(wallsPage.doc())[0]).toMatchObject({ x: 4, y: 4 });
    wallsFixture.destroy();

    const elementsFixture = await render(lockedDocument(['elements'], [wall], [light]));
    const elementsPage = elementsFixture.componentInstance;
    elementsPage.setActiveLayer('constraints');
    elementsPage.moveWall({ id: wall.id, dx: 0, dy: 1 });
    expect(wallsOf(elementsPage.doc())[0]?.a).toEqual({ x: 1, y: 2 });
    elementsFixture.destroy();
  });

  it('i controlli del pannello agiscono anche sul layer background bloccato', async () => {
    const fixture = await render(lockedDocument(['background']));
    const page = fixture.componentInstance;

    page.setLayerVisible('background', false);
    expect(layerOf(page.doc(), 'background').visible).toBe(false);

    page.setLayerOpacity({ kind: 'background', opacity: 0.5 });
    expect(layerOf(page.doc(), 'background').opacity).toBeCloseTo(0.5, 5);

    page.toggleLayerLock('background');
    expect(layerOf(page.doc(), 'background').locked).toBe(false);
    expect(page.dirty()).toBe(true);

    fixture.destroy();
  });
});
