import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { httpMessage } from '../../core/api/http-error';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmUiStore } from './dm-ui.store';
import { RegiaStore, type ScreenSummary } from './regia.store';

export interface DmScreensState {
  /** Dialog "Manda in onda": visibile quando ci sono più schermi online. */
  takeTargetOpen: boolean;
}

export const initialDmScreens: DmScreensState = {
  takeTargetOpen: false,
};

/**
 * Azioni di regia della console DM: apertura di un display, invio della scena
 * attiva su uno o più schermi e blackout. Le chiamate HTTP restano su
 * `RegiaStore`; qui vivono solo la scelta del target e i messaggi di esito.
 */
export const DmScreensStore = signalStore(
  { providedIn: 'root' },
  withState(initialDmScreens),
  withMethods((store) => {
    const regia = inject(RegiaStore);
    const shell = inject(CampaignShellStore);
    const sceneStore = inject(SceneStore);
    const campaign = inject(DmCampaignStore);
    const ui = inject(DmUiStore);

    /** Porta la scena attiva sullo schermo scelto, partendo dalla `startView`. */
    const takeSceneTo = async (summary: ScreenSummary): Promise<void> => {
      const activeCampaign = shell.activeCampaign();
      const scene = campaign.activeScene();
      if (activeCampaign === null || scene === null || regia.busy()) {
        return;
      }
      patchState(store, { takeTargetOpen: false });
      const startView = sceneStore.snapshot()?.state.startView;
      try {
        const display = await regia.takeSceneTo(
          activeCampaign.id,
          scene,
          summary,
          startView,
        );
        ui.setStatusMessage(`In onda su ${display.code}: ${scene.name}`);
      } catch (error) {
        ui.setStatusMessage(messageFor(error));
      }
    };

    return {
      /** Riporta il target di regia allo stato iniziale. */
      reset(): void {
        patchState(store, initialDmScreens);
      },

      /** Crea un display e apre la relativa vista giocatori in una nuova scheda. */
      async openScreen(): Promise<void> {
        const activeCampaign = shell.activeCampaign();
        if (activeCampaign === null || regia.busy()) {
          return;
        }
        try {
          const display = await regia.createDisplay(activeCampaign.id);
          window.open(`/display/${display.code}`, '_blank');
          ui.setStatusMessage(`Schermo aperto: ${display.code}`);
        } catch (error) {
          ui.setStatusMessage(messageFor(error));
        }
      },

      /** Sceglie il target: nessuno, un solo schermo o il dialogo di scelta. */
      takeScene(): void {
        const online = regia.screens();
        if (online.length === 0) {
          ui.setNotice('Nessuno schermo online: apri uno schermo prima di mandare in onda.');
          return;
        }
        if (online.length === 1 && online[0] !== undefined) {
          void takeSceneTo(online[0]);
          return;
        }
        patchState(store, { takeTargetOpen: true });
      },

      takeSceneTo,

      /** Inverte il blackout del program corrente. */
      async toggleBlackout(): Promise<void> {
        const activeCampaign = shell.activeCampaign();
        if (activeCampaign === null || regia.busy()) {
          return;
        }
        try {
          const updated = await regia.putProgram(activeCampaign.id, (state) => ({
            ...state,
            blackout: !state.blackout,
            updatedAt: new Date().toISOString(),
          }));
          ui.setStatusMessage(
            updated.state.blackout ? 'Schermo in blackout' : 'Schermo riacceso',
          );
        } catch (error) {
          ui.setStatusMessage(messageFor(error));
        }
      },
    };
  }),
);

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
    413: 'Il file supera il limite di upload.',
    415: 'Formato non supportato: usa PNG, JPEG o WebP.',
  },
});
