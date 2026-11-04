import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { emptyMapDocument, type Map, type MapLayerKind } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const MAP_ID = 'map-graphics-toolbar';

const baseMap = (): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-graphics-toolbar',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  ...emptyMapDocument('Mappa', null, 700, 700),
});

interface ToolPage {
  setTool(tool: string): void;
}

const toolsOf = (page: MapEditorPage): ToolPage => page;

const toolNames = (page: MapEditorPage): string[] => page.tools().map((entry) => entry.tool);

const theTools = (fixture: ComponentFixture<MapEditorPage>): HTMLButtonElement[] =>
  Array.from(
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLButtonElement>('.editor__tool'),
  );

describe('MapEditorPage toolbar graphics', () => {
  const getMap = vi.fn();

  beforeEach(() => {
    getMap.mockReset();
    getMap.mockResolvedValue(baseMap());
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap } },
        { provide: AssetService, useValue: { upload: vi.fn(), get: vi.fn() } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        { provide: SrdCatalogService, useValue: { load: () => Promise.resolve(), catalog: () => null } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  const render = async (kind: MapLayerKind = 'graphics'): Promise<ComponentFixture<MapEditorPage>> => {
    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', MAP_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setActiveLayer(kind);
    fixture.detectChanges();
    return fixture;
  };

  it('espone Poligono e Testo come tool e l’immagine dal bottone dedicato', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const names = toolNames(fixture.componentInstance);

    expect(names).toEqual(['select', 'graphicPolygon', 'graphicText']);
    expect(names).not.toContain('graphicImage');
    expect(theTools(fixture)).toHaveLength(4);
    const labels = theTools(fixture).map((button) => button.textContent ?? '').join(' ');
    expect(labels).toContain('Poligono');
    expect(labels).toContain('Testo');
    expect(labels).not.toContain('Immagine');
    expect(labels).toContain('Griglia');

    const imageButton = root.querySelector<HTMLButtonElement>('.editor__add-graphic');
    expect(imageButton).not.toBeNull();
    expect(imageButton?.getAttribute('aria-label') ?? imageButton?.textContent ?? '')
      .toContain('Aggiungi immagine');
    expect(root.querySelectorAll('input[type="file"][data-role="graphic"]')).toHaveLength(1);
    expect(root.querySelectorAll('.editor__tools input[type="file"]')).toHaveLength(1);

    fixture.destroy();
  });

  it('attiva gli strumenti poligono e testo con un click', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const polygonButton = theTools(fixture).find((button) =>
      (button.textContent ?? '').includes('Poligono'));
    const textButton = theTools(fixture).find((button) =>
      (button.textContent ?? '').includes('Testo'));

    expect(polygonButton).not.toBeUndefined();
    expect(textButton).not.toBeUndefined();

    polygonButton?.click();
    fixture.detectChanges();
    expect(page.tool()).toBe('graphicPolygon');

    textButton?.click();
    fixture.detectChanges();
    expect(page.tool()).toBe('graphicText');

    fixture.destroy();
  });

  it('setTool accetta i tool graphics quando il layer è sbloccato', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    toolsOf(page).setTool('graphicPolygon');
    expect(page.tool()).toBe('graphicPolygon');

    toolsOf(page).setTool('graphicText');
    expect(page.tool()).toBe('graphicText');

    fixture.destroy();
  });

  it('setTool rifiuta i tool graphics quando il layer è bloccato', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.toggleLayerLock('graphics', true);
    fixture.detectChanges();

    toolsOf(page).setTool('graphicPolygon');
    expect(page.tool()).toBe('select');
    toolsOf(page).setTool('graphicText');
    expect(page.tool()).toBe('select');

    for (const button of theTools(fixture)) {
      const isSelect = (button.textContent ?? '').trim().startsWith('Seleziona');
      const isGrid = (button.textContent ?? '').trim().startsWith('Griglia');
      if (isSelect || isGrid) {
        expect(button.disabled, button.textContent ?? '').toBe(false);
        continue;
      }
      expect(button.disabled, button.textContent ?? '').toBe(true);
    }

    fixture.destroy();
  });

  it('dopo lo sblocco i tool graphics tornano attivabili', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.toggleLayerLock('graphics', true);
    toolsOf(page).setTool('graphicText');
    expect(page.tool()).toBe('select');

    page.toggleLayerLock('graphics', false);
    toolsOf(page).setTool('graphicText');
    expect(page.tool()).toBe('graphicText');

    fixture.destroy();
  });

  it('non espone i tool graphics su altri layer', async () => {
    const fixture = await render('elements');
    const page = fixture.componentInstance;

    expect(toolNames(page)).not.toContain('graphicPolygon');
    expect(toolNames(page)).not.toContain('graphicText');
    toolsOf(page).setTool('graphicPolygon');
    expect(page.tool()).toBe('select');

    fixture.destroy();
  });

  it('usa un’icona distinta per ogni tool graphics e per la griglia', async () => {
    const fixture = await render();
    const names = toolNames(fixture.componentInstance);
    const icons = theTools(fixture)
      .map((button) => button.querySelector('.editor__tool-icon')?.textContent?.trim() ?? '')
      .filter((icon) => icon !== '');

    expect(names).toHaveLength(3);
    expect(icons).toHaveLength(names.length + 1);
    expect(new Set(icons).size).toBe(icons.length);

    fixture.destroy();
  });
});
