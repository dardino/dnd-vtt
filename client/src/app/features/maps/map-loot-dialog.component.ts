import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { SrdItem } from '@dnd-vtt/shared';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';

/** Payload confermato dal dialog: la pagina crea l'elemento loot. */
export interface LootDialogPayload {
  itemId: string;
  quantity: number;
  visible: boolean;
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 999;
const MAX_RESULTS = 100;

const clampQuantity = (value: number): number => {
  if (!Number.isFinite(value)) {
    return MIN_QUANTITY;
  }
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.round(value)));
};

/**
 * Selettore di oggetti SRD per il layer `elements`. Presentazionale rispetto al
 * documento: emette il payload scelto e delega alla pagina la creazione del loot
 * tramite history.
 */
@Component({
  selector: 'app-map-loot-dialog',
  templateUrl: './map-loot-dialog.component.html',
  styleUrl: './map-loot-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLootDialogComponent {
  public readonly open = input(false);

  public readonly confirmed = output<LootDialogPayload>();
  public readonly closed = output<void>();

  private readonly catalogService = inject(SrdCatalogService);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly searchRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly titleId = 'map-loot-dialog-title';
  protected readonly search = signal('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly quantity = signal(MIN_QUANTITY);
  protected readonly visible = signal(true);

  protected readonly items = computed<SrdItem[]>(
    () => this.catalogService.catalog()?.items ?? [],
  );

  protected readonly error = computed(() => this.catalogService.error());

  protected readonly loading = computed(() => this.catalogService.loading());

  protected readonly filtered = computed<SrdItem[]>(() => {
    const query = this.search().trim().toLowerCase();
    const items = this.items();
    if (query === '') {
      return items.slice(0, MAX_RESULTS);
    }
    return items
      .filter((item) =>
        item.name.toLowerCase().includes(query) || item.type.toLowerCase().includes(query))
      .slice(0, MAX_RESULTS);
  });

  protected readonly selectedItem = computed<SrdItem | null>(() => {
    const id = this.selectedId();
    if (id === null) {
      return null;
    }
    return this.items().find((item) => item.id === id) ?? null;
  });

  protected readonly canConfirm = computed(() => this.selectedItem() !== null);

  /** Evita il doppio `closed` quando la chiusura è già stata richiesta da noi. */
  private programmaticClose = false;

  public constructor() {
    effect(() => {
      const element = this.dialogRef().nativeElement;
      if (this.open() && !element.open) {
        this.reset();
        element.showModal();
        this.searchRef()?.nativeElement.focus();
        return;
      }
      if (!this.open() && element.open) {
        this.programmaticClose = true;
        element.close();
      }
    });
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectItem(id: string): void {
    this.selectedId.set(id);
  }

  protected onQuantity(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = clampQuantity(Number(input.value));
    this.quantity.set(value);
    // Il binding `[value]` non riscrive il DOM quando il segnale non cambia:
    // riallinea sempre il campo al valore normalizzato.
    input.value = String(value);
  }

  protected onVisible(event: Event): void {
    this.visible.set((event.target as HTMLInputElement).checked);
  }

  protected confirm(): void {
    const item = this.selectedItem();
    if (item === null) {
      return;
    }
    this.confirmed.emit({
      itemId: item.id,
      quantity: clampQuantity(this.quantity()),
      visible: this.visible(),
    });
    this.requestClose();
  }

  protected cancel(): void {
    this.requestClose();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.requestClose();
  }

  protected onClose(): void {
    if (this.programmaticClose) {
      this.programmaticClose = false;
      return;
    }
    this.closed.emit();
  }

  private requestClose(): void {
    this.programmaticClose = true;
    this.closed.emit();
    const element = this.dialogRef().nativeElement;
    if (element.open) {
      element.close();
    } else {
      this.programmaticClose = false;
    }
  }

  private reset(): void {
    this.search.set('');
    this.selectedId.set(null);
    this.quantity.set(MIN_QUANTITY);
    this.visible.set(true);
  }
}
