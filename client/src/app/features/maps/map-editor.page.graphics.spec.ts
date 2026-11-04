import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  isImageGraphic,
  type ImageGraphic,
  type Map,
  type MapDocument,
  type MapGraphic,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import {
  MAP_ID,
  asset,
  baseDocument,
  canvasOf,
  chooseFile,
  flush,
  g1,
  g2,
  g3,
  graphicItem,
  graphicsOf,
  orderedIds,
  rootOf,
  withGraphics,
  withLayerState,
  zValues,
} from './map-editor.page.graphics.test-helpers';
import { MapEditorPage } from './map-editor.page';

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-graphics',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  ...doc,
});

const asImage = (item: MapGraphic | undefined): ImageGraphic => {
  if (item === undefined || !isImageGraphic(item)) {
    throw new Error('Grafica immagine attesa');
  }
  return item;
};

describe('MapEditorPage grafiche', () => {
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
    getAsset.mockRejectedValue(new Error('asset non trovato'));
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { upload, get: getAsset } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        { provide: SrdCatalogService, useValue: { load: () => Promise.resolve(), catalog: () => null } },
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

  it('aggiunge la grafica al centro, la seleziona e la registra in history', async () => {
    const fixture = await render(withGraphics(baseDocument(), [graphicItem('existing', { z: 4 })]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    upload.mockResolvedValue(asset);

    await page.addGraphic(chooseFile());

    const items = graphicsOf(page.doc());
    expect(items).toHaveLength(2);
    const added = items.find((entry) => entry.id !== 'existing');
    expect(added).toMatchObject({
      kind: 'image',
      assetId: asset.id,
      x: 350,
      y: 350,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      z: 5,
    });
    expect(added?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(page.selected()).toEqual({ type: 'graphic', id: added?.id });
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(graphicsOf(page.doc()).map((entry) => entry.id)).toEqual(['existing']);
    page.redo();
    expect(graphicsOf(page.doc())).toHaveLength(2);

    fixture.destroy();
  });

  it('upload fallito non crea elementi, valorizza error e non tocca la history', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());
    upload.mockRejectedValue(new Error('upload non riuscito'));

    await page.addGraphic(chooseFile());

    expect(graphicsOf(page.doc())).toEqual([]);
    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);
    expect(page.error()).not.toBeNull();

    page.undo();
    expect(page.doc()).toEqual(before);

    fixture.destroy();
  });

  it('espone un input file multiplo per caricare più grafiche', async () => {
    const fixture = await render();
    fixture.componentInstance.setActiveLayer('graphics');
    fixture.detectChanges();

    const input = rootOf(fixture).querySelector<HTMLInputElement>('input[data-role="graphic"]');

    expect(input).not.toBeNull();
    expect(input?.multiple).toBe(true);

    fixture.destroy();
  });

  it('carica più file e crea una grafica per ciascuno con z crescenti e selezionabili', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    upload.mockResolvedValue(asset);

    await page.addGraphic(chooseFile(['uno.png', 'due.png']));

    expect(upload).toHaveBeenCalledTimes(2);
    expect(graphicsOf(page.doc())).toHaveLength(2);
    expect(zValues(page.doc())).toEqual([0, 1]);
    const ids = orderedIds(page.doc());
    for (const id of ids) {
      page.select({ type: 'graphic', id });
      expect(page.selectedGraphic()?.id).toBe(id);
    }

    fixture.destroy();
  });

  it('fallimento del secondo upload non aggiunge nulla e non lascia history parziale', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());
    upload
      .mockResolvedValueOnce(asset)
      .mockRejectedValueOnce(new Error('secondo upload fallito'));

    await page.addGraphic(chooseFile(['uno.png', 'due.png']));

    // Scelta documentata: l'upload di più file è atomico, nessuna grafica parziale.
    expect(graphicsOf(page.doc())).toEqual([]);
    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);
    expect(page.error()).not.toBeNull();
    page.undo();
    expect(page.doc()).toEqual(before);

    fixture.destroy();
  });

  it('nessun file selezionato è un no-op', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());

    await page.addGraphic(chooseFile([]));

    expect(upload).not.toHaveBeenCalled();
    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('un layer graphics bloccato blocca l’aggiunta e le trasformazioni', async () => {
    const doc = withLayerState(withGraphics(baseDocument(), [g1]), 'graphics', { locked: true });
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());
    upload.mockResolvedValue(asset);

    await page.addGraphic(chooseFile());
    page.select({ type: 'graphic', id: g1.id });
    page.updateGraphicField('x', 99);
    page.flipGraphic('h');
    page.moveGraphicZ('top');
    page.removeSelected();

    expect(upload).not.toHaveBeenCalled();
    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    // I flag del layer restano modificabili anche da bloccato.
    page.setLayerVisible('graphics', false);
    expect(page.doc()?.layers[1].visible).toBe(false);
    page.toggleLayerLock('graphics', false);
    expect(page.doc()?.layers[1].locked).toBe(false);

    fixture.destroy();
  });

  it('un layer graphics invisibile blocca aggiunta, trasformazioni e rimozione', async () => {
    const doc = withLayerState(withGraphics(baseDocument(), [g1, g2]), 'graphics', { visible: false });
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());
    upload.mockResolvedValue(asset);

    await page.addGraphic(chooseFile());
    expect(upload).not.toHaveBeenCalled();

    page.select({ type: 'graphic', id: g1.id });
    page.updateGraphicField('y', 150);
    page.flipGraphic('v');
    page.moveGraphicZ('bottom');
    page.removeSelected();

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('rimuove il graphic selezionato normalizzando z e ripristina con undo', async () => {
    const doc = withGraphics(baseDocument(), [g1, g2, g3]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    page.select({ type: 'graphic', id: g2.id });
    page.removeSelected();

    expect(orderedIds(page.doc())).toEqual(['g1', 'g3']);
    expect(zValues(page.doc())).toEqual([0, 1]);
    expect(page.selected()).toBeNull();
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(page.doc()).toEqual(doc);
    page.redo();
    expect(orderedIds(page.doc())).toEqual(['g1', 'g3']);

    fixture.destroy();
  });

  it('aggiorna x, y, scala, rotazione e opacità con undo e redo', async () => {
    const fixture = await render(withGraphics(baseDocument(), [g1]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: g1.id });

    page.updateGraphicField('x', 123.5);
    page.updateGraphicField('y', 42);
    page.updateGraphicField('scale', 2.5);
    page.updateGraphicField('rotation', 30);
    page.updateGraphicField('opacity', 0.4);

    expect(graphicsOf(page.doc())[0]).toMatchObject({
      x: 123.5,
      y: 42,
      scale: 2.5,
      rotation: 30,
      opacity: 0.4,
    });

    for (let index = 0; index < 5; index += 1) {
      page.undo();
    }
    expect(graphicsOf(page.doc())[0]).toEqual(g1);

    for (let index = 0; index < 5; index += 1) {
      page.redo();
    }
    expect(graphicsOf(page.doc())[0]).toMatchObject({ x: 123.5, y: 42, scale: 2.5 });

    fixture.destroy();
  });

  it('ignora valori fuori range e aggiornamenti invariati', async () => {
    const fixture = await render(withGraphics(baseDocument(), [g1]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: g1.id });
    const before = structuredClone(page.doc());

    page.updateGraphicField('x', asImage(g1).x);
    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    page.updateGraphicField('scale', 0);
    page.updateGraphicField('opacity', 2);
    page.updateGraphicField('opacity', -1);
    page.updateGraphicField('y', Number.NaN);

    const current = asImage(graphicsOf(page.doc())[0]);
    expect(current.scale).toBeGreaterThan(0);
    expect(current.opacity).toBeGreaterThanOrEqual(0);
    expect(current.opacity).toBeLessThanOrEqual(1);
    expect(current.y).toBe(asImage(g1).y);

    fixture.destroy();
  });

  it('flip orizzontale e verticale passano dalla history', async () => {
    const fixture = await render(withGraphics(baseDocument(), [g1]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    page.select({ type: 'graphic', id: g1.id });

    page.flipGraphic('h');
    expect(graphicsOf(page.doc())[0]).toMatchObject({ flipH: true, flipV: false });

    page.flipGraphic('v');
    expect(graphicsOf(page.doc())[0]).toMatchObject({ flipH: true, flipV: true });

    page.undo();
    expect(graphicsOf(page.doc())[0]).toMatchObject({ flipH: true, flipV: false });
    page.undo();
    expect(graphicsOf(page.doc())[0]).toMatchObject({ flipH: false, flipV: false });

    fixture.destroy();
  });

  it('moveGraphicZ porta in cima e in fondo con undo completo', async () => {
    const doc = withGraphics(baseDocument(), [g1, g2, g3]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');

    page.select({ type: 'graphic', id: g1.id });
    page.moveGraphicZ('top');
    expect(orderedIds(page.doc())).toEqual(['g2', 'g3', 'g1']);
    expect(zValues(page.doc())).toEqual([0, 1, 2]);

    page.undo();
    expect(page.doc()).toEqual(doc);

    page.select({ type: 'graphic', id: g3.id });
    page.moveGraphicZ('bottom');
    expect(orderedIds(page.doc())).toEqual(['g3', 'g1', 'g2']);

    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  it('moveGraphicZ senza selezione è un no-op', async () => {
    const fixture = await render(withGraphics(baseDocument(), [g1, g2]));
    const page = fixture.componentInstance;
    page.setActiveLayer('graphics');
    const before = structuredClone(page.doc());

    page.moveGraphicZ('up');
    page.moveGraphicZ('top');

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('risolve le immagini delle grafiche dal layer con url e dimensioni', async () => {
    getAsset.mockResolvedValue(asset);
    const fixture = await render(withGraphics(baseDocument(), [g1]));
    await flush(fixture);
    const page = fixture.componentInstance;

    expect(page.graphics()).toEqual([{
      item: g1,
      image: { url: asset.url, width: asset.width, height: asset.height },
    }]);
    expect(canvasOf(fixture).graphics()).toEqual(page.graphics());

    fixture.destroy();
  });

  it('un asset mancante lascia image a null senza crash', async () => {
    const fixture = await render(withGraphics(baseDocument(), [g1, g2]));
    await flush(fixture);
    const page = fixture.componentInstance;

    expect(page.graphics().map((entry) => entry.image)).toEqual([null, null]);
    expect(() => fixture.detectChanges()).not.toThrow();

    fixture.destroy();
  });

  it('salva le grafiche del layer nel documento', async () => {
    const doc = withGraphics(baseDocument(), [g1, g2]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;

    await page.save();

    const saved = saveMap.mock.calls[0]?.[2] as MapDocument;
    expect(saved.layers[1].items).toEqual([g1, g2]);

    fixture.destroy();
  });
});
