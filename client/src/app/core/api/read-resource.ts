import {
  assertInInjectionContext,
  computed,
  ErrorHandler,
  inject,
  resource,
  type ResourceRef,
  type ResourceStatus,
  type Signal,
} from '@angular/core';
import { httpStatus } from './http-error';
import { ToastService } from '../ui/toast.service';

export interface ReadResourceOptions<T, P> {
  /**
   * Parametri reattivi della lettura. Ritornare `undefined` mantiene il
   * resource in stato `idle` e non esegue alcuna chiamata. Quando il valore
   * cambia il loader precedente viene abortito e la risposta vecchia scartata.
   */
  readonly params: () => P | undefined;
  /** Esegue la lettura. Il secondo argomento è l'`AbortSignal` del resource. */
  readonly loader: (params: P, abortSignal: AbortSignal) => Promise<T>;
  /**
   * Messaggio mostrato nel toast per gli errori HTTP. Gli errori non HTTP
   * restano al `GlobalErrorHandler` (log + toast generico).
   */
  readonly errorMessage: string | ((error: unknown) => string);
}

export interface ReadResource<T> {
  /** Il resource originale, per `hasValue`/`snapshot`/`destroy`. */
  readonly resource: ResourceRef<T | undefined>;
  /** Valore corrente, `undefined` in idle/loading/error (non lancia). */
  readonly value: Signal<T | undefined>;
  readonly status: Signal<ResourceStatus>;
  readonly error: Signal<Error | undefined>;
  readonly isLoading: Signal<boolean>;
  readonly isIdle: Signal<boolean>;
  readonly hasError: Signal<boolean>;
  readonly reload: () => boolean;
}

/**
 * Lettura read-only basata su `resource()` con params reattivi, stato uniforme
 * e segnalazione degli errori una sola volta.
 *
 * Va chiamata esclusivamente in injection context (costruttore di un servizio,
 * inizializzatore di campo di un componente, `TestBed.runInInjectionContext`
 * nei test): usa `inject()` e `resource()`.
 */
export function readResource<T, P>(options: ReadResourceOptions<T, P>): ReadResource<T> {
  assertInInjectionContext(readResource);

  const toasts = inject(ToastService);
  const errorHandler = inject(ErrorHandler);
  let lastReportedKey: string | undefined;

  const messageFor = (error: unknown): string =>
    typeof options.errorMessage === 'function'
      ? options.errorMessage(error)
      : options.errorMessage;

  /**
   * Chiave stabile per deduplicare un retry: due `HttpErrorResponse` diverse
   * con lo stesso stato e messaggio non devono produrre due toast.
   */
  const keyFor = (error: unknown): string => {
    const status = httpStatus(error);
    if (status !== null) {
      return `${status}:${messageFor(error)}`;
    }
    return `error:${error instanceof Error ? error.message : String(error)}`;
  };

  const report = (error: unknown): void => {
    const key = keyFor(error);
    if (key === lastReportedKey) {
      return;
    }
    lastReportedKey = key;
    // Gli errori HTTP sono già tradotti qui: passare dal `GlobalErrorHandler`
    // duplicherebbe la gestione. Gli altri restano al gestore globale.
    if (httpStatus(error) !== null) {
      toasts.show(messageFor(error), 'error');
      return;
    }
    errorHandler.handleError(error);
  };

  const ref = resource<T | undefined, P | undefined>({
    params: () => options.params(),
    loader: async ({ params, abortSignal }) => {
      try {
        const value = await options.loader(params, abortSignal);
        lastReportedKey = undefined;
        return value;
      } catch (error) {
        // Una richiesta superata dai nuovi params è già abortita: non deve
        // produrre un toast per una risposta che il resource scarterà.
        if (!abortSignal.aborted) {
          report(error);
        }
        throw error;
      }
    },
  });

  return {
    resource: ref,
    value: computed(() => (ref.hasValue() ? ref.value() : undefined)),
    status: ref.status,
    error: ref.error,
    isLoading: ref.isLoading,
    isIdle: computed(() => ref.status() === 'idle'),
    hasError: computed(() => ref.status() === 'error'),
    reload: () => ref.reload(),
  };
}
