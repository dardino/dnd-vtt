import { Injectable, inject } from '@angular/core';
import type { ErrorHandler } from '@angular/core';
import { httpStatus } from './http-error';
import { ToastService } from './toast.service';

export const UNHANDLED_ERROR_MESSAGE = 'Si è verificato un errore imprevisto. Riprova.';

/**
 * Gestore globale degli errori non gestiti: logga il dettaglio in console e
 * mostra un toast. Gli errori HTTP sono esclusi perché vengono già tradotti
 * nei punti di chiamata tramite `http-error.ts`, dove c'è il contesto.
 */
@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);

  public handleError(error: unknown): void {
    console.error(error);
    if (httpStatus(error) !== null) {
      return;
    }
    this.toasts.show(UNHANDLED_ERROR_MESSAGE, 'error');
  }
}
