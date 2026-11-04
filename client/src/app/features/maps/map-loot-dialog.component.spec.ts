import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { SrdCatalog, SrdItem } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';
import { MapLootDialogComponent } from './map-loot-dialog.component';

const item = (
  id: string,
  name: string,
  type: string,
  overrides: Partial<SrdItem> = {},
): SrdItem => ({
  id,
  name,
  type,
  category: 'other',
  valueGp: 0,
  weightLb: 0,
  description: '',
  data: {} as SrdItem['data'],
  ...overrides,
});

const potion = item('potion-of-healing', 'Pozione di guarigione', 'Pozione', {
  category: 'other',
  valueGp: 50,
});
const sword = item('longsword', 'Spada lunga', 'Arma', { category: 'weapon', valueGp: 15 });
const rope = item('rope', 'Corda di canapa', 'Equipaggiamento', { category: 'gear' });

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

describe('MapLootDialogComponent', () => {
  let items: WritableSignal<SrdItem[]>;
  let error: WritableSignal<string | null>;
  let loading: WritableSignal<boolean>;

  beforeEach(() => {
    installDialogPolyfill();
    items = signal<SrdItem[]>([potion, sword, rope]);
    error = signal<string | null>(null);
    loading = signal(false);
    TestBed.configureTestingModule({
      imports: [MapLootDialogComponent],
      providers: [
        {
          provide: SrdCatalogService,
          useValue: {
            items,
            error,
            loading,
            load: () => Promise.resolve(),
            catalog: () => ({
              items: items(),
              monsters: [],
            }) as unknown as SrdCatalog,
          },
        },
      ],
    });
  });

  const rootOf = (fixture: ComponentFixture<MapLootDialogComponent>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  const create = (): ComponentFixture<MapLootDialogComponent> => {
    const fixture = TestBed.createComponent(MapLootDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return fixture;
  };

  const buttons = (fixture: ComponentFixture<MapLootDialogComponent>): HTMLButtonElement[] =>
    Array.from(rootOf(fixture).querySelectorAll<HTMLButtonElement>('button'));

  const buttonNamed = (
    fixture: ComponentFixture<MapLootDialogComponent>,
    name: string,
  ): HTMLButtonElement => {
    const button = buttons(fixture).find((entry) =>
      `${entry.getAttribute('aria-label') ?? ''} ${entry.textContent ?? ''}`.includes(name),
    );
    if (button === undefined) {
      throw new Error(`bottone ${name} assente`);
    }
    return button;
  };

  const itemButton = (
    fixture: ComponentFixture<MapLootDialogComponent>,
    name: string,
  ): HTMLButtonElement => {
    const button = buttons(fixture).find((entry) => (entry.textContent ?? '').includes(name));
    if (button === undefined) {
      throw new Error(`oggetto ${name} assente dalla lista`);
    }
    return button;
  };

  const searchInput = (fixture: ComponentFixture<MapLootDialogComponent>): HTMLInputElement => {
    const input = rootOf(fixture).querySelector<HTMLInputElement>(
      'input[type="search"], input[aria-label*="Cerca" i], input[placeholder*="Cerca" i]',
    );
    if (input === null) {
      throw new Error('campo di ricerca assente');
    }
    return input;
  };

  const fieldNamed = <T extends HTMLInputElement>(
    fixture: ComponentFixture<MapLootDialogComponent>,
    name: string,
  ): T => {
    const root = rootOf(fixture);
    const byAria = root.querySelector<T>(`input[aria-label*="${name}" i]`);
    if (byAria !== null) {
      return byAria;
    }
    const label = Array.from(root.querySelectorAll('label')).find((entry) =>
      (entry.textContent ?? '').includes(name),
    );
    const control = label?.querySelector<T>('input');
    if (control === undefined || control === null) {
      throw new Error(`campo ${name} assente o senza nome accessibile`);
    }
    return control;
  };

  const typeSearch = (
    fixture: ComponentFixture<MapLootDialogComponent>,
    value: string,
  ): void => {
    const input = searchInput(fixture);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const selectItem = (
    fixture: ComponentFixture<MapLootDialogComponent>,
    name: string,
  ): void => {
    itemButton(fixture, name).click();
    fixture.detectChanges();
  };

  /** Digita nel campo quantità e ne committa il `change`, come farebbe l'utente. */
  const commitQuantity = (
    fixture: ComponentFixture<MapLootDialogComponent>,
    raw: string,
  ): HTMLInputElement => {
    const quantity = fieldNamed<HTMLInputElement>(fixture, 'Quantità');
    quantity.value = raw;
    quantity.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    return quantity;
  };

  const confirmButton = (fixture: ComponentFixture<MapLootDialogComponent>): HTMLButtonElement =>
    buttonNamed(fixture, 'Conferma');

  it('mostra nome e tipo degli oggetti del catalogo', () => {
    const fixture = create();
    const text = rootOf(fixture).textContent ?? '';

    expect(text).toContain('Pozione di guarigione');
    expect(text).toContain('Pozione');
    expect(text).toContain('Spada lunga');
    expect(text).toContain('Arma');

    fixture.destroy();
  });

  it('filtra per nome senza distinzione di maiuscole', () => {
    const fixture = create();

    typeSearch(fixture, 'POZIONE');

    const text = rootOf(fixture).textContent ?? '';
    expect(text).toContain('Pozione di guarigione');
    expect(text).not.toContain('Spada lunga');

    fixture.destroy();
  });

  it('filtra anche per tipo senza distinzione di maiuscole', () => {
    const fixture = create();

    typeSearch(fixture, 'arma');

    const text = rootOf(fixture).textContent ?? '';
    expect(text).toContain('Spada lunga');
    expect(text).not.toContain('Pozione di guarigione');

    fixture.destroy();
  });

  it('mostra uno stato vuoto quando il catalogo non ha oggetti', () => {
    items.set([]);
    const fixture = create();

    expect(rootOf(fixture).textContent ?? '').toMatch(/nessun/i);

    fixture.destroy();
  });

  it('mostra l’errore del catalogo senza rompere il dialog', () => {
    items.set([]);
    error.set('Catalogo non disponibile');
    const fixture = create();

    const text = rootOf(fixture).textContent ?? '';
    expect(text).toContain('Catalogo non disponibile');
    expect(searchInput(fixture)).toBeInstanceOf(HTMLInputElement);

    fixture.destroy();
  });

  it('tiene disabilitata la conferma finché non si seleziona un oggetto', () => {
    const fixture = create();

    expect(confirmButton(fixture).disabled).toBe(true);

    selectItem(fixture, 'Pozione di guarigione');

    expect(confirmButton(fixture).disabled).toBe(false);

    fixture.destroy();
  });

  it('parte da quantità 1 e visibilità attiva', () => {
    const fixture = create();
    const quantity = fieldNamed<HTMLInputElement>(fixture, 'Quantità');
    const visible = fieldNamed<HTMLInputElement>(fixture, 'Visibile ai giocatori');

    expect(quantity.value).toBe('1');
    expect(quantity.min).toBe('1');
    expect(quantity.max).toBe('999');
    expect(quantity.step).toBe('1');
    expect(visible.type).toBe('checkbox');
    expect(visible.checked).toBe(true);

    fixture.destroy();
  });

  it('conferma emette il payload scelto e chiude', () => {
    const fixture = create();
    const confirmed = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.closed.subscribe(closed);

    selectItem(fixture, 'Pozione di guarigione');
    const quantity = fieldNamed<HTMLInputElement>(fixture, 'Quantità');
    quantity.value = '5';
    quantity.dispatchEvent(new Event('input'));
    quantity.dispatchEvent(new Event('change'));
    const visible = fieldNamed<HTMLInputElement>(fixture, 'Visibile ai giocatori');
    visible.checked = false;
    visible.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    confirmButton(fixture).click();
    fixture.detectChanges();

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(confirmed).toHaveBeenCalledWith({
      itemId: 'potion-of-healing',
      quantity: 5,
      visible: false,
    });
    expect(closed).toHaveBeenCalledTimes(1);

    fixture.destroy();
  });

  it('limita la quantità a un intero tra 1 e 999', () => {
    const fixture = create();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);

    selectItem(fixture, 'Pozione di guarigione');
    const quantity = fieldNamed<HTMLInputElement>(fixture, 'Quantità');
    quantity.value = '1500';
    quantity.dispatchEvent(new Event('input'));
    quantity.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    confirmButton(fixture).click();
    fixture.detectChanges();

    expect(confirmed).toHaveBeenCalledTimes(1);
    const quantityOut = confirmed.mock.calls[0]?.[0]?.quantity;
    expect(Number.isInteger(quantityOut)).toBe(true);
    expect(quantityOut).toBeGreaterThanOrEqual(1);
    expect(quantityOut).toBeLessThanOrEqual(999);

    fixture.destroy();
  });

  it('ripristina 1 quando si svuota la quantità e conferma il valore valido', () => {
    const fixture = create();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    selectItem(fixture, 'Pozione di guarigione');

    const quantity = commitQuantity(fixture, '');

    expect(quantity.value).toBe('1');
    confirmButton(fixture).click();
    fixture.detectChanges();
    expect(confirmed).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1 }));

    fixture.destroy();
  });

  const outOfRangeQuantities = [
    { raw: '1000', expected: '999' },
    { raw: '0', expected: '1' },
  ] as const;

  for (const { raw, expected } of outOfRangeQuantities) {
    it(`riporta la quantità a ${expected} dopo un valore fuori scala`, () => {
      const fixture = create();
      const confirmed = vi.fn();
      fixture.componentInstance.confirmed.subscribe(confirmed);
      selectItem(fixture, 'Pozione di guarigione');

      const quantity = commitQuantity(fixture, raw);

      expect(quantity.value).toBe(expected);
      confirmButton(fixture).click();
      fixture.detectChanges();
      expect(confirmed).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: Number(expected) }),
      );

      fixture.destroy();
    });
  }

  it('Annulla emette closed senza confirmed', () => {
    const fixture = create();
    const confirmed = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.closed.subscribe(closed);

    buttonNamed(fixture, 'Annulla').click();
    fixture.detectChanges();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();

    fixture.destroy();
  });

  it('Esc emette closed senza confirmed', () => {
    const fixture = create();
    const confirmed = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.closed.subscribe(closed);

    const dialog = rootOf(fixture).querySelector('dialog');
    const cancel = new Event('cancel', { cancelable: true, bubbles: true });
    dialog?.dispatchEvent(cancel);
    fixture.detectChanges();

    expect(cancel.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();

    fixture.destroy();
  });

  it('espone un dialog accessibile con nome, aria-modal e icone decorative', () => {
    const fixture = create();
    const root = rootOf(fixture);
    const surface = root.querySelector<HTMLElement>('[role="dialog"]');

    expect(surface).not.toBeNull();
    expect(surface?.getAttribute('aria-modal')).toBe('true');

    const labelledBy = surface?.getAttribute('aria-labelledby');
    const label = surface?.getAttribute('aria-label')
      ?? (labelledBy === null || labelledBy === undefined
        ? null
        : root.querySelector(`[id="${labelledBy}"]`)?.textContent);
    expect(label?.trim()).not.toBe('');

    for (const icon of Array.from(root.querySelectorAll<HTMLElement>('.material-symbols-outlined'))) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }

    fixture.destroy();
  });

  it('porta il focus iniziale dentro il dialog all’apertura', async () => {
    const fixture = TestBed.createComponent(MapLootDialogComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const surface = rootOf(fixture).querySelector<HTMLElement>('[role="dialog"]');
    const active = document.activeElement;

    expect(surface).not.toBeNull();
    expect(active).not.toBe(document.body);
    expect(surface?.contains(active)).toBe(true);

    fixture.destroy();
  });
});
