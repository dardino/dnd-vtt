import { inject } from '@angular/core';
import type { CampaignExport, ImportResult, MonsterStatblock } from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { ActorService } from '../../core/services/actor.service';
import { AiService } from '../../core/services/ai.service';
import { CampaignService } from '../../core/services/campaign.service';
import { httpMessage } from '../../core/api/http-error';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';

export interface DmAuxState {
  /** Provider IA configurato sul server. */
  aiEnabled: boolean;
  /** Messaggio di stato del provider IA. */
  aiMessage: string;
  /** Statblock incollato dal DM. */
  aiText: string;
  /** Richiesta IA o creazione attore in corso. */
  aiBusy: boolean;
  /** Statblock analizzato in attesa di conferma. */
  aiPreview: MonsterStatblock | null;
  /** Nome da assegnare al mostro creato dalla preview. */
  aiName: string;
  /** Includi le note private dei giocatori nell'export. */
  includePrivateNotes: boolean;
}

export const DEFAULT_MONSTER_NAME = 'Mostro importato';

export const initialDmAuxState: DmAuxState = {
  aiEnabled: false,
  aiMessage: 'Chat IA non configurata.',
  aiText: '',
  aiBusy: false,
  aiPreview: null,
  aiName: DEFAULT_MONSTER_NAME,
  includePrivateNotes: false,
};

const AUX_ERROR = {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
    413: 'Il file supera il limite di upload.',
    415: 'Formato non supportato: usa PNG, JPEG o WebP.',
  },
} as const;

/** Nome file derivato dal nome campagna, senza caratteri non portabili. */
const exportFileName = (name: string): string => `${name.replaceAll(/[^\w-]+/g, '-')}.json`;

/**
 * Funzioni accessorie della console DM: analisi IA degli statblock, creazione
 * del mostro e export/import della campagna. Lo stato degli input vive qui, gli
 * handler degli eventi restano nella pagina.
 */
export const DmAuxStore = signalStore(
  { providedIn: 'root' },
  withState(initialDmAuxState),
  withMethods((store) => {
    const ai = inject(AiService);
    const actorsApi = inject(ActorService);
    const campaignsApi = inject(CampaignService);
    const shell = inject(CampaignShellStore);
    const ui = inject(DmUiStore);

    const campaignName = (campaignId: string): string => {
      const active = shell.activeCampaign();
      if (active !== null && active.id === campaignId) {
        return active.name;
      }
      return shell.campaigns().find((campaign) => campaign.id === campaignId)?.name ?? 'campagna';
    };

    const download = (bundle: CampaignExport, campaignId: string): void => {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFileName(campaignName(campaignId));
      anchor.click();
      URL.revokeObjectURL(url);
    };

    return {
      /** Legge lo stato del provider IA all'ingresso in campagna. */
      async load(): Promise<void> {
        const status = await ai.status();
        patchState(store, { aiEnabled: status.enabled, aiMessage: status.message });
      },

      setText(aiText: string): void {
        patchState(store, { aiText });
      },

      setName(aiName: string): void {
        patchState(store, { aiName });
      },

      setIncludePrivateNotes(includePrivateNotes: boolean): void {
        patchState(store, { includePrivateNotes });
      },

      /** Analizza lo statblock incollato e prepara la preview. */
      async analyze(campaignId: string): Promise<void> {
        const text = store.aiText().trim();
        if (text === '' || store.aiBusy()) {
          return;
        }
        patchState(store, { aiBusy: true });
        try {
          const result = await ai.parseStatblock(campaignId, text);
          patchState(store, { aiPreview: result.statblock });
          ui.setStatusMessage('Statblock analizzato: controlla e crea il mostro.');
        } catch (error) {
          ui.setNotice(httpMessage(error, AUX_ERROR));
        } finally {
          patchState(store, { aiBusy: false });
        }
      },

      /** Crea l'attore mostro dalla preview e pulisce gli input. */
      async createMonster(campaignId: string): Promise<void> {
        const statblock = store.aiPreview();
        if (statblock === null || store.aiBusy()) {
          return;
        }
        patchState(store, { aiBusy: true });
        try {
          const name = store.aiName().trim();
          const actor = await actorsApi.createActor({
            campaignId,
            kind: 'monster',
            name: name === '' ? DEFAULT_MONSTER_NAME : name,
            statblock,
          });
          shell.addActor(actor);
          patchState(store, { aiPreview: null, aiText: '' });
          ui.setStatusMessage(`Creato: ${actor.name}`);
        } catch (error) {
          ui.setNotice(httpMessage(error, AUX_ERROR));
        } finally {
          patchState(store, { aiBusy: false });
        }
      },

      /** Esporta la campagna e avvia il download del bundle JSON. */
      async export(campaignId: string): Promise<void> {
        try {
          const bundle = await campaignsApi.exportCampaign(
            campaignId,
            store.includePrivateNotes(),
          );
          download(bundle, campaignId);
          ui.setStatusMessage('Campagna esportata');
        } catch (error) {
          ui.setNotice(httpMessage(error, AUX_ERROR));
        }
      },

      /** Importa il file scelto; errori e notifiche restano al chiamante. */
      async import(file: File): Promise<ImportResult> {
        const bundle = JSON.parse(await file.text()) as CampaignExport;
        return campaignsApi.importCampaign(bundle);
      },
    };
  }),
);
