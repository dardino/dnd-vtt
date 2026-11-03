import { inject } from '@angular/core';
import type { Session } from '@dnd-vtt/shared';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { httpMessage } from '../../core/api/http-error';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';

export interface DmSessionState {
  sessionSeconds: number;
  sessionBusy: boolean;
}

export const initialDmSessionState: DmSessionState = {
  sessionSeconds: 0,
  sessionBusy: false,
};

const SESSION_ERROR = {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
  },
} as const;

/** Secondi trascorsi dall'avvio della sessione, mai negativi. */
const elapsedSeconds = (startedAt: string): number => {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
};

/**
 * Timer e azioni della sessione di gioco della console DM. Il timer vive in
 * un closure dello store (root) e va fermato esplicitamente alla distruzione
 * della pagina con `stopTimer`, per non lasciare `setInterval` orfani.
 */
export const DmSessionStore = signalStore(
  { providedIn: 'root' },
  withState(initialDmSessionState),
  withComputed((store) => ({
    sessionLabel: (): string => {
      const total = store.sessionSeconds();
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      return [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, '0'))
        .join(':');
    },
  })),
  withMethods((store) => {
    const shell = inject(CampaignShellStore);
    const ui = inject(DmUiStore);
    let timer: ReturnType<typeof setInterval> | null = null;

    const clearTimer = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const startTimer = (): void => {
      clearTimer();
      timer = setInterval(() => {
        patchState(store, { sessionSeconds: store.sessionSeconds() + 1 });
      }, 1000);
    };

    return {
      /**
       * Allinea il timer alla sessione attiva (ripresa o azzeramento).
       * Chiamato all'ingresso in campagna.
       */
      sync(active: Session | null): void {
        clearTimer();
        if (active === null) {
          patchState(store, { sessionSeconds: 0 });
          return;
        }
        patchState(store, { sessionSeconds: elapsedSeconds(active.startedAt) });
        startTimer();
      },

      async start(campaignId: string): Promise<void> {
        if (store.sessionBusy()) {
          return;
        }
        patchState(store, { sessionBusy: true });
        try {
          const session = await shell.startSession(campaignId);
          clearTimer();
          patchState(store, { sessionSeconds: 0 });
          startTimer();
          ui.setStatusMessage(`Sessione ${session.number} avviata`);
        } catch (error) {
          ui.setNotice(httpMessage(error, SESSION_ERROR));
        } finally {
          patchState(store, { sessionBusy: false });
        }
      },

      async stop(campaignId: string): Promise<void> {
        if (store.sessionBusy()) {
          return;
        }
        patchState(store, { sessionBusy: true });
        try {
          const session = await shell.stopSession(campaignId);
          clearTimer();
          ui.setStatusMessage(`Sessione ${session.number} terminata`);
        } catch (error) {
          ui.setNotice(httpMessage(error, SESSION_ERROR));
        } finally {
          patchState(store, { sessionBusy: false });
        }
      },

      /** Ferma il timer senza toccare i secondi correnti (ngOnDestroy). */
      stopTimer(): void {
        clearTimer();
      },
    };
  }),
);
