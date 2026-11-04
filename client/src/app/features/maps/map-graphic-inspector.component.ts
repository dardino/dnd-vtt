import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  isImageGraphic,
  isPolygonGraphic,
  isTextGraphic,
  type ImageGraphic,
  type MapGraphic,
  type PolygonGraphic,
  type TextGraphic,
} from '@dnd-vtt/shared';
import type { GraphicZDirection } from './map-command';
import { validateGraphicField } from './map-graphic-fields';
import { TEXT_FONT_FAMILIES, TEXT_FONT_LABELS } from './map-text-fonts';

/** Campi modificabili dalla grafica, per variante. */
export type GraphicField
  = | 'x'
    | 'y'
    | 'scale'
    | 'rotation'
    | 'opacity'
    | 'fill'
    | 'text'
    | 'fontFamily'
    | 'fontSize'
    | 'color';

export interface GraphicFieldChange {
  readonly field: GraphicField;
  readonly value: number | string;
}

const STRING_FIELDS: readonly GraphicField[] = ['fill', 'color', 'text', 'fontFamily'];

/**
 * Inspector presentazionale della grafica selezionata: mostra solo i campi
 * pertinenti alla variante (immagine, poligono o testo) e risale alla pagina
 * con output tipizzati, senza mutare il documento.
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

  public readonly fonts = TEXT_FONT_FAMILIES;
  public readonly fontLabels = TEXT_FONT_LABELS;

  public readonly image = computed<ImageGraphic | null>(() => {
    const graphic = this.graphic();
    return isImageGraphic(graphic) ? graphic : null;
  });

  public readonly polygon = computed<PolygonGraphic | null>(() => {
    const graphic = this.graphic();
    return isPolygonGraphic(graphic) ? graphic : null;
  });

  public readonly text = computed<TextGraphic | null>(() => {
    const graphic = this.graphic();
    return isTextGraphic(graphic) ? graphic : null;
  });

  /** Commit del campo: i valori invalidi non escono e il DOM torna al modello. */
  public commit(field: GraphicField, event: Event): void {
    const control = event.target as HTMLInputElement | HTMLSelectElement;
    const raw = control.value;
    // Il binding `[value]` non reagisce a un rifiuto: il modello non cambia.
    const restore = (): void => {
      control.value = String(this.currentValue(field));
    };
    if (STRING_FIELDS.includes(field)) {
      const validated = validateGraphicField(this.graphic(), field, raw);
      if (validated === null) {
        restore();
        return;
      }
      this.fieldChanged.emit({ field, value: validated });
      return;
    }
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
    const validated = validateGraphicField(this.graphic(), field, value);
    if (validated === null) {
      restore();
      return;
    }
    this.fieldChanged.emit({ field, value: validated });
  }

  /** Valore corrente del campo nella variante selezionata. */
  private currentValue(field: GraphicField): string | number {
    const graphic = this.graphic();
    if (field === 'fill') {
      return isPolygonGraphic(graphic) ? graphic.fill : '';
    }
    if (field === 'text') {
      return isTextGraphic(graphic) ? graphic.text : '';
    }
    if (field === 'fontFamily') {
      return isTextGraphic(graphic) ? graphic.fontFamily : '';
    }
    if (field === 'fontSize') {
      return isTextGraphic(graphic) ? graphic.fontSize : 0;
    }
    if (field === 'color') {
      return isTextGraphic(graphic) ? graphic.color : '';
    }
    if (field === 'scale' || field === 'rotation') {
      return isImageGraphic(graphic) ? graphic[field] : 0;
    }
    if (field === 'x' || field === 'y') {
      return isImageGraphic(graphic) || isTextGraphic(graphic) ? graphic[field] : 0;
    }
    return graphic.opacity;
  }
}
