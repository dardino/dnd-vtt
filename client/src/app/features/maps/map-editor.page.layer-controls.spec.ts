import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import {
  emptyMapDocument,
  type BlockedArea,
  type Map,
  type MapDocument,
  type MapGraphic,
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

const MAP_ID = 'map-layer-controls';

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-layer-controls',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...doc,
});

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

const numberInput = (value: number): Event => {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  return { target: input } as unknown as Event;
};

const opacityRange = (root: HTMLElement, kind: MapLayerKind): HTMLInputElement => {
  const range = root.querySelector<HTMLInputElement>(
    `.layer-panel__row[data-kind="${kind}"] .layer-panel__opacity`,
  );
  if (range === null) {
    throw new Error(`range di opacità ${kind} assente`);
  }
  return range;
};

const GRAPHIC_ASSET_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const graphic: MapGraphic = {
  id: 'graphic-1',
  kind: 'image',
  assetId: GRAPHIC_ASSET_ID,
  x: 10,
  y: 20,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
  z: 0,
};

const blocked: BlockedArea = {
  id: 'area-1',
  shape: 'rect',
  points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
};

const wall: WallSegment = {
  id: 'wall-1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 1, y: 0 },
};

/** Documento con grafica decorativa, un muro e un'area bloccata. */
const withContent = (doc: MapDocument): MapDocument => {
  const [background, graphics, constraints, elements] = doc.layers;
  return {
    ...doc,
    layers: [
      background,
      { ...graphics, items: [graphic] },
      { ...constraints, items: [wall, blocked] },
      elements,
    ],
  };
};

/** Documento con stato non default sui layer, per verificare la derivazione. */
const withLayerState = (doc: MapDocument): MapDocument => ({
  ...doc,
  layers: doc.layers.map((layer) => {
    if (layer.kind === 'graphics') {
      return { ...layer, visible: false, opacity: 0.4 };
    }
    if (layer.kind === 'elements') {
      return { ...layer, locked: true };
    }
    return layer;
  }) as MapLayers,
});

const canvasOf = (fixture: ComponentFixture<MapEditorPage>): MapEditorCanvasComponent => {
  const debug = fixture.debugElement.query(By.directive(MapEditorCanvasComponent));
  if (debug === null) {
    throw new Error('canvas dell’editor assente');
  }
  return debug.componentInstance as MapEditorCanvasComponent;
};

describe('MapEditorPage layer controls', () => {
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
    doc: MapDocument = emptyMapDocument('Layer controls', null, 700, 700),
  ): Promise<ComponentFixture<MapEditorPage>> => {
    getMap.mockResolvedValue(toMap(doc));
    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', MAP_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('setLayerVisible ripetuto registra una sola modifica in history', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.setLayerVisible('background', false);
    const dirtyAfterFirst = page.dirty();
    page.setLayerVisible('background', false);

    expect(layerOf(page.doc(), 'background').visible).toBe(false);
    // Il secondo set è un no-op: dirty resta quello impostato dal primo.
    expect(page.dirty()).toBe(dirtyAfterFirst);
    expect(dirtyAfterFirst).toBe(true);

    page.undo();
    expect(layerOf(page.doc(), 'background').visible).toBe(true);

    // Una seconda undo non trova altre entry: la history conteneva un solo comando.
    page.undo();
    expect(layerOf(page.doc(), 'background').visible).toBe(true);

    fixture.destroy();
  });

  it('lock con lo stesso stato non entra in history', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.toggleLayerLock('elements', true);
    const dirtyAfterFirst = page.dirty();
    page.toggleLayerLock('elements', true);

    expect(layerOf(page.doc(), 'elements').locked).toBe(true);
    expect(page.dirty()).toBe(dirtyAfterFirst);
    expect(dirtyAfterFirst).toBe(true);

    page.undo();
    expect(layerOf(page.doc(), 'elements').locked).toBe(false);

    page.undo();
    expect(layerOf(page.doc(), 'elements').locked).toBe(false);

    fixture.destroy();
  });

  it('opacità invariata non entra in history', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    // L'opacità iniziale è già 1: il commit non deve produrre history.
    page.commitLayerOpacity('graphics', numberInput(1));
    expect(page.dirty()).toBe(false);

    page.commitLayerOpacity('graphics', numberInput(0.4));
    const dirtyAfterFirst = page.dirty();
    page.commitLayerOpacity('graphics', numberInput(0.4));

    expect(layerOf(page.doc(), 'graphics').opacity).toBeCloseTo(0.4, 5);
    expect(page.dirty()).toBe(dirtyAfterFirst);

    page.undo();
    expect(layerOf(page.doc(), 'graphics').opacity).toBe(1);

    page.undo();
    expect(layerOf(page.doc(), 'graphics').opacity).toBe(1);

    fixture.destroy();
  });

  it('il change del range del pannello aggiorna opacità, dirty e history', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    const range = opacityRange(root, 'graphics');
    expect(range.value).toBe('1');

    range.value = '0.4';
    range.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(layerOf(page.doc(), 'graphics').opacity).toBeCloseTo(0.4, 5);
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(layerOf(page.doc(), 'graphics').opacity).toBe(1);

    fixture.destroy();
  });

  it('passa al canvas i layerFlags derivati dai layer del documento', async () => {
    const fixture = await render(withLayerState(
      emptyMapDocument('Layer controls', null, 700, 700),
    ));
    const canvas = canvasOf(fixture);

    expect(canvas.layerFlags()).toEqual({
      background: { visible: true, locked: false, opacity: 1 },
      graphics: { visible: false, locked: false, opacity: 0.4 },
      constraints: { visible: true, locked: false, opacity: 1 },
      elements: { visible: true, locked: true, opacity: 1 },
    });

    fixture.destroy();
  });

  it('passa al canvas grafiche e aree bloccate del documento', async () => {
    const fixture = await render(withContent(
      emptyMapDocument('Layer controls', null, 700, 700),
    ));
    const canvas = canvasOf(fixture);

    expect(canvas.graphics().map((entry) => entry.item)).toEqual([graphic]);
    expect(canvas.blockedAreas()).toEqual([blocked]);

    fixture.destroy();
  });

  it('togglando la visibilità dal pannello cambiano i layerFlags del canvas', async () => {
    const fixture = await render(withContent(
      emptyMapDocument('Layer controls', null, 700, 700),
    ));
    const root = fixture.nativeElement as HTMLElement;
    const canvas = canvasOf(fixture);
    expect(canvas.layerFlags()['constraints']?.visible).toBe(true);

    const eye = root.querySelector<HTMLButtonElement>(
      '.layer-panel__row[data-kind="constraints"] .layer-panel__visibility',
    );
    eye?.click();
    fixture.detectChanges();

    expect(canvas.layerFlags()['constraints']?.visible).toBe(false);
    expect(layerOf(fixture.componentInstance.doc(), 'constraints').visible).toBe(false);

    fixture.destroy();
  });

  it('cambiando l’opacità dal pannello il canvas riceve il nuovo valore', async () => {
    const fixture = await render(withContent(
      emptyMapDocument('Layer controls', null, 700, 700),
    ));
    const root = fixture.nativeElement as HTMLElement;
    const canvas = canvasOf(fixture);
    const range = opacityRange(root, 'graphics');

    range.value = '0.4';
    range.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(canvas.layerFlags()['graphics']?.opacity).toBeCloseTo(0.4, 5);

    fixture.destroy();
  });
});
