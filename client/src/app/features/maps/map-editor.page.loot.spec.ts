import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import type { MapDocument, SrdCatalog } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorCanvasComponent } from './map-editor-canvas.component';
import { MapEditorPage } from './map-editor.page';
import {
  area,
  baseDocument,
  buttonIn,
  catalogItems,
  elementsOf,
  idsOf,
  light,
  lootA,
  lootB,
  lootDialog,
  lootOf,
  lootSection,
  MAP_ID,
  potion,
  rootOf,
  rope,
  spawn,
  start,
  toMap,
  wall,
  withItems,
  withLocked,
} from './map-editor.page.loot.test-helpers';

const canvasOf = (fixture: ComponentFixture<MapEditorPage>): MapEditorCanvasComponent => {
  const debug = fixture.debugElement.query(By.directive(MapEditorCanvasComponent));
  if (debug === null) {
    throw new Error('canvas dell’editor assente');
  }
  return debug.componentInstance as MapEditorCanvasComponent;
};

/** jsdom non implementa il comportamento modale di `<dialog>`. */
const installDialogPolyfill = (): void => {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
};

/** Campo di un inspector identificato dalla sua etichetta visibile. */
const fieldNamed = (root: HTMLElement, name: string): HTMLInputElement => {
  const label = Array.from(root.querySelectorAll('label')).find((entry) =>
    (entry.textContent ?? '').includes(name),
  );
  const control = label?.querySelector<HTMLInputElement>('input');
  if (control === undefined || control === null) {
    throw new Error(`campo ${name} assente`);
  }
  return control;
};

/** Componente montato e stato del `<dialog>` nativo, senza optional chaining. */
const lootDialogState = (fixture: ComponentFixture<MapEditorPage>) => {
  const dialog = lootDialog(fixture);
  const native = rootOf(fixture).querySelector<HTMLDialogElement>('app-map-loot-dialog dialog');
  return {
    component: dialog !== null,
    open: dialog?.open() ?? false,
    nativeOpen: native?.open ?? false,
  };
};

describe('MapEditorPage loot', () => {
  const getMap = vi.fn();
  const saveMap = vi.fn();

  beforeEach(() => {
    installDialogPolyfill();
    getMap.mockReset();
    saveMap.mockReset();
    saveMap.mockResolvedValue({ version: 2 });
    catalogItems.set([potion, rope]);
    TestBed.configureTestingModule({
      providers: [
        { provide: MapService, useValue: { get: getMap, save: saveMap } },
        { provide: AssetService, useValue: { upload: vi.fn(), get: vi.fn() } },
        { provide: ActorService, useValue: { listByCampaign: vi.fn().mockResolvedValue([]) } },
        {
          provide: SrdCatalogService,
          useValue: {
            items: catalogItems,
            loading: () => false,
            error: () => null,
            load: () => Promise.resolve(),
            catalog: () => ({
              items: catalogItems(),
              monsters: [],
            }) as unknown as SrdCatalog,
          },
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

  it('requestLoot apre il dialog e confirmLoot inserisce e seleziona il loot nella cella', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    page.requestLoot({ x: 2, y: 3 });
    fixture.detectChanges();
    expect(lootDialogState(fixture)).toEqual({ component: true, open: true, nativeOpen: true });

    page.confirmLoot({ itemId: 'potion-of-healing', quantity: 2, visible: true });
    fixture.detectChanges();

    const loots = lootOf(page.doc());
    expect(loots).toHaveLength(1);
    expect(loots[0]).toMatchObject({
      type: 'loot',
      itemId: 'potion-of-healing',
      x: 2,
      y: 3,
      quantity: 2,
      visible: true,
    });
    expect(loots[0]?.id).not.toBe('');
    expect(page.selected()).toEqual({ type: 'loot', id: loots[0]?.id });
    expect(page.dirty()).toBe(true);
    expect(lootDialogState(fixture)).toEqual({ component: false, open: false, nativeOpen: false });

    fixture.destroy();
  });

  it('collega l’output confirmed del dialog a confirmLoot', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');

    page.requestLoot({ x: 4, y: 5 });
    fixture.detectChanges();
    lootDialog(fixture)?.confirmed.emit({ itemId: 'rope', quantity: 3, visible: false });
    fixture.detectChanges();

    expect(lootOf(page.doc())).toEqual([
      expect.objectContaining({
        type: 'loot',
        itemId: 'rope',
        x: 4,
        y: 5,
        quantity: 3,
        visible: false,
      }),
    ]);
    expect(page.selected()?.type).toBe('loot');

    fixture.destroy();
  });

  it('collega lootRequested del canvas a requestLoot', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;

    canvasOf(fixture).lootRequested.emit({ x: 5, y: 6 });
    fixture.detectChanges();

    expect(lootDialogState(fixture)).toEqual({ component: true, open: true, nativeOpen: true });

    page.confirmLoot({ itemId: 'rope', quantity: 2, visible: true });
    fixture.detectChanges();

    expect(lootOf(page.doc())).toEqual([
      expect.objectContaining({
        type: 'loot',
        itemId: 'rope',
        x: 5,
        y: 6,
        quantity: 2,
        visible: true,
      }),
    ]);
    expect(page.dirty()).toBe(true);

    fixture.destroy();
  });

  it('annullare il dialog non modifica il documento', async () => {
    const fixture = await render(withItems(baseDocument(), [], [lootA]));
    const page = fixture.componentInstance;
    const before = structuredClone(page.doc());

    page.requestLoot({ x: 6, y: 6 });
    fixture.detectChanges();
    lootDialog(fixture)?.closed.emit();
    fixture.detectChanges();

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);
    expect(lootDialogState(fixture)).toEqual({ component: false, open: false, nativeOpen: false });

    fixture.destroy();
  });

  it('confirmLoot senza una cella richiesta è un no-op', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    const before = structuredClone(page.doc());

    page.confirmLoot({ itemId: 'potion-of-healing', quantity: 1, visible: true });

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('updateLootField aggiorna quantità e visibilità con undo e redo', async () => {
    const fixture = await render(withItems(baseDocument(), [], [lootA, light]));
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'loot', id: lootA.id });

    page.updateLootField('quantity', 7);
    expect(lootOf(page.doc())[0]?.quantity).toBe(7);

    page.updateLootField('visible', true);
    expect(lootOf(page.doc())[0]?.visible).toBe(true);
    expect(elementsOf(page.doc()).filter((item) => item.type === 'light')).toEqual([light]);
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(lootOf(page.doc())[0]?.visible).toBe(false);
    expect(lootOf(page.doc())[0]?.quantity).toBe(7);
    page.undo();
    expect(lootOf(page.doc())[0]?.quantity).toBe(4);
    page.redo();
    expect(lootOf(page.doc())[0]?.quantity).toBe(7);

    fixture.destroy();
  });

  it('updateLootField ignora quantità fuori scala o non intere', async () => {
    const fixture = await render(withItems(baseDocument(), [], [lootA]));
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'loot', id: lootA.id });
    const before = structuredClone(page.doc());

    page.updateLootField('quantity', 0);
    page.updateLootField('quantity', 1000);
    page.updateLootField('quantity', 2.5);

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);

    fixture.destroy();
  });

  it('removeSelected rimuove il loot selezionato e lo ripristina con undo', async () => {
    const doc = withItems(baseDocument(), [], [light, lootA, lootB, start]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'loot', id: lootA.id });

    page.removeSelected();

    expect(lootOf(page.doc()).map((item) => item.id)).toEqual([lootB.id]);
    expect(elementsOf(page.doc()).filter((item) => item.type === 'light')).toEqual([light]);
    expect(page.selected()).toBeNull();
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(page.doc()).toEqual(doc);
    page.redo();
    expect(idsOf(page.doc())).toEqual(['light-1', 'loot-2', 'start-1']);

    fixture.destroy();
  });

  it('il layer elements bloccato blocca request, confirm, update e remove', async () => {
    const doc = withLocked(withItems(baseDocument(), [], [light, lootA]), ['elements']);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    expect(page.activeLayerLocked()).toBe(false);
    const before = structuredClone(page.doc());

    page.requestLoot({ x: 6, y: 6 });
    page.confirmLoot({ itemId: 'rope', quantity: 1, visible: true });
    page.select({ type: 'loot', id: lootA.id });
    page.updateLootField('quantity', 9);
    page.removeSelected();

    expect(page.doc()).toEqual(before);
    expect(page.dirty()).toBe(false);
    expect(lootDialogState(fixture)).toEqual({ component: false, open: false, nativeOpen: false });

    fixture.destroy();
  });

  it('con layer constraints l’inspector mostra solo muro e area', async () => {
    const doc = withItems(baseDocument(), [wall, area], [light, spawn, start, lootA]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('constraints');
    fixture.detectChanges();

    page.select({ type: 'wall', id: wall.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-wall')).not.toBeNull();
    expect(rootOf(fixture).querySelector('#map-light')).toBeNull();
    expect(rootOf(fixture).querySelector('#map-spawn')).toBeNull();
    expect(rootOf(fixture).querySelector('#map-start')).toBeNull();
    expect(lootSection(fixture)).toBeNull();

    page.select({ type: 'area', id: area.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('app-map-area-inspector')).not.toBeNull();
    expect(rootOf(fixture).querySelector('#map-wall')).toBeNull();

    fixture.destroy();
  });

  it('con layer elements l’inspector mostra solo luce, spawn, partenza e loot', async () => {
    const doc = withItems(baseDocument(), [wall, area], [light, spawn, start, lootA]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    fixture.detectChanges();

    page.select({ type: 'light', id: light.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-light')).not.toBeNull();
    expect(rootOf(fixture).querySelector('#map-wall')).toBeNull();

    page.select({ type: 'spawn', id: spawn.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-spawn')).not.toBeNull();
    expect(rootOf(fixture).querySelector('#map-light')).toBeNull();

    page.select({ type: 'start', id: start.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-start')).not.toBeNull();

    page.select({ type: 'loot', id: lootA.id });
    fixture.detectChanges();
    expect(lootSection(fixture)).not.toBeNull();
    expect(rootOf(fixture).querySelector('#map-start')).toBeNull();

    fixture.destroy();
  });

  it('selezionare un elemento di un altro layer non mostra la sua sezione', async () => {
    const doc = withItems(baseDocument(), [wall, area], [light, spawn, start, lootA]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;

    page.setActiveLayer('constraints');
    page.select({ type: 'light', id: light.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-light')).toBeNull();
    expect(lootSection(fixture)).toBeNull();

    page.setActiveLayer('elements');
    page.select({ type: 'wall', id: wall.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-wall')).toBeNull();

    page.select({ type: 'area', id: area.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('app-map-area-inspector')).toBeNull();

    fixture.destroy();
  });

  it('con layer background e graphics le sezioni elemento non compaiono', async () => {
    const doc = withItems(baseDocument(), [wall], [light, lootA]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;

    page.select({ type: 'light', id: light.id });
    fixture.detectChanges();
    expect(rootOf(fixture).querySelector('#map-light')).toBeNull();

    page.setActiveLayer('graphics');
    page.select({ type: 'loot', id: lootA.id });
    fixture.detectChanges();
    expect(lootSection(fixture)).toBeNull();

    fixture.destroy();
  });

  it('l’inspector loot mostra nome risolto, quantità, posizione e visibilità', async () => {
    const fixture = await render(withItems(baseDocument(), [], [lootA]));
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'loot', id: lootA.id });
    fixture.detectChanges();

    const section = lootSection(fixture);
    expect(section).not.toBeNull();
    if (section === null) {
      throw new Error('sezione loot assente');
    }

    const text = section.textContent ?? '';
    expect(text).toContain('Pozione di guarigione');
    expect(text).not.toContain('potion-of-healing');
    expect(text).toContain('Quantità');

    const quantity = fieldNamed(section, 'Quantità');
    expect(quantity.value).toBe('4');

    const values = Array.from(section.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      .map((input) => input.value);
    expect(values).toEqual(expect.arrayContaining(['3', '5']));

    const checkbox = section.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.checked).toBe(false);

    fixture.destroy();
  });

  it('rimuove il loot dall’inspector e lo ripristina con undo', async () => {
    const doc = withItems(baseDocument(), [], [light, lootA]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'loot', id: lootA.id });
    fixture.detectChanges();
    const section = lootSection(fixture);
    if (section === null) {
      throw new Error('sezione loot assente');
    }

    buttonIn(section, 'Rimuovi').click();
    fixture.detectChanges();

    expect(lootOf(page.doc())).toEqual([]);
    expect(page.selected()).toBeNull();
    expect(page.dirty()).toBe(true);

    page.undo();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  it('il salvataggio conserva il loot nel layer elements', async () => {
    const doc = withItems(baseDocument(), [wall], [light, lootA, lootB]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;

    await page.save();

    const saved = saveMap.mock.calls[0]?.[2] as MapDocument;
    expect(saved.layers[3].items).toEqual([light, lootA, lootB]);
    expect(saved.layers[3].items.filter((item) => item.type === 'loot')).toHaveLength(2);

    fixture.destroy();
  });
});
