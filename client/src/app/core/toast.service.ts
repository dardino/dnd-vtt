import { Injectable, signal } from '@angular/core';
import { newId } from '@dnd-vtt/shared';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastMessage {
  readonly id: string;
  readonly message: string;
  readonly kind: ToastKind;
}

/** Durata predefinita di un toast, in millisecondi. */
export const TOAST_DURATION_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly items = signal<readonly ToastMessage[]>([]);

  public readonly toasts = this.items.asReadonly();

  /** Mostra un toast e lo rimuove automaticamente dopo `duration` ms (0 = nessun auto-dismiss). */
  public show(
    message: string,
    kind: ToastKind = 'info',
    duration: number = TOAST_DURATION_MS,
  ): string {
    const id = newId();
    this.items.update((toasts) => [...toasts, { id, message, kind }]);
    if (duration > 0) {
      this.timers.set(id, setTimeout(() => this.dismiss(id), duration));
    }
    return id;
  }

  public dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.items.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }
}
