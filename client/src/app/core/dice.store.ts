import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import type { DiceRoll, DiceRollList, DiceRollRequest, DiceVisibility } from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

interface DiceStoreState {
  rolls: DiceRoll[];
  last: DiceRoll | null;
  rolling: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: DiceStoreState = {
  rolls: [],
  last: null,
  rolling: false,
  loading: false,
  error: null,
};

export const DiceStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const http = inject(HttpClient);
    return {
      async load(campaignId: string, visibility?: DiceVisibility): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          const query = visibility === undefined ? '' : `?visibility=${visibility}`;
          const result = await firstValueFrom(
            http.get<DiceRollList>(`/api/v1/campaigns/${campaignId}/rolls${query}`),
          );
          patchState(store, { rolls: result.items, loading: false });
        } catch (error) {
          patchState(store, { loading: false, error: messageFor(error) });
        }
      },

      async roll(campaignId: string, request: DiceRollRequest): Promise<DiceRoll | null> {
        patchState(store, { rolling: true, error: null });
        try {
          const result = await firstValueFrom(
            http.post<DiceRoll>(`/api/v1/campaigns/${campaignId}/rolls`, request),
          );
          patchState(store, {
            last: result,
            rolls: [result, ...store.rolls().filter((roll) => roll.id !== result.id)].slice(0, 200),
            rolling: false,
          });
          return result;
        } catch (error) {
          patchState(store, { rolling: false, error: messageFor(error) });
          return null;
        }
      },

      clear(): void {
        patchState(store, initialState);
      },
    };
  }),
);

const messageFor = (error: unknown): string => {
  if (error instanceof HttpErrorResponse && error.status === 422) {
    return 'Formula non valida. Usa forme come 1d20+5 o 4d6kh3.';
  }
  if (error instanceof HttpErrorResponse && error.status === 429) {
    return 'Troppe richieste: attendi un istante.';
  }
  return 'Tiro non riuscito. Controlla il server.';
};
