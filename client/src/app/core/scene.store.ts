import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { applyAction, type AppliedAction, type SceneSnapshot } from '@dnd-vtt/shared';
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
 * Proiezione read-only dello stato di scena: legge lo snapshot e applica le
 * azioni canoniche confermate dal server. Non esiste un metodo che scriva il
 * documento intero: l'unico writer è l'ActionService (D34).
 */
export const SceneStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const http = inject(HttpClient);
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
        if (snapshot === null || snapshot.scene.id !== applied.sceneId) {
          return;
        }
        const state = applyAction(snapshot.state, applied.action);
        patchState(store, {
          snapshot: { ...snapshot, state, stateVersion: applied.stateVersion },
          stateVersion: applied.stateVersion,
        });
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
