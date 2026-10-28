import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import {
  applyAction,
  type AppliedAction,
  type GameAction,
  type SceneSnapshot,
} from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

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

    const applyToSnapshot = (action: GameAction): void => {
      const snapshot = store.snapshot();
      if (snapshot === null) {
        return;
      }
      patchState(store, { snapshot: { ...snapshot, state: applyAction(snapshot.state, action) } });
    };

    return {
      async load(sceneId: string): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          const snapshot = await firstValueFrom(
            http.get<SceneSnapshot>(`/api/v1/scenes/${sceneId}/snapshot?force=true`),
          );
          patchState(store, {
            snapshot,
            stateVersion: snapshot.stateVersion,
            loading: false,
          });
        } catch (error) {
          patchState(store, { loading: false, error: messageFor(error) });
        }
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
        patchState(store, initialState);
      },
    };
  }),
);

const messageFor = (error: unknown): string => {
  if (error instanceof HttpErrorResponse && error.status === 404) {
    return 'La scena non esiste più.';
  }
  return 'Impossibile caricare la scena.';
};
