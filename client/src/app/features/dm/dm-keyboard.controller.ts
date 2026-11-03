import { Injectable } from '@angular/core';

export interface DmKeyboardHandlers {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  canUndo: () => boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Scorciatoie da tastiera della console DM (Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z/Y).
 * La pagina registra i propri handler in `ngOnInit` e li rimuove alla
 * distruzione; input/editabili e dialoghi aperti restano fuori.
 */
@Injectable({ providedIn: 'root' })
export class DmKeyboardController {
  private handlers: DmKeyboardHandlers | null = null;

  private readonly onKeydown = (event: KeyboardEvent): void => {
    const handlers = this.handlers;
    if (handlers === null || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target !== null
      && (target.isContentEditable || EDITABLE_TAGS.has(target.tagName))
    ) {
      return;
    }
    if (document.querySelector('dialog[open]') !== null) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      if (!handlers.canUndo()) {
        return;
      }
      event.preventDefault();
      void handlers.undo();
      return;
    }
    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      void handlers.redo();
    }
  };

  /** Registra gli handler; una seconda `attach` sostituisce i precedenti. */
  attach(handlers: DmKeyboardHandlers): void {
    this.detach();
    this.handlers = handlers;
    window.addEventListener('keydown', this.onKeydown);
  }

  /** Rimuove listener e handler: dopo il detach la tastiera è inerte. */
  detach(): void {
    this.handlers = null;
    window.removeEventListener('keydown', this.onKeydown);
  }
}
