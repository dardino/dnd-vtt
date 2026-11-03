import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accoda i toast con id univoci e il kind richiesto', () => {
    const first = service.show('Salvataggio riuscito', 'success', 0);
    const second = service.show('Errore di rete', 'error', 0);

    expect(first).not.toBe(second);
    expect(service.toasts()).toEqual([
      { id: first, message: 'Salvataggio riuscito', kind: 'success' },
      { id: second, message: 'Errore di rete', kind: 'error' },
    ]);
  });

  it('usa info come kind predefinito', () => {
    service.show('Nota', undefined, 0);

    expect(service.toasts()[0]?.kind).toBe('info');
  });

  it('rimuove il toast dopo la durata predefinita', () => {
    service.show('Temporaneo');

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    expect(service.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
  });

  it('dismiss rimuove il toast e annulla il timer', () => {
    const id = service.show('Da chiudere');
    service.dismiss(id);

    expect(service.toasts()).toHaveLength(0);
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(service.toasts()).toHaveLength(0);
  });

  it('dismiss di un id sconosciuto non tocca gli altri toast', () => {
    const id = service.show('Resta', 'info', 0);

    service.dismiss('inesistente');

    expect(service.toasts()).toEqual([{ id, message: 'Resta', kind: 'info' }]);
  });
});
