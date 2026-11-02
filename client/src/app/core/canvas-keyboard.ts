/** Passo di pan da tastiera in pixel schermo. */
export const CANVAS_PAN_STEP = 48;

/** Fattore di zoom da tastiera, allineato ai pulsanti delle toolbar. */
export const CANVAS_ZOOM_FACTOR = 1.15;

export type CanvasKeyboardCommand
  = | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
    | { readonly type: 'zoom'; readonly factor: number }
    | { readonly type: 'deselect' };

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True se il target del tasto è un campo editabile. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || EDITABLE_TAGS.has(target.tagName);
}

/**
 * Traduce i tasti del canvas in comandi camera/selezione. Restituisce `null`
 * per i tasti non gestiti e quando il focus è in un campo editabile, così
 * input e textarea interni continuano a ricevere frecce e cancellazione.
 *
 * Le frecce spostano il viewport nella direzione premuta: il contenuto scorre
 * in senso opposto. Shift rende il pan più rapido.
 */
export function canvasKeyboardCommand(event: KeyboardEvent): CanvasKeyboardCommand | null {
  if (isEditableTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  const step = event.shiftKey ? CANVAS_PAN_STEP * 3 : CANVAS_PAN_STEP;
  switch (event.key) {
    case 'ArrowLeft':
      return { type: 'pan', dx: step, dy: 0 };
    case 'ArrowRight':
      return { type: 'pan', dx: -step, dy: 0 };
    case 'ArrowUp':
      return { type: 'pan', dx: 0, dy: step };
    case 'ArrowDown':
      return { type: 'pan', dx: 0, dy: -step };
    case '+':
    case '=':
    case 'Add':
      return { type: 'zoom', factor: CANVAS_ZOOM_FACTOR };
    case '-':
    case '_':
    case 'Subtract':
      return { type: 'zoom', factor: 1 / CANVAS_ZOOM_FACTOR };
    case 'Escape':
      return { type: 'deselect' };
    default:
      return null;
  }
}
