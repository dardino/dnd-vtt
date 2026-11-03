import { inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  isTiledMap,
  type MapDocument,
  type MapSummary,
  type Scene,
} from '@dnd-vtt/shared';
import { signalStore, withMethods, withProps } from '@ngrx/signals';
import { ActionStore } from '../../core/action.store';
import { AssetService } from '../../core/asset.service';
import { AuthService } from '../../core/auth.service';
import { CampaignService } from '../../core/campaign.service';
import { DiceStore } from '../../core/dice.store';
import { httpMessage } from '../../core/http-error';
import { LastCampaignService } from '../../core/last-campaign.service';
import { MapService } from '../../core/map.service';
import { RealtimeService } from '../../core/realtime.service';
import { SceneStore } from '../../core/scene.store';
import type { SceneMapImage } from '../scene/scene-canvas.component';
import { CampaignShellStore } from './campaign-shell.store';
import type { CreateCampaignValues } from './create-campaign-dialog';
import { DmAuxStore } from './dm-aux.store';
import { DmLayoutStore } from './dm-layout.store';
import { DmSessionStore } from './dm-session.store';
import { toMapDocument } from './dm-campaign.mapper';
import { DmUiStore } from './dm-ui.store';
import type { PrepareSceneAssignment } from './prepare-scene-dialog';
import { RegiaStore } from './regia.store';
import { SceneToolsStore } from './scene-tools.store';

export type ShellMode = 'loading' | 'login' | 'create' | 'choose' | 'ready' | 'error';

/**
 * Ciclo di vita campagna/scena della console DM: autenticazione iniziale,
 * scelta/creazione campagna, ingresso, cambio scena e preparazione di una
 * scena da mappa. Il canvas, l'input file e il cleanup della pagina restano
 * fuori; qui vivono solo lo stato e l'orchestrazione dei servizi.
 */
export const DmCampaignStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    /** Fase della console: login, scelta campagna, creazione o tavolo pronto. */
    mode: signal<ShellMode>('loading'),
    /** Scena mostrata nel canvas e usata da fog/token/statusbar. */
    activeScene: signal<Scene | null>(null),
    /** Asset della mappa della scena attiva, risolto da `loadMapAsset`. */
    mapImage: signal<SceneMapImage | null>(null),
    /** Fog applicata alle scene create da qui in avanti. */
    newSceneFog: signal<'hidden' | 'revealed'>('hidden'),
    maps: signal<MapSummary[]>([]),
    mapsLoading: signal(false),
    mapPickerOpen: signal(false),
    prepareMap: signal<MapSummary | null>(null),
    prepareDoc: signal<MapDocument | null>(null),
    prepareName: signal(''),
    prepareAssignments: signal<Record<string, string>>({}),
    prepareBusy: signal(false),
    settingsOpen: signal(false),
    diceOpen: signal(false),
  })),
  withMethods((store) => {
    const auth = inject(AuthService);
    const campaignsApi = inject(CampaignService);
    const assetsApi = inject(AssetService);
    const lastCampaign = inject(LastCampaignService);
    const router = inject(Router);
    const sceneStore = inject(SceneStore);
    const actions = inject(ActionStore);
    const regia = inject(RegiaStore);
    const dice = inject(DiceStore);
    const realtime = inject(RealtimeService);
    const shell = inject(CampaignShellStore);
    const layout = inject(DmLayoutStore);
    const session = inject(DmSessionStore);
    const aux = inject(DmAuxStore);
    const ui = inject(DmUiStore);
    const mapsApi = inject(MapService);
    const sceneTools = inject(SceneToolsStore);

    const loadMapAsset = async (scene: Scene): Promise<void> => {
      if (scene.imageAssetId === null) {
        store.mapImage.set(null);
        return;
      }
      try {
        const asset = await assetsApi.get(scene.imageAssetId);
        store.mapImage.set({
          url: asset.url,
          previewUrl: asset.previewUrl,
          hash: asset.hash,
          width: scene.widthPx,
          height: scene.heightPx,
          imageWidth: asset.width,
          imageHeight: asset.height,
          tiled: isTiledMap(asset.width, asset.height),
        });
      } catch {
        store.mapImage.set(null);
        ui.setNotice('La mappa della scena non è disponibile.');
      }
    };

    const loadScene = async (scene: Scene): Promise<void> => {
      store.activeScene.set(scene);
      ui.setSelectedTokenId(null);
      sceneTools.setMeasure(null);
      sceneStore.clear();
      await sceneStore.load(scene.id);
      const campaign = shell.activeCampaign();
      if (campaign !== null) {
        actions.start(campaign.id, scene.id);
        layout.restore(campaign.id);
      }
      await loadMapAsset(scene);
    };

    const enterCampaign = async (id: string, routeCampaignId?: string): Promise<void> => {
      ui.setBusy(true);
      try {
        const campaign = await shell.selectCampaign(id);
        sceneTools.resetVolatile();
        store.newSceneFog.set(campaign.fogDefault);
        lastCampaign.write(campaign.id);
        ui.setNotice(null);
        layout.restore(campaign.id);
        const scenes = await shell.loadScenes(campaign.id);
        await shell.loadActors(campaign.id);
        await regia.loadScreens(campaign.id);
        await dice.load(campaign.id);
        await regia.loadProgram(campaign.id);
        realtime.connectDm(campaign.id);
        await shell.loadSessions(campaign.id);
        await aux.load();
        session.sync(shell.activeSession());
        const target = scenes.find((scene) => scene.id === campaign.activeSceneId) ?? scenes[0];
        if (target !== undefined) {
          if (campaign.activeSceneId !== target.id) {
            const updated = await campaignsApi.patch(campaign.id, { activeSceneId: target.id });
            shell.setActiveCampaign(updated);
          }
          await loadScene(target);
        } else {
          actions.stop();
          store.activeScene.set(null);
          store.mapImage.set(null);
        }
        if (routeCampaignId !== campaign.id) {
          await router.navigate(['/dm/campaigns', campaign.id], { replaceUrl: true });
        }
        store.mode.set('ready');
      } catch (error) {
        lastCampaign.clear();
        ui.setNotice(messageFor(error));
        store.mode.set(shell.campaigns().length === 0 ? 'create' : 'choose');
      } finally {
        ui.setBusy(false);
      }
    };

    const openCampaign = async (requestedId?: string): Promise<void> => {
      const campaigns = await shell.loadCampaigns();
      const fromRoute = requestedId === undefined
        ? undefined
        : campaigns.find((campaign) => campaign.id === requestedId);
      if (requestedId !== undefined && fromRoute === undefined) {
        lastCampaign.clear();
        ui.setNotice('La campagna richiesta non esiste più.');
      }
      const remembered = lastCampaign.read();
      const target = fromRoute ?? campaigns.find((campaign) => campaign.id === remembered);
      if (target !== undefined) {
        await enterCampaign(target.id, requestedId);
        return;
      }
      store.mode.set(campaigns.length === 0 ? 'create' : 'choose');
    };

    const closePrepare = (): void => {
      store.prepareMap.set(null);
      store.prepareDoc.set(null);
      store.prepareAssignments.set({});
    };

    return {
      /** Riporta la console allo stato iniziale alla distruzione della pagina. */
      reset(): void {
        store.mode.set('loading');
        store.activeScene.set(null);
        store.mapImage.set(null);
        store.newSceneFog.set('hidden');
        store.maps.set([]);
        store.mapsLoading.set(false);
        store.mapPickerOpen.set(false);
        store.prepareMap.set(null);
        store.prepareDoc.set(null);
        store.prepareName.set('');
        store.prepareAssignments.set({});
        store.prepareBusy.set(false);
        store.settingsOpen.set(false);
        store.diceOpen.set(false);
      },

      /** Verifica la sessione DM e apre la campagna richiesta o l'ultima usata. */
      async start(campaignId?: string): Promise<void> {
        try {
          const role = await auth.refresh();
          if (role !== 'dm') {
            store.mode.set('login');
            return;
          }
          await openCampaign(campaignId);
        } catch {
          store.mode.set('error');
        }
      },
      openCampaign,

      enterCampaign,

      loadScene,

      loadMapAsset,

      /** Crea la campagna, la aggiunge allo shell e vi entra subito. */
      async createCampaign(values: CreateCampaignValues): Promise<void> {
        const name = values.name.trim();
        if (name === '') {
          return;
        }
        ui.setBusy(true);
        try {
          const created = await campaignsApi.create({
            name,
            description: values.description.trim(),
            advancementMode: values.advancementMode,
            fogDefault: 'hidden',
          });
          shell.addCampaign(created);
          await enterCampaign(created.id);
        } catch (error) {
          ui.setNotice(messageFor(error));
        } finally {
          ui.setBusy(false);
        }
      },
      /** Crea una scena vuota, la rende attiva e la carica nel canvas. */
      async createScene(): Promise<void> {
        const campaign = shell.activeCampaign();
        if (campaign === null) {
          return;
        }
        ui.setBusy(true);
        try {
          const scene = await campaignsApi.createScene(campaign.id, {
            name: `Scena ${shell.scenes().length + 1}`,
            widthPx: 1920,
            heightPx: 1080,
            fogBase: store.newSceneFog(),
          });
          shell.prependScene(scene);
          const refreshed = await campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
          shell.setActiveCampaign(refreshed);
          ui.setStatusMessage(`Scena creata: ${scene.name}`);
          await loadScene(scene);
        } catch (error) {
          ui.setNotice(messageFor(error));
        } finally {
          ui.setBusy(false);
        }
      },
      /** Cambia scena attiva sulla campagna e ricarica lo snapshot. */
      async selectScene(scene: Scene): Promise<void> {
        const campaign = shell.activeCampaign();
        if (campaign === null || scene.id === store.activeScene()?.id) {
          return;
        }
        ui.setStatusMessage(`Scena: ${scene.name}`);
        try {
          const updated = await campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
          shell.setActiveCampaign(updated);
          await loadScene(scene);
        } catch (error) {
          ui.setNotice(messageFor(error));
        }
      },
      async openMapPicker(): Promise<void> {
        const campaign = shell.activeCampaign();
        if (campaign === null) {
          return;
        }
        store.mapsLoading.set(true);
        store.mapPickerOpen.set(true);
        try {
          store.maps.set(await mapsApi.list(campaign.id));
        } catch (error) {
          ui.setNotice(messageFor(error));
        } finally {
          store.mapsLoading.set(false);
        }
      },
      closeMapPicker(): void {
        store.mapPickerOpen.set(false);
      },
      /** Carica la mappa scelta e prepara le assegnazioni dei PG. */
      async chooseMap(map: MapSummary): Promise<void> {
        const campaign = shell.activeCampaign();
        if (campaign === null) {
          return;
        }
        try {
          const doc = await mapsApi.get(map.id);
          const assignments: Record<string, string> = {};
          const pcs = shell.party().filter((actor) => actor.kind === 'pc');
          pcs.forEach((actor, index) => {
            const start = doc.playerStarts[index];
            if (start !== undefined) {
              assignments[actor.id] = start.id;
            }
          });
          store.prepareMap.set(map);
          store.prepareDoc.set(toMapDocument(doc));
          store.prepareName.set(doc.name);
          store.prepareAssignments.set(assignments);
          store.mapPickerOpen.set(false);
          ui.setNotice(null);
        } catch (error) {
          ui.setNotice(messageFor(error));
        }
      },
      closePrepare,

      applyAssignment(change: PrepareSceneAssignment): void {
        const next = { ...store.prepareAssignments() };
        if (change.startId === '') {
          delete next[change.actorId];
        } else {
          next[change.actorId] = change.startId;
        }
        store.prepareAssignments.set(next);
      },
      /** Crea la scena dalla mappa con le assegnazioni correnti. */
      async startPreparedMap(): Promise<void> {
        const campaign = shell.activeCampaign();
        const map = store.prepareMap();
        if (campaign === null || map === null || store.prepareBusy()) {
          return;
        }
        const assignments = store.prepareAssignments();
        store.prepareBusy.set(true);
        try {
          const result = await mapsApi.createScene(campaign.id, {
            mapId: map.id,
            name: store.prepareName().trim() || map.name,
            playerAssignments: Object.entries(assignments).map(([actorId, startId]) => ({
              actorId,
              startId,
            })),
          });
          const updated = await campaignsApi.get(campaign.id);
          shell.setActiveCampaign(updated);
          const scenes = await shell.loadScenes(campaign.id);
          const scene = scenes.find((entry) => entry.id === result.sceneId);
          closePrepare();
          if (scene !== undefined) {
            await loadScene(scene);
          }
          ui.setStatusMessage(`Scena avviata: ${map.name}`);
        } catch (error) {
          ui.setNotice(messageFor(error));
        } finally {
          store.prepareBusy.set(false);
        }
      },
      setNewSceneFog(event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        if (value === 'hidden' || value === 'revealed') {
          store.newSceneFog.set(value);
        }
      },
      /** Cambia la modalità di avanzamento della campagna attiva. */
      async changeAdvancementMode(event: Event): Promise<void> {
        const campaign = shell.activeCampaign();
        const mode = (event.target as HTMLSelectElement).value;
        if (campaign === null || (mode !== 'milestone' && mode !== 'xp')) {
          return;
        }
        try {
          const updated = await campaignsApi.patch(campaign.id, { advancementMode: mode });
          shell.setActiveCampaign(updated);
          ui.setStatusMessage(`Avanzamento: ${mode === 'xp' ? 'XP' : 'milestone'}`);
        } catch (error) {
          ui.setNotice(messageFor(error));
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
