import { HttpClient } from '@angular/common/http';
import { effect, inject, signal } from '@angular/core';
import {
  applyAction,
  type AppliedAction,
  type GameAction,
  type SceneSnapshot,
} from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { httpMessage } from './http-error';
import { readResource } from './read-resource';

interface SceneStoreState {
  snapshot: SceneSnapshot | null;
  stateVersion: number;
  loading: boolean;
  error: string | null;
}

const initialState: SceneStoreState = {
  snapshot: null,
  stateVersion: 0,
  loading: false,
  error: null,
};

/**
 * Proiezione dello stato di scena: legge lo snapshot, applica le azioni
 * canoniche confermate dal server e consente l'applicazione ottimistica
 * richiesta dall'ActionStore. Nessun metodo scrive il documento intero.
 */
export const SceneStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const http = inject(HttpClient);
    const requestedSceneId = signal<string | undefined>(undefined);
    const waiters = new Set<() => void>();
    /**
     * Invalida le `load()` in volo dopo un `clear()` o una nuova `load()`: la
     * risposta superata risolve la promise ma non tocca lo stato.
     */
    let generation = 0;

    const sceneRead = readResource<SceneSnapshot, string>({
      params: () => requestedSceneId(),
      loader: (sceneId) => firstValueFrom(
        http.get<SceneSnapshot>(`/api/v1/scenes/${sceneId}/snapshot?force=true`),
      ),
      errorMessage: messageFor,
    });

    const settleWaiters = (): void => {
      const pending = [...waiters];
      waiters.clear();
      for (const resolve of pending) {
        resolve();
      }
    };

    // Il resource è l'unica fonte: quando si assesta risolviamo le `load()` in
    // attesa. Valore e scena devono coincidere per non applicare una risposta
    // superata (il resource scarta comunque le richieste abortite).
    effect(() => {
      const status = sceneRead.status();
      if (status === 'resolved') {
        const value = sceneRead.value();
        if (value !== undefined && value.scene.id === requestedSceneId()) {
          settleWaiters();
        }
      } else if (status === 'error') {
        settleWaiters();
      }
    });

    const applyToSnapshot = (action: GameAction): void => {
      const snapshot = store.snapshot();
      if (snapshot === null) {
        return;
      }
      patchState(store, { snapshot: { ...snapshot, state: applyAction(snapshot.state, action) } });
    };

    return {
      async load(sceneId: string): Promise<void> {
        const startGeneration = ++generation;
        patchState(store, { loading: true, error: null });
        const settled = new Promise<void>((resolve) => {
          waiters.add(resolve);
        });
        if (requestedSceneId() === sceneId) {
          sceneRead.reload();
        } else {
          requestedSceneId.set(sceneId);
        }
        await settled;
        if (startGeneration !== generation || requestedSceneId() !== sceneId) {
          return;
        }
        const snapshot = sceneRead.value();
        if (snapshot !== undefined) {
          patchState(store, {
            snapshot,
            stateVersion: snapshot.stateVersion,
            loading: false,
            error: null,
          });
          return;
        }
        const error = sceneRead.error();
        patchState(store, {
          loading: false,
          error: error === undefined ? null : messageFor(error),
        });
      },

      applyServerAction(applied: AppliedAction): void {
        const snapshot = store.snapshot();
        if (
          snapshot === null
          || snapshot.scene.id !== applied.sceneId
          || applied.stateVersion <= store.stateVersion()
        ) {
          return;
        }
        patchState(store, {
          snapshot: {
            ...snapshot,
            state: applyAction(snapshot.state, applied.action),
            stateVersion: applied.stateVersion,
          },
          stateVersion: applied.stateVersion,
        });
      },

      /** Applica subito l'azione in attesa della conferma del server. */
      applyOptimistic(action: GameAction): void {
        applyToSnapshot(action);
      },

      /** Conferma una versione già rappresentata localmente (azione propria). */
      ackVersion(version: number): void {
        const snapshot = store.snapshot();
        if (snapshot === null || version <= store.stateVersion()) {
          return;
        }
        patchState(store, {
          snapshot: { ...snapshot, stateVersion: version },
          stateVersion: version,
        });
      },

      clear(): void {
        // Non azzera i params: dopo `clear()` una `load()` della stessa scena
        // deve poter forzare una nuova lettura (`reload()`). La generazione
        // invalida comunque le richieste ancora in volo.
        generation += 1;
        settleWaiters();
        patchState(store, initialState);
      },
    };
  }),
);

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Impossibile caricare la scena.',
  byStatus: {
    404: 'La scena non esiste più.',
  },
});
