import { HttpErrorResponse } from '@angular/common/http';
import type { Actor } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ASSET_ID,
  CAMPAIGN_ID,
  CREATED_SCENE_ID,
  MAP_ID,
  SCENE_ID,
  asset,
  campaign,
  createDmCampaignStoreHarness,
  mapDocument,
  mapSummary,
  scene,
  type DmCampaignStoreHarness,
} from './dm-campaign.store.fixtures';

let h: DmCampaignStoreHarness;
const store = () => h.store;

describe('DmCampaignStore', () => {
  beforeEach(() => {
    h = createDmCampaignStoreHarness();
  });

  it('start senza campagne apre la creazione', async () => {
    await store().start();

    expect(h.loadCampaigns).toHaveBeenCalled();
    expect(store().mode()).toBe('create');
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('start con campagne senza ultima scelta apre la scelta', async () => {
    h.loadCampaigns.mockResolvedValue([campaign()]);

    await store().start();

    expect(store().mode()).toBe('choose');
  });

  it('start con ruolo diverso da dm apre il login', async () => {
    h.authRefresh.mockResolvedValue('none');

    await store().start();

    expect(store().mode()).toBe('login');
    expect(h.loadCampaigns).not.toHaveBeenCalled();
  });

  it('start senza server imposta error', async () => {
    h.loadCampaigns.mockRejectedValue(new Error('boom'));

    await store().start();

    expect(store().mode()).toBe('error');
  });

  it('enterCampaign carica scena, attori, regia, dadi, sessione e IA', async () => {
    const target = campaign();
    h.activeCampaign.set(target);
    h.selectCampaign.mockResolvedValue(target);
    h.loadScenes.mockResolvedValue([scene()]);
    h.assetGet.mockResolvedValue(asset());

    await store().enterCampaign(CAMPAIGN_ID, CAMPAIGN_ID);

    expect(h.resetVolatile).toHaveBeenCalled();
    expect(h.lastWrite).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.loadActors).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.loadScreens).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.diceLoad).not.toHaveBeenCalled();
    expect(h.loadProgram).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.connectDm).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.loadSessions).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.auxLoad).toHaveBeenCalled();
    expect(h.sessionSync).toHaveBeenCalledWith(null);
    expect(h.restore).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.actionStart).toHaveBeenCalledWith(CAMPAIGN_ID, SCENE_ID);
    expect(store().activeScene()).toEqual(scene());
    expect(store().mapImage()).toBeNull();
    expect(store().mode()).toBe('ready');
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('enterCampaign sceglie la prima scena e naviga se la route è diversa', async () => {
    h.selectCampaign.mockResolvedValue(campaign({ activeSceneId: null }));
    h.loadScenes.mockResolvedValue([scene()]);
    h.campaignPatch.mockResolvedValue(campaign({ activeSceneId: SCENE_ID }));

    await store().enterCampaign(CAMPAIGN_ID);

    expect(h.campaignPatch).toHaveBeenCalledWith(CAMPAIGN_ID, { activeSceneId: SCENE_ID });
    expect(h.setActiveCampaign).toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith(
      ['/dm/campaigns', CAMPAIGN_ID],
      { replaceUrl: true },
    );
  });

  it('enterCampaign senza scene ferma le azioni e svuota la scena', async () => {
    h.selectCampaign.mockResolvedValue(campaign({ activeSceneId: null }));

    await store().enterCampaign(CAMPAIGN_ID, CAMPAIGN_ID);

    expect(h.actionStop).toHaveBeenCalled();
    expect(store().activeScene()).toBeNull();
    expect(store().mapImage()).toBeNull();
    expect(store().mode()).toBe('ready');
  });

  it('loadScene carica snapshot e mappa, con fallback se l’asset manca', async () => {
    h.activeCampaign.set(campaign());
    h.assetGet.mockRejectedValue(new Error('boom'));
    const withImage = scene({ imageAssetId: ASSET_ID });

    await store().loadScene(withImage);

    expect(h.sceneClear).toHaveBeenCalled();
    expect(h.sceneLoad).toHaveBeenCalledWith(SCENE_ID);
    expect(h.actionStart).toHaveBeenCalledWith(CAMPAIGN_ID, SCENE_ID);
    expect(store().activeScene()).toEqual(withImage);
    expect(store().mapImage()).toBeNull();
    expect(h.setNotice).toHaveBeenCalledWith('La mappa della scena non è disponibile.');
  });

  it('loadMapAsset risolve l’immagine e la marca tiled oltre la soglia', async () => {
    h.assetGet.mockResolvedValue({ ...asset(), width: 2400, height: 1200 });

    await store().loadMapAsset(scene({ imageAssetId: ASSET_ID }));

    expect(store().mapImage()).toEqual({
      url: '/uploads/map.webp',
      previewUrl: '/uploads/map-preview.webp',
      hash: 'a'.repeat(64),
      width: 1400,
      height: 1000,
      imageWidth: 2400,
      imageHeight: 1200,
      tiled: true,
    });
  });

  it('impedisce di eliminare la scena attiva o in onda', () => {
    h.activeCampaign.set(campaign());
    store().activeScene.set(scene());

    store().askDeleteScene(scene());
    expect(store().sceneDeleteTarget()).toBeNull();

    const other = scene({ id: CREATED_SCENE_ID });
    h.onAirSceneIds.mockReturnValue(new Set([CREATED_SCENE_ID]));
    store().askDeleteScene(other);
    expect(store().sceneDeleteTarget()).toBeNull();
  });

  it('confirmDeleteScene elimina la scena e la toglie dalla lista', async () => {
    h.activeCampaign.set(campaign());
    store().activeScene.set(scene());
    const other = scene({ id: CREATED_SCENE_ID, name: 'Scena 2' });
    store().sceneDeleteTarget.set(other);
    h.deleteSceneApi.mockResolvedValue(undefined);

    await store().confirmDeleteScene();

    expect(h.deleteSceneApi).toHaveBeenCalledWith(CREATED_SCENE_ID);
    expect(h.removeScene).toHaveBeenCalledWith(CREATED_SCENE_ID);
    expect(h.setStatusMessage).toHaveBeenCalledWith('Scena eliminata: Scena 2');
    expect(store().sceneDeleteTarget()).toBeNull();
  });

  it('un errore di eliminazione mostra il notice e lascia la lista', async () => {
    h.activeCampaign.set(campaign());
    store().activeScene.set(scene());
    const other = scene({ id: CREATED_SCENE_ID, name: 'Scena 2' });
    store().sceneDeleteTarget.set(other);
    h.deleteSceneApi.mockRejectedValue(new HttpErrorResponse({ status: 404 }));

    await store().confirmDeleteScene();

    expect(h.setNotice).toHaveBeenCalled();
    expect(h.removeScene).not.toHaveBeenCalled();
    expect(store().sceneDeleteTarget()).toBeNull();
  });

  it('se elimina la scena attiva per race riallinea la campagna', async () => {
    h.activeCampaign.set(campaign());
    store().activeScene.set(scene());
    store().sceneDeleteTarget.set(scene());
    h.deleteSceneApi.mockResolvedValue(undefined);
    h.campaignGet.mockResolvedValue(campaign({ activeSceneId: null }));

    await store().confirmDeleteScene();

    expect(h.actionStop).toHaveBeenCalled();
    expect(h.sceneClear).toHaveBeenCalled();
    expect(store().activeScene()).toBeNull();
    expect(h.campaignGet).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(h.setActiveCampaign).toHaveBeenCalled();
  });

  it('selectScene aggiorna la campagna e ricarica, ignorando la scena corrente', async () => {
    h.activeCampaign.set(campaign());
    store().activeScene.set(scene());
    h.campaignPatch.mockResolvedValue(campaign());

    await store().selectScene(scene());
    expect(h.campaignPatch).not.toHaveBeenCalled();

    const other = scene({ id: CREATED_SCENE_ID });
    await store().selectScene(other);

    expect(h.campaignPatch).toHaveBeenCalledWith(CAMPAIGN_ID, { activeSceneId: CREATED_SCENE_ID });
    expect(h.sceneLoad).toHaveBeenCalledWith(CREATED_SCENE_ID);
  });

  it('changeAdvancementMode aggiorna la campagna e ignora valori non validi', async () => {
    h.activeCampaign.set(campaign());
    h.campaignPatch.mockResolvedValue(campaign({ advancementMode: 'xp' }));

    await store().changeAdvancementMode({ target: { value: 'xp' } } as unknown as Event);

    expect(h.campaignPatch).toHaveBeenCalledWith(CAMPAIGN_ID, { advancementMode: 'xp' });
    expect(h.setActiveCampaign).toHaveBeenCalled();
    expect(h.setStatusMessage).toHaveBeenCalledWith('Avanzamento: XP');

    await store().changeAdvancementMode({ target: { value: 'altro' } } as unknown as Event);
    expect(h.campaignPatch).toHaveBeenCalledTimes(1);
  });

  it('apre e chiude il map picker caricando le mappe', async () => {
    h.activeCampaign.set(campaign());
    h.mapsList.mockResolvedValue([mapSummary()]);

    await store().openMapPicker();
    expect(store().maps()).toHaveLength(1);
    expect(store().mapPickerOpen()).toBe(true);
    expect(store().mapsLoading()).toBe(false);

    store().closeMapPicker();
    expect(store().mapPickerOpen()).toBe(false);
  });

  it('chooseMap prepara documento e assegnazioni', async () => {
    h.activeCampaign.set(campaign());
    h.mapsGet.mockResolvedValue({ ...mapDocument(), id: MAP_ID });

    await store().chooseMap(mapSummary());

    expect(store().prepareMap()).toEqual(mapSummary());
    expect(store().prepareDoc()).toEqual(mapDocument());
    expect(store().prepareName()).toBe('Mappa cripta');
    expect(store().prepareAssignments()).toEqual({});
    expect(store().mapPickerOpen()).toBe(false);
  });

  it('chooseMap assegna i PG ai punti di partenza', async () => {
    h.activeCampaign.set(campaign());
    h.mapsGet.mockResolvedValue({
      ...mapDocument(),
      id: MAP_ID,
      playerStarts: [
        { id: 'start-1', x: 1, y: 1, label: 'A' },
        { id: 'start-2', x: 2, y: 2, label: 'B' },
      ],
    });
    h.party.set([
      { id: 'pc-1', campaignId: CAMPAIGN_ID, kind: 'pc', name: 'Aria' } as Actor,
      { id: 'pc-2', campaignId: CAMPAIGN_ID, kind: 'pc', name: 'Borin' } as Actor,
    ]);

    await store().chooseMap(mapSummary());

    expect(store().prepareAssignments()).toEqual({
      'pc-1': 'start-1',
      'pc-2': 'start-2',
    });
  });

  it('applyAssignment aggiunge e rimuove un PG', () => {
    store().applyAssignment({ actorId: 'actor-1', startId: 'start-1' });
    expect(store().prepareAssignments()).toEqual({ 'actor-1': 'start-1' });

    store().applyAssignment({ actorId: 'actor-1', startId: '' });
    expect(store().prepareAssignments()).toEqual({});
  });

  it('startPreparedMap crea la scena dalla mappa e la carica', async () => {
    h.activeCampaign.set(campaign());
    store().prepareMap.set(mapSummary());
    store().prepareName.set('Ingresso');
    store().applyAssignment({ actorId: 'actor-1', startId: 'start-1' });
    h.mapsCreateScene.mockResolvedValue({ sceneId: CREATED_SCENE_ID });
    h.campaignGet.mockResolvedValue(campaign({ activeSceneId: CREATED_SCENE_ID }));
    h.loadScenes.mockResolvedValue([scene({ id: CREATED_SCENE_ID })]);

    await store().startPreparedMap();

    expect(h.mapsCreateScene).toHaveBeenCalledWith(CAMPAIGN_ID, {
      mapId: MAP_ID,
      name: 'Ingresso',
      playerAssignments: [{ actorId: 'actor-1', startId: 'start-1' }],
    });
    expect(store().prepareMap()).toBeNull();
    expect(store().activeScene()?.id).toBe(CREATED_SCENE_ID);
    expect(h.setStatusMessage).toHaveBeenCalledWith('Scena avviata: Mappa cripta');
    expect(store().prepareBusy()).toBe(false);
  });

  it('un 404 in ingresso torna alla scelta e mostra il notice', async () => {
    h.campaigns.set([campaign()]);
    h.selectCampaign.mockRejectedValue(new HttpErrorResponse({ status: 404 }));

    await store().enterCampaign(CAMPAIGN_ID, CAMPAIGN_ID);

    expect(h.lastClear).toHaveBeenCalled();
    expect(h.setNotice).toHaveBeenCalledWith('La campagna non esiste più.');
    expect(store().mode()).toBe('choose');
    expect(h.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('createCampaign ignora un nome vuoto e crea altrimenti', async () => {
    await store().createCampaign({ name: '  ', description: '', advancementMode: 'xp' });
    expect(h.campaignCreate).not.toHaveBeenCalled();

    const created = campaign({ id: CREATED_SCENE_ID });
    h.campaignCreate.mockResolvedValue(created);
    h.selectCampaign.mockResolvedValue(created);
    await store().createCampaign({ name: ' Nuova ', description: 'test', advancementMode: 'xp' });

    expect(h.campaignCreate).toHaveBeenCalledWith({
      name: 'Nuova',
      description: 'test',
      advancementMode: 'xp',
      fogDefault: 'hidden',
    });
    expect(h.addCampaign).toHaveBeenCalledWith(created);
  });
});
