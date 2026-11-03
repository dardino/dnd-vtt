import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readResource } from './read-resource';
import { ToastService } from './toast.service';

const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const settle = async (): Promise<void> => {
  TestBed.tick();
  await TestBed.inject(ApplicationRef).whenStable();
};

describe('readResource', () => {
  const handleError = vi.fn();
  let toasts: ToastService;

  beforeEach(() => {
    handleError.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: ErrorHandler, useValue: { handleError } }],
    });
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    for (const toast of toasts.toasts()) {
      toasts.dismiss(toast.id);
    }
    TestBed.resetTestingModule();
  });

  it('resta idle con params undefined e non chiama il loader', async () => {
    const params = signal<string | undefined>(undefined);
    const loader = vi.fn(() => Promise.resolve('mai'));
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({ params, loader, errorMessage: 'Errore' }),
    );

    await settle();

    expect(read.status()).toBe('idle');
    expect(read.isIdle()).toBe(true);
    expect(read.isLoading()).toBe(false);
    expect(read.value()).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });

  it('carica quando i params diventano definiti', async () => {
    const params = signal<string | undefined>(undefined);
    const pending = deferred<string>();
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params,
        loader: () => pending.promise,
        errorMessage: 'Errore',
      }),
    );

    params.set('scene-1');
    TestBed.tick();

    expect(read.status()).toBe('loading');
    expect(read.isLoading()).toBe(true);
    expect(read.isIdle()).toBe(false);

    pending.resolve('payload');
    await settle();

    expect(read.status()).toBe('resolved');
    expect(read.value()).toBe('payload');
    expect(read.hasError()).toBe(false);
  });

  it('su errore HTTP mostra un toast senza passare dall’ErrorHandler', async () => {
    const error = new HttpErrorResponse({ status: 500, statusText: 'boom' });
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params: () => 'scene-1',
        loader: async () => {
          await Promise.resolve();
          throw error as unknown as Error;
        },
        errorMessage: 'Lettura non riuscita',
      }),
    );

    await settle();

    expect(read.status()).toBe('error');
    expect(read.hasError()).toBe(true);
    expect(read.isLoading()).toBe(false);
    expect(toasts.toasts()).toEqual([
      expect.objectContaining({ message: 'Lettura non riuscita', kind: 'error' }),
    ]);
    expect(handleError).not.toHaveBeenCalled();
  });

  it('gli errori non HTTP restano al GlobalErrorHandler senza toast contestuale', async () => {
    const error = new Error('boom');
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params: () => 'scene-1',
        loader: async () => {
          await Promise.resolve();
          throw error;
        },
        errorMessage: 'Lettura non riuscita',
      }),
    );

    await settle();

    expect(read.hasError()).toBe(true);
    expect(toasts.toasts()).toHaveLength(0);
    expect(handleError).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(error);
  });

  it('ricarica quando cambiano i params', async () => {
    const params = signal('scene-1');
    const calls: string[] = [];
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params,
        loader: (value) => {
          calls.push(value);
          return Promise.resolve(`payload:${value}`);
        },
        errorMessage: 'Errore',
      }),
    );

    await settle();
    expect(read.value()).toBe('payload:scene-1');

    params.set('scene-2');
    await settle();

    expect(calls).toEqual(['scene-1', 'scene-2']);
    expect(read.value()).toBe('payload:scene-2');
  });

  it('scarta la risposta vecchia arrivata dopo la nuova', async () => {
    const params = signal('scene-1');
    const first = deferred<string>();
    const second = deferred<string>();
    const calls: string[] = [];
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params,
        loader: (value) => {
          calls.push(value);
          return value === 'scene-1' ? first.promise : second.promise;
        },
        errorMessage: 'Errore',
      }),
    );

    TestBed.tick();
    expect(calls).toEqual(['scene-1']);

    params.set('scene-2');
    TestBed.tick();
    expect(calls).toEqual(['scene-1', 'scene-2']);

    second.resolve('nuova');
    await settle();
    expect(read.value()).toBe('nuova');

    first.resolve('vecchia');
    await settle();
    expect(read.value()).toBe('nuova');
  });

  it('reload aggiorna il valore e non duplica il toast HTTP con una nuova istanza di errore', async () => {
    const values = ['primo', 'secondo'];
    const read = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params: () => 'scene-1',
        loader: () => Promise.resolve(values.shift() ?? 'esaurito'),
        errorMessage: 'Errore',
      }),
    );

    await settle();
    expect(read.value()).toBe('primo');

    expect(read.reload()).toBe(true);
    await settle();
    expect(read.value()).toBe('secondo');

    const failing = TestBed.runInInjectionContext(
      () => readResource<string, string>({
        params: () => 'scene-1',
        loader: async () => {
          await Promise.resolve();
          throw new HttpErrorResponse({ status: 503 }) as unknown as Error;
        },
        errorMessage: 'Errore',
      }),
    );
    await settle();
    expect(failing.hasError()).toBe(true);

    expect(failing.reload()).toBe(true);
    await settle();

    expect(toasts.toasts()).toEqual([
      expect.objectContaining({ message: 'Errore', kind: 'error' }),
    ]);
    expect(handleError).not.toHaveBeenCalled();
  });
});
