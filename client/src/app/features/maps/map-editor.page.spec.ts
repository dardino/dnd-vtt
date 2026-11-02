import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  defaultBackgroundTransform,
  emptyMapDocument,
  type Asset,
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

describe('MapEditorPage history', () => {
  const upload = vi.fn();
  const get = vi.fn();

  beforeEach(() => {
    upload.mockReset();
    get.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: {} },
        { provide: AssetService, useValue: { upload, get } },
        { provide: ActorService, useValue: {} },
        { provide: SrdCatalogService, useValue: {} },
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
});
