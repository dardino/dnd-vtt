import { inject } from '@angular/core';
import type { Actor, Campaign, Scene, Session } from '@dnd-vtt/shared';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { CampaignService } from '../../core/services/campaign.service';

export interface CampaignShellState {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  scenes: Scene[];
  party: Actor[];
  actorAssetUrls: Record<string, string>;
  sessions: Session[];
  activeSession: Session | null;
  loading: boolean;
  /** Ultimo errore di caricamento, utile ai test; il chiamante riceve comunque il throw. */
  error: unknown;
}

export const initialCampaignShell: CampaignShellState = {
  campaigns: [],
  activeCampaign: null,
  scenes: [],
  party: [],
  actorAssetUrls: {},
  sessions: [],
  activeSession: null,
  loading: false,
  error: null,
};

/**
 * Stato condiviso della console DM: campagne, scena attiva nel selettore,
 * attori di campagna, sessioni e ritratti. La pagina resta l'orchestratore di
 * navigazione, realtime e regia; qui vivono solo i dati letti dalle API.
 */
export const CampaignShellStore = signalStore(
  { providedIn: 'root' },
  withState(initialCampaignShell),
  withMethods((store) => {
    const campaignsApi = inject(CampaignService);
    const actorsApi = inject(ActorService);
    const assetsApi = inject(AssetService);
    let pending = 0;

    const track = async <T>(operation: () => Promise<T>): Promise<T> => {
      pending += 1;
      patchState(store, { loading: true, error: null });
      try {
        return await operation();
      } catch (error) {
        patchState(store, { error });
        throw error;
      } finally {
        pending -= 1;
        if (pending === 0) {
          patchState(store, { loading: false });
        }
      }
    };

    const loadActorAssets = async (actors: Actor[]): Promise<void> => {
      const ids = [...new Set(
        actors
          .map((actor) => actor.imageAssetId)
          .filter((id): id is string => id !== null),
      )];
      const entries = await Promise.all(ids.map(async (id) => {
        try {
          const asset = await assetsApi.get(id);
          return [id, asset.url] as const;
        } catch {
          return null;
        }
      }));
      const urls: Record<string, string> = {};
      for (const entry of entries) {
        if (entry !== null) {
          urls[entry[0]] = entry[1];
        }
      }
      patchState(store, { actorAssetUrls: urls });
    };

    return {
      setCampaigns(campaigns: Campaign[]): void {
        patchState(store, { campaigns });
      },

      addCampaign(campaign: Campaign): void {
        patchState(store, { campaigns: [...store.campaigns(), campaign] });
      },

      setActiveCampaign(campaign: Campaign): void {
        patchState(store, { activeCampaign: campaign });
      },

      prependScene(scene: Scene): void {
        patchState(store, { scenes: [scene, ...store.scenes()] });
      },

      removeScene(sceneId: string): void {
        patchState(store, {
          scenes: store.scenes().filter((scene) => scene.id !== sceneId),
        });
      },

      addActor(actor: Actor): void {
        patchState(store, { party: [...store.party(), actor] });
      },

      setActiveSession(session: Session | null): void {
        patchState(store, { activeSession: session });
      },

      async loadCampaigns(): Promise<Campaign[]> {
        return track(async () => {
          const campaigns = await campaignsApi.list();
          patchState(store, { campaigns });
          return campaigns;
        });
      },

      /** Seleziona una campagna esistente e la rende attiva. */
      async selectCampaign(id: string): Promise<Campaign> {
        return track(async () => {
          const campaign = await campaignsApi.get(id);
          patchState(store, { activeCampaign: campaign });
          return campaign;
        });
      },

      async loadScenes(campaignId: string): Promise<Scene[]> {
        return track(async () => {
          const scenes = await campaignsApi.listScenes(campaignId);
          patchState(store, { scenes });
          return scenes;
        });
      },

      /** Carica il party e risolve in parallelo gli URL dei ritratti. */
      async loadActors(campaignId: string): Promise<Actor[]> {
        return track(async () => {
          const party = await actorsApi.listByCampaign(campaignId);
          patchState(store, { party });
          await loadActorAssets(party);
          return party;
        });
      },

      /** Carica le sessioni e deduce quella aperta (`endedAt === null`). */
      async loadSessions(campaignId: string): Promise<Session[]> {
        return track(async () => {
          const sessions = await campaignsApi.listSessions(campaignId);
          patchState(store, {
            sessions,
            activeSession: sessions.find((session) => session.endedAt === null) ?? null,
          });
          return sessions;
        });
      },

      async startSession(campaignId: string): Promise<Session> {
        return track(async () => {
          const session = await campaignsApi.startSession(campaignId);
          patchState(store, {
            activeSession: session,
            sessions: [
              session,
              ...store.sessions().filter((entry) => entry.id !== session.id),
            ],
          });
          return session;
        });
      },

      async stopSession(campaignId: string): Promise<Session> {
        return track(async () => {
          const session = await campaignsApi.stopSession(campaignId);
          patchState(store, {
            activeSession: null,
            sessions: store.sessions()
              .map((entry) => (entry.id === session.id ? session : entry)),
          });
          return session;
        });
      },
    };
  }),
);
