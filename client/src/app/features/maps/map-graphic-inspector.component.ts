import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MapGraphic } from '@dnd-vtt/shared';
import type { GraphicZDirection } from './map-command';

/** Campi numerici modificabili della grafica. */
export type GraphicField = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

export interface GraphicFieldChange {
  readonly field: GraphicField;
  readonly value: number;
}

/**
 * Inspector presentazionale della grafica selezionata: mostra i campi numerici
 * e risale alla pagina con output tipizzati, senza mutare il documento.
 */
@Component({
  selector: 'app-map-graphic-inspector',
  templateUrl: './map-graphic-inspector.component.html',
  styleUrl: './map-graphic-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapGraphicInspectorComponent {
  public readonly graphic = input.required<MapGraphic>();

  public readonly fieldChanged = output<GraphicFieldChange>();
  public readonly flipped = output<'h' | 'v'>();
  public readonly zChanged = output<GraphicZDirection>();
  public readonly removed = output<void>();

  /** Emette solo valori finiti e dentro i limiti del campo. */
  public commit(field: GraphicField, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    // Il binding `[value]` non reagisce a un rifiuto: il modello non cambia.
    const restore = (): void => {
      input.value = String(this.graphic()[field]);
    };
    // Un input `number` invalido espone stringa vuota: non è un valore da committare.
    if (raw.trim() === '') {
      restore();
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      restore();
      return;
    }
    if (field === 'scale' && value <= 0) {
      restore();
      return;
    }
    if (field === 'opacity' && (value < 0 || value > 1)) {
      restore();
      return;
    }
    this.fieldChanged.emit({ field, value });
  }
}
