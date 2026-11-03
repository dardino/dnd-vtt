import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export interface DmUiState {
  /** Messaggio mostrato nella statusbar della console. */
  statusMessage: string;
  /** Avviso transitorio mostrato sopra la console. */
  notice: string | null;
  /** Operazione di pagina in corso (cambio campagna, creazione scena, …). */
  busy: boolean;
  /** Token selezionato in mappa o nel pannello destro. */
  selectedTokenId: string | null;
  /** Zoom corrente della scena, usato dalla statusbar. */
  zoom: number;
}

export const initialDmUiState: DmUiState = {
  statusMessage: 'Console pronta.',
  notice: null,
  busy: false,
  selectedTokenId: null,
  zoom: 1,
};

/**
 * Stato effimero della console DM: messaggi, busy, selezione e zoom.
 * Nessuna logica di dominio: la pagina scrive tramite i patch helper e legge
 * le signal direttamente nel template.
 */
export const DmUiStore = signalStore(
  { providedIn: 'root' },
  withState(initialDmUiState),
  withMethods((store) => ({
    setStatusMessage(statusMessage: string): void {
      patchState(store, { statusMessage });
    },

    setNotice(notice: string | null): void {
      patchState(store, { notice });
    },

    setBusy(busy: boolean): void {
      patchState(store, { busy });
    },

    setSelectedTokenId(selectedTokenId: string | null): void {
      patchState(store, { selectedTokenId });
    },

    setZoom(zoom: number): void {
      patchState(store, { zoom });
    },

    reset(): void {
      patchState(store, initialDmUiState);
    },
  })),
);
