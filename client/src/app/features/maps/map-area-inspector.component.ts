import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { BlockedArea } from '@dnd-vtt/shared';

/**
 * Inspector presentazionale dell'area bloccata selezionata: etichetta
 * modificabile e rimozione, senza mutare il documento (la pagina applica i
 * comandi alla history).
 */
@Component({
  selector: 'app-map-area-inspector',
  templateUrl: './map-area-inspector.component.html',
  styleUrl: './map-area-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapAreaInspectorComponent {
  public readonly area = input.required<BlockedArea>();

  public readonly labelChanged = output<string>();
  public readonly removed = output<void>();

  /** Il change (non l'input) evita una history per ogni tasto premuto. */
  public commitLabel(event: Event): void {
    this.labelChanged.emit((event.target as HTMLInputElement).value);
  }
}
