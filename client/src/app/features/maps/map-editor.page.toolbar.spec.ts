import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import { emptyMapDocument, type Asset, type Map, type MapLayerKind } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';

const MAP_ID = 'map-toolbar';

const uploadedAsset: Asset = {
  id: 'c0ffee00-0000-4000-8000-0000000000a1',
  hash: 'b'.repeat(64),
  mime: 'image/png',
  bytes: 2048,
  width: 200,
  height: 100,
  url: '/uploads/graphic.png',
  previewUrl: '/uploads/graphic-preview.png',
  thumbUrl: '/uploads/graphic-thumb.png',
  createdAt: '2026-11-04T00:00:00.000Z',
};

/** Attende le risoluzioni asincrone degli asset e allinea gli effect signal. */
const flush = async (fixture: ComponentFixture<MapEditorPage>): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
  TestBed.tick();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

/** Strumenti visibili per layer, nell'ordine della toolbar; la griglia è sempre in coda. */
const LAYER_TOOLS: Record<MapLayerKind, readonly (string | RegExp)[]> = {
  background: ['Seleziona'],
  graphics: ['Seleziona'],
  constraints: [
    'Seleziona',
    'Muro',
    'Tratto',
    'Porta',
    'Finestra',
    'Muro basso',
    'Gomma',
    'Area rettangolo',
    'Area poligono',
  ],
  elements: ['Seleziona', 'Luce', 'Mostro', 'Partenza', /Oggetti|Loot/],
};

const LAYER_KINDS: readonly MapLayerKind[] = [
  'background',
  'graphics',
  'constraints',
  'elements',
];

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

const toolNames = (page: MapEditorPage): string[] => {
  const names: string[] = [];
  for (const entry of page.tools()) {
    names.push(entry.tool);
  }
  return names;
};

/** Mappa con i layer indicati bloccati: la toolbar deve restare in sola lettura. */
const mapWithLocked = (kinds: readonly MapLayerKind[]): Map => {
  const map = mapFor(MAP_ID, 'campaign-toolbar');
  return {
    ...map,
    layers: map.layers.map((layer) =>
      kinds.includes(layer.kind) ? { ...layer, locked: true } : layer,
    ) as Map['layers'],
  };
};

describe('MapEditorPage toolbar', () => {
  const getMap = vi.fn();
  const upload = vi.fn();

  const rootOf = (fixture: ComponentFixture<MapEditorPage>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const toolButtons = (fixture: ComponentFixture<MapEditorPage>): HTMLButtonElement[] =>
    Array.from(rootOf(fixture).querySelectorAll<HTMLButtonElement>('.editor__tool'));

  const toolButtonAt = (fixture: ComponentFixture<MapEditorPage>, index: number): HTMLButtonElement => {
    const button = toolButtons(fixture)[index];
    if (button === undefined) {
      throw new Error(`bottone strumento ${index} assente`);
    }
    return button;
  };

  const iconsOf = (fixture: ComponentFixture<MapEditorPage>): HTMLElement[] =>
    Array.from(rootOf(fixture).querySelectorAll<HTMLElement>('.editor__tool-icon'));

  const iconText = (container: HTMLElement): string =>
    container.querySelector('.editor__tool-icon')?.textContent?.trim() ?? '';

  const render = async (
    layer: MapLayerKind = 'background',
    map: Map = mapFor(MAP_ID, 'campaign-toolbar'),
  ): Promise<ComponentFixture<MapEditorPage>> => {
    getMap.mockResolvedValue(map);
    const fixture = TestBed.createComponent(MapEditorPage);
    fixture.componentRef.setInput('mapId', MAP_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.setActiveLayer(layer);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    getMap.mockReset();
    getMap.mockResolvedValue(mapFor(MAP_ID, 'campaign-toolbar'));
    upload.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap } },
        { provide: AssetService, useValue: { upload, get: vi.fn() } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        {
          provide: SrdCatalogService,
          useValue: { load: () => Promise.resolve(), catalog: () => null },
        },
        { provide: Router, useValue: {} },
      ],
    });
  });

  it('mostra gli strumenti del layer attivo e la griglia in coda', async () => {
    for (const kind of LAYER_KINDS) {
      const fixture = await render(kind);
      const expected = [...LAYER_TOOLS[kind], 'Griglia'];
      const texts = toolButtons(fixture).map((button) => button.textContent ?? '');

      expect(texts).toHaveLength(expected.length);
      expected.forEach((label, index) => {
        if (label instanceof RegExp) {
          expect(texts[index] ?? '').toMatch(label);
        } else {
          expect(texts[index] ?? '').toContain(label);
        }
      });

      fixture.destroy();
    }
  });

  it('mostra un’icona decorativa accanto a ogni strumento', async () => {
    const fixture = await render('constraints');
    const icons = iconsOf(fixture);

    expect(toolButtons(fixture)).toHaveLength(LAYER_TOOLS.constraints.length + 1);
    expect(icons).toHaveLength(LAYER_TOOLS.constraints.length + 1);
    for (const icon of icons) {
      expect(icon.textContent?.trim()).not.toBe('');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }

    fixture.destroy();
  });

  it('usa un’icona diversa per ogni strumento del layer', async () => {
    const fixture = await render('constraints');
    const icons = iconsOf(fixture).map((icon) => icon.textContent?.trim() ?? '');

    expect(new Set(icons).size).toBe(icons.length);

    fixture.destroy();
  });

  it('attiva lo strumento al click mantenendo l’icona', async () => {
    const fixture = await render('constraints');
    const page = fixture.componentInstance;
    const wallIndex = toolNames(page).indexOf('wall');
    const wallTool = toolButtonAt(fixture, wallIndex);
    const iconBefore = iconText(wallTool);

    expect(iconBefore).not.toBe('');
    wallTool.click();
    fixture.detectChanges();

    expect(page.tool()).toBe('wall');
    expect(wallTool.classList.contains('is-active')).toBe(true);
    expect(iconText(wallTool)).toBe(iconBefore);

    fixture.destroy();
  });

  it('espone i nove strumenti constraints con i label delle aree', async () => {
    const fixture = await render('constraints');
    const page = fixture.componentInstance;
    const texts = toolButtons(fixture).map((button) => button.textContent ?? '');

    expect(toolNames(page)).toEqual([
      'select',
      'wall',
      'freehand',
      'door',
      'window',
      'lowWall',
      'eraser',
      'areaRect',
      'areaPolygon',
    ]);
    expect(texts).toHaveLength(10);
    expect(texts[7]).toContain('Area rettangolo');
    expect(texts[8]).toContain('Area poligono');

    fixture.destroy();
  });

  it('attiva solo strumenti pertinenti al layer attivo', async () => {
    const fixture = await render('elements');
    const page = fixture.componentInstance;
    const wallTool = toolButtons(fixture).find((button) => button.textContent?.includes('Muro'));

    expect(wallTool).toBeUndefined();
    expect(toolNames(page)).toEqual(['select', 'light', 'spawn', 'start', 'loot']);

    fixture.destroy();
  });

  it('espone cinque strumenti elements con label e icona dedicata al loot', async () => {
    const fixture = await render('elements');
    const page = fixture.componentInstance;
    const texts = toolButtons(fixture).map((button) => button.textContent ?? '');
    const icons = iconsOf(fixture).map((icon) => icon.textContent?.trim() ?? '');

    expect(toolNames(page)).toEqual(['select', 'light', 'spawn', 'start', 'loot']);
    expect(texts).toHaveLength(6);
    expect(texts[4]).toMatch(/Oggetti|Loot/);
    expect(new Set(icons).size).toBe(icons.length);

    fixture.destroy();
  });

  it('la griglia resta un toggle con icona', async () => {
    const fixture = await render('background');
    const page = fixture.componentInstance;
    const grid = toolButtonAt(fixture, LAYER_TOOLS.background.length);
    const initial = page.showGrid();

    expect(iconText(grid)).not.toBe('');

    grid.click();
    fixture.detectChanges();
    expect(page.showGrid()).toBe(!initial);

    grid.click();
    fixture.detectChanges();
    expect(page.showGrid()).toBe(initial);
    expect(iconText(grid)).not.toBe('');

    fixture.destroy();
  });

  it('espone su layer graphics il bottone Aggiungi immagine e l’input file nascosto', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    expect(rootOf(fixture).querySelector('.editor__add-graphic')).toBeNull();

    page.setActiveLayer('graphics');
    fixture.detectChanges();
    const root = rootOf(fixture);
    const button = root.querySelector<HTMLButtonElement>('.editor__add-graphic');
    const input = root.querySelector<HTMLInputElement>('input[type="file"][data-role="graphic"]');

    expect(button).not.toBeNull();
    const name = button?.getAttribute('aria-label') ?? button?.textContent?.trim() ?? '';
    expect(name).toContain('Aggiungi immagine');
    expect(input).not.toBeNull();
    expect(input?.accept).toContain('image');
    // Il bottone non altera il conteggio degli strumenti della toolbar.
    expect(root.querySelectorAll('.editor__tool')).toHaveLength(page.tools().length + 1);

    fixture.destroy();
  });

  it('il change dell’input file aggiunge la grafica', async () => {
    const fixture = await render('graphics');
    const page = fixture.componentInstance;
    upload.mockResolvedValue(uploadedAsset);
    const input = rootOf(fixture)
      .querySelector<HTMLInputElement>('input[type="file"][data-role="graphic"]');
    if (input === null) {
      throw new Error('input file grafica assente');
    }
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'decor.png', { type: 'image/png' })],
    });

    input.dispatchEvent(new Event('change'));
    await flush(fixture);

    expect(page.doc()?.layers[1].items).toHaveLength(1);
    expect(page.selected()?.type).toBe('graphic');

    fixture.destroy();
  });

  it('con il layer constraints bloccato disabilita solo gli strumenti non-select', async () => {
    const fixture = await render('constraints', mapWithLocked(['constraints']));
    const page = fixture.componentInstance;
    const buttons = toolButtons(fixture).slice(0, page.tools().length);
    const selectIndex = toolNames(page).indexOf('select');

    expect(page.activeLayerLocked()).toBe(true);
    expect(buttons).toHaveLength(LAYER_TOOLS.constraints.length);
    expect(buttons[selectIndex]?.disabled).toBe(false);
    expect(buttons[selectIndex]?.getAttribute('aria-disabled')).toBeNull();

    buttons.forEach((button, index) => {
      if (index === selectIndex) {
        return;
      }
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-disabled')).toBe('true');
    });

    // La griglia è un toggle globale e resta disponibile.
    expect(toolButtonAt(fixture, page.tools().length).disabled).toBe(false);

    fixture.destroy();
  });

  it('un click su uno strumento disabilitato non cambia tool', async () => {
    const fixture = await render('constraints', mapWithLocked(['constraints']));
    const page = fixture.componentInstance;
    const wall = toolButtonAt(fixture, toolNames(page).indexOf('wall'));
    const select = toolButtonAt(fixture, toolNames(page).indexOf('select'));

    expect(page.tool()).toBe('select');

    // Click dell'utente: il bottone disabled non attiva nulla.
    wall.click();
    fixture.detectChanges();
    expect(page.tool()).toBe('select');

    // Anche un evento sintetico non deve bypassare il lock del layer.
    wall.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(page.tool()).toBe('select');

    // `select` resta l'unico strumento attivabile anche col layer bloccato.
    select.click();
    fixture.detectChanges();
    expect(page.tool()).toBe('select');

    fixture.destroy();
  });

  it('dopo undo del lock i bottoni tornano abilitati', async () => {
    const fixture = await render('constraints');
    const page = fixture.componentInstance;
    const wallIndex = toolNames(page).indexOf('wall');

    expect(toolButtonAt(fixture, wallIndex).disabled).toBe(false);

    page.toggleLayerLock('constraints', true);
    fixture.detectChanges();
    expect(page.activeLayerLocked()).toBe(true);
    const lockedWall = toolButtonAt(fixture, wallIndex);
    expect(lockedWall.disabled).toBe(true);
    expect(lockedWall.getAttribute('aria-disabled')).toBe('true');

    page.undo();
    fixture.detectChanges();
    expect(page.activeLayerLocked()).toBe(false);
    const unlockedWall = toolButtonAt(fixture, wallIndex);
    expect(unlockedWall.disabled).toBe(false);
    expect(unlockedWall.getAttribute('aria-disabled')).toBeNull();

    fixture.destroy();
  });
});
