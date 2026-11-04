import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { emptyMapDocument, type Map, type MapDocument } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const MAP_ID = 'map-layers-accordion';

const toMap = (doc: MapDocument): Map => ({
  id: MAP_ID,
  campaignId: 'campaign-layers-accordion',
  imageAssetId: null,
  thumbAssetId: null,
  compositeAssetId: null,
  version: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  ...doc,
});

const baseDocument = (): MapDocument => emptyMapDocument('Livelli', null, 700, 700);

const rootOf = (fixture: ComponentFixture<MapEditorPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const inspectorOf = (fixture: ComponentFixture<MapEditorPage>): HTMLElement => {
  const inspector = rootOf(fixture).querySelector<HTMLElement>('aside.editor__inspector');
  if (inspector === null) {
    throw new Error('inspector assente');
  }
  return inspector;
};

const layersSection = (inspector: HTMLElement): HTMLElement => {
  const section = inspector.querySelector<HTMLElement>('app-sidebar-section#map-layers');
  if (section === null) {
    throw new Error('sezione Livelli assente dall’inspector');
  }
  return section;
};

const triggerOf = (section: HTMLElement): HTMLButtonElement => {
  const trigger = section.querySelector<HTMLButtonElement>('.accordion__trigger');
  if (trigger === null) {
    throw new Error('trigger della sezione assente');
  }
  return trigger;
};

const bodyOf = (section: HTMLElement): HTMLElement | null =>
  section.querySelector<HTMLElement>('#sidebar-map-layers');

const sectionLabels = (inspector: HTMLElement): string[] =>
  Array.from(inspector.querySelectorAll<HTMLElement>('app-sidebar-section')).map(
    (section) => section.querySelector('.accordion__label')?.textContent?.trim() ?? '',
  );

const layerRows = (container: HTMLElement): number =>
  container.querySelectorAll('.layer-panel__row').length;

/**
 * Stato aperto/chiuso di una sezione. La lettura è tipizzata come mappa generica
 * così il rosso arriva dal comportamento (sezione assente) e non dalla compilazione.
 */
const sectionOpen = (page: MapEditorPage, section: string): boolean =>
  (page.sections() as unknown as Record<string, boolean>)[section] === true;

describe('MapEditorPage layers accordion', () => {
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

  const render = async (): Promise<ComponentFixture<MapEditorPage>> => {
    getMap.mockResolvedValue(toMap(baseDocument()));
    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', MAP_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };

  it('annida il pannello layer nella sezione Livelli dell’inspector', async () => {
    const fixture = await render();
    const inspector = inspectorOf(fixture);
    const section = layersSection(inspector);

    expect(inspector.contains(section)).toBe(true);
    expect(section.querySelector('.accordion__label')?.textContent?.trim()).toBe('Livelli');
    expect(section.querySelector('app-map-layer-panel')).not.toBeNull();

    fixture.destroy();
  });

  it('apre i Livelli di default con body e pannello', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const section = layersSection(inspectorOf(fixture));
    const trigger = triggerOf(section);
    const body = bodyOf(section);

    expect(sectionOpen(page, 'layers')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('sidebar-map-layers');
    expect(body).not.toBeNull();
    expect(body?.querySelector('app-map-layer-panel')).not.toBeNull();
    expect(body === null ? 0 : layerRows(body)).toBe(4);

    fixture.destroy();
  });

  it('chiude e riapre i Livelli dal trigger', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const inspector = inspectorOf(fixture);

    triggerOf(layersSection(inspector)).click();
    fixture.detectChanges();

    expect(triggerOf(layersSection(inspector)).getAttribute('aria-expanded')).toBe('false');
    expect(sectionOpen(page, 'layers')).toBe(false);
    expect(inspector.querySelector('#sidebar-map-layers')).toBeNull();
    expect(inspector.querySelector('app-map-layer-panel')).toBeNull();

    triggerOf(layersSection(inspector)).click();
    fixture.detectChanges();

    const reopened = layersSection(inspector);
    const body = bodyOf(reopened);
    expect(triggerOf(reopened).getAttribute('aria-expanded')).toBe('true');
    expect(sectionOpen(page, 'layers')).toBe(true);
    expect(body).not.toBeNull();
    expect(body?.querySelector('app-map-layer-panel')).not.toBeNull();
    expect(body === null ? 0 : layerRows(body)).toBe(4);

    fixture.destroy();
  });

  it('mantiene i Livelli come primo accordion, prima di Mappa', async () => {
    const fixture = await render();
    const inspector = inspectorOf(fixture);
    const labels = sectionLabels(inspector);
    const triggers = Array.from(
      inspector.querySelectorAll<HTMLButtonElement>('.accordion__trigger'),
    );

    expect(labels[0]).toBe('Livelli');
    expect(triggers[0]?.textContent).toContain('Livelli');

    const layersIndex = labels.indexOf('Livelli');
    const propertiesIndex = labels.indexOf('Mappa');
    expect(propertiesIndex).toBeGreaterThan(-1);
    expect(layersIndex).toBeLessThan(propertiesIndex);

    fixture.destroy();
  });
});
