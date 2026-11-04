import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MapLayerKind, MapLayers } from '@dnd-vtt/shared';

export interface LayerVisibilityToggle {
  readonly kind: MapLayerKind;
  readonly visible: boolean;
}

export interface LayerLockToggle {
  readonly kind: MapLayerKind;
  readonly locked: boolean;
}

export interface LayerOpacityCommit {
  readonly kind: MapLayerKind;
  readonly opacity: number;
}

const LAYER_LABELS: Record<MapLayerKind, string> = {
  background: 'Sfondo',
  graphics: 'Grafica',
  constraints: 'Vincoli',
  elements: 'Elementi',
};

const isActivationKey = (event: KeyboardEvent): boolean =>
  event.key === 'Enter' || event.key === ' ';

const LAYER_ICONS: Record<MapLayerKind, string> = {
  background: 'image',
  graphics: 'category',
  constraints: 'fence',
  elements: 'location_on',
};

/**
 * Pannello dei quattro layer canonici: attivazione, visibilità, lock e opacità.
 * È presentazionale: ogni modifica risale alla pagina tramite output tipizzati.
 */
@Component({
  selector: 'app-map-layer-panel',
  templateUrl: './map-layer-panel.component.html',
  styleUrl: './map-layer-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLayerPanelComponent {
  public readonly layers = input.required<MapLayers>();
  public readonly active = input.required<MapLayerKind>();

  public readonly activated = output<MapLayerKind>();
  public readonly visibilityToggled = output<LayerVisibilityToggle>();
  public readonly lockToggled = output<LayerLockToggle>();
  public readonly opacityCommitted = output<LayerOpacityCommit>();

  public readonly labels = LAYER_LABELS;

  public isActive(kind: MapLayerKind): boolean {
    return this.active() === kind;
  }

  public iconFor(kind: MapLayerKind): string {
    return LAYER_ICONS[kind];
  }

  public visibilityLabel(kind: MapLayerKind, visible: boolean): string {
    return `${visible ? 'Nascondi' : 'Mostra'} layer ${LAYER_LABELS[kind]}`;
  }

  public lockLabel(kind: MapLayerKind, locked: boolean): string {
    return `${locked ? 'Sblocca' : 'Blocca'} layer ${LAYER_LABELS[kind]}`;
  }

  public activate(kind: MapLayerKind): void {
    this.activated.emit(kind);
  }

  public toggleVisibility(kind: MapLayerKind, visible: boolean): void {
    this.visibilityToggled.emit({ kind, visible: !visible });
  }

  public toggleLock(kind: MapLayerKind, locked: boolean): void {
    this.lockToggled.emit({ kind, locked: !locked });
  }

  /** Enter/Spazio sulla riga attivano il layer solo quando il focus è sulla riga stessa. */
  public onRowKeydown(event: KeyboardEvent, kind: MapLayerKind): void {
    if (event.target !== event.currentTarget || !isActivationKey(event)) {
      return;
    }
    event.preventDefault();
    this.activate(kind);
  }

  /** Enter/Spazio sui controlli commutano il controllo senza attivare il layer. */
  public onVisibilityKeydown(
    event: KeyboardEvent,
    kind: MapLayerKind,
    visible: boolean,
  ): void {
    if (!isActivationKey(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.toggleVisibility(kind, visible);
  }

  public onLockKeydown(event: KeyboardEvent, kind: MapLayerKind, locked: boolean): void {
    if (!isActivationKey(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.toggleLock(kind, locked);
  }

  public commitOpacity(kind: MapLayerKind, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }
    this.opacityCommitted.emit({ kind, opacity: value });
  }
}
