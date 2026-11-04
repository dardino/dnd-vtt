import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { MapDocument, SrdCatalog } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { MapService } from '../../core/services/map.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapEditorPage } from './map-editor.page';
import {
  baseDocument,
  buttonIn,
  catalogItems,
  light,
  loot,
  lootA,
  lootB,
  lootOf,
  lootSection,
  MAP_ID,
  potion,
  rootOf,
  rope,
  toMap,
  withItems,
} from './map-editor.page.loot.test-helpers';

/** Regione che elenca gli oggetti già presenti sulla mappa. */
const LOOT_LIST_LABEL = 'Oggetti sulla mappa';

const contentSection = (fixture: ComponentFixture<MapEditorPage>): HTMLElement | null => {
  const root = rootOf(fixture);
  const byId = root.querySelector<HTMLElement>('#map-content');
  if (byId !== null) {
    return byId;
  }
  return Array.from(root.querySelectorAll<HTMLElement>('app-sidebar-section')).find((section) =>
    (section.querySelector('.accordion__trigger')?.textContent ?? '').includes('Contenuto'),
  ) ?? null;
};

const lootList = (fixture: ComponentFixture<MapEditorPage>): HTMLElement | null =>
  rootOf(fixture).querySelector<HTMLElement>(`[aria-label="${LOOT_LIST_LABEL}"]`);

const lootListButtons = (fixture: ComponentFixture<MapEditorPage>): HTMLButtonElement[] =>
  Array.from(
    rootOf(fixture).querySelectorAll<HTMLButtonElement>(
      `[aria-label="${LOOT_LIST_LABEL}"] button[data-loot-id]`,
    ),
  );

const lootListItem = (
  fixture: ComponentFixture<MapEditorPage>,
  id: string,
): HTMLButtonElement => {
  const button = lootListButtons(fixture).find((entry) => entry.dataset['lootId'] === id);
  if (button === undefined) {
    throw new Error(`loot ${id} assente dalla lista del Contenuto`);
  }
  return button;
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

const quantityField = (fixture: ComponentFixture<MapEditorPage>): HTMLInputElement => {
  const section = lootSection(fixture);
  if (section === null) {
    throw new Error('sezione loot assente');
  }
  return fieldNamed(section, 'Quantità');
};

const commitQuantity = (
  fixture: ComponentFixture<MapEditorPage>,
  value: string,
): HTMLInputElement => {
  const input = quantityField(fixture);
  input.value = value;
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();
  return input;
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

describe('MapEditorPage loot nel Contenuto', () => {
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

  const renderWithLoot = (): Promise<ComponentFixture<MapEditorPage>> =>
    render(withItems(baseDocument(), [], [lootA, lootB]));

  it('elenca i loot già presenti nel Contenuto con il nome risolto dal catalogo', async () => {
    const fixture = await renderWithLoot();
    fixture.detectChanges();

    const section = contentSection(fixture);
    const list = lootList(fixture);
    expect(section, 'sezione Contenuto assente').not.toBeNull();
    expect(list, 'lista “Oggetti sulla mappa” assente dal Contenuto').not.toBeNull();
    expect(section?.contains(list ?? null)).toBe(true);

    expect(list?.textContent).toContain('Pozione di guarigione');
    expect(list?.textContent).toContain('Corda di canapa');
    expect(list?.textContent).not.toContain('potion-of-healing');
    expect(lootListButtons(fixture).map((button) => button.dataset['lootId']))
      .toEqual([lootA.id, lootB.id]);
    expect(fixture.componentInstance.selected()).toBeNull();

    fixture.destroy();
  });

  it('elenca solo i loot, non gli altri elementi del layer', async () => {
    const extra = loot('loot-3', { itemId: 'rope', x: 9, y: 9 });
    const fixture = await render(withItems(baseDocument(), [], [light, lootA, extra]));
    fixture.detectChanges();

    expect(lootListButtons(fixture).map((button) => button.dataset['lootId']))
      .toEqual([lootA.id, extra.id]);

    fixture.destroy();
  });

  it('cliccare un loot del Contenuto lo seleziona e attiva lo strumento Seleziona', async () => {
    const fixture = await renderWithLoot();
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.setTool('loot');
    fixture.detectChanges();
    expect(page.tool()).toBe('loot');
    expect(lootSection(fixture)).toBeNull();

    lootListItem(fixture, lootB.id).click();
    fixture.detectChanges();

    expect(page.selected()).toEqual({ type: 'loot', id: lootB.id });
    expect(page.tool()).toBe('select');
    expect(lootSection(fixture)).not.toBeNull();
    expect(quantityField(fixture).value).toBe('1');

    fixture.destroy();
  });

  it('modifica quantità e visibilità del loot scelto e lo rimuove con undo', async () => {
    const doc = withItems(baseDocument(), [], [light, lootA, lootB]);
    const fixture = await render(doc);
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    fixture.detectChanges();

    lootListItem(fixture, lootA.id).click();
    fixture.detectChanges();
    expect(page.selected()).toEqual({ type: 'loot', id: lootA.id });

    expect(commitQuantity(fixture, '6').value).toBe('6');
    expect(lootOf(page.doc()).find((item) => item.id === lootA.id)?.quantity).toBe(6);

    const section = lootSection(fixture);
    if (section === null) {
      throw new Error('sezione loot assente');
    }
    const visible = section.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (visible === null) {
      throw new Error('checkbox visibilità assente');
    }
    visible.checked = true;
    visible.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(lootOf(page.doc()).find((item) => item.id === lootA.id)?.visible).toBe(true);
    expect(page.dirty()).toBe(true);

    buttonIn(section, 'Rimuovi').click();
    fixture.detectChanges();
    expect(lootOf(page.doc()).map((item) => item.id)).toEqual([lootB.id]);
    expect(page.selected()).toBeNull();

    // Quantità, visibilità e rimozione sono tre comandi distinti: ogni undo
    // annulla un solo comando, dal più recente al più vecchio.
    page.undo();
    fixture.detectChanges();
    const restored = lootOf(page.doc()).find((item) => item.id === lootA.id);
    expect(restored, 'undo della rimozione non ha reinserito il loot').toBeDefined();
    expect(restored?.quantity).toBe(6);
    expect(restored?.visible).toBe(true);
    expect(lootOf(page.doc()).map((item) => item.id)).toEqual([lootA.id, lootB.id]);
    expect(page.doc()).not.toEqual(doc);

    page.undo();
    fixture.detectChanges();
    const beforeVisibility = lootOf(page.doc()).find((item) => item.id === lootA.id);
    expect(beforeVisibility?.quantity).toBe(6);
    expect(beforeVisibility?.visible).toBe(false);
    expect(page.doc()).not.toEqual(doc);

    page.undo();
    fixture.detectChanges();
    expect(page.doc()).toEqual(doc);

    fixture.destroy();
  });

  const invalidQuantities = [
    { reason: 'oltre il massimo', raw: '1000' },
    { reason: 'a zero', raw: '0' },
    { reason: 'non intera', raw: '2.5' },
    { reason: 'vuota', raw: '' },
  ] as const;

  for (const { reason, raw } of invalidQuantities) {
    it(`ripristina la quantità dell’inspector dopo un valore ${reason}`, async () => {
      const fixture = await render(withItems(baseDocument(), [], [lootA]));
      const page = fixture.componentInstance;
      page.setActiveLayer('elements');
      page.select({ type: 'loot', id: lootA.id });
      fixture.detectChanges();

      const input = commitQuantity(fixture, raw);

      const model = lootOf(page.doc())[0];
      expect(model?.quantity).toBe(4);
      expect(Number.isInteger(model?.quantity)).toBe(true);
      expect(input.value).toBe('4');
      expect(page.dirty()).toBe(false);

      fixture.destroy();
    });
  }

  it('la quantità valida aggiorna il modello e l’input segue undo', async () => {
    const fixture = await render(withItems(baseDocument(), [], [lootA]));
    const page = fixture.componentInstance;
    page.setActiveLayer('elements');
    page.select({ type: 'loot', id: lootA.id });
    fixture.detectChanges();

    expect(commitQuantity(fixture, '7').value).toBe('7');
    expect(lootOf(page.doc())[0]?.quantity).toBe(7);
    expect(page.dirty()).toBe(true);

    page.undo();
    fixture.detectChanges();
    expect(lootOf(page.doc())[0]?.quantity).toBe(4);
    expect(quantityField(fixture).value).toBe('4');

    fixture.destroy();
  });
});
