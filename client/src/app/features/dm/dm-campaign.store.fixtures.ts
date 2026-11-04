import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  createDefaultSceneState,
  defaultBackgroundTransform,
  DEFAULT_MAP_BACKGROUND_COLOR,
  type Actor,
  type Asset,
  type Campaign,
  type MapDocument,
  type MapSummary,
  type Scene,
  type SceneSnapshot,
  type Session,
} from '@dnd-vtt/shared';
import { vi } from 'vitest';
import { ActionStore } from '../../core/stores/action.store';
import { AssetService } from '../../core/services/asset.service';
import { AuthService } from '../../core/auth/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import { DiceStore } from '../../core/stores/dice.store';
import { LastCampaignService } from '../../core/services/last-campaign.service';
import { MapService } from '../../core/services/map.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmAuxStore } from './dm-aux.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmLayoutStore } from './dm-layout.store';
import { DmSessionStore } from './dm-session.store';
import { DmUiStore } from './dm-ui.store';
import { RegiaStore } from './regia.store';
import { SceneToolsStore } from './scene-tools.store';

export const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
export const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
export const MAP_ID = '0190f000-0000-7000-8000-000000000003';
export const CREATED_SCENE_ID = '0190f000-0000-7000-8000-000000000004';
export const ASSET_ID = '0190f000-0000-7000-8000-000000000005';

export const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: CAMPAIGN_ID,
  name: 'La Valle',
  description: '',
  activeSceneId: SCENE_ID,
  fogDefault: 'hidden',
  autoApprove: false,
  advancementMode: 'milestone',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

export const scene = (overrides: Partial<Scene> = {}): Scene => ({
  id: SCENE_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Cripta',
  imageAssetId: null,
  backgroundTransform: defaultBackgroundTransform,
  widthPx: 1400,
  heightPx: 1000,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

export const mapDocument = (overrides: Partial<MapDocument> = {}): MapDocument => ({
  name: 'Mappa cripta',
  imageAssetId: null,
  backgroundTransform: defaultBackgroundTransform,
  backgroundColor: DEFAULT_MAP_BACKGROUND_COLOR,
  widthPx: 1400,
  heightPx: 1000,
  grid: createDefaultSceneState().grid,
  terrain: createDefaultSceneState().terrain,
  spawns: [],
  playerStarts: [],
  fogBase: 'hidden',
  showDoorIcons: true,
  notes: '',
  ...overrides,
});

export const mapSummary = (overrides: Partial<MapSummary> = {}): MapSummary => ({
  id: MAP_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Mappa cripta',
  imageAssetId: null,
  imageUrl: null,
  thumbUrl: null,
  backgroundColor: 'rgba(255, 255, 255, 1)',
  widthPx: 1400,
  heightPx: 1000,
  grid: createDefaultSceneState().grid,
  fogBase: 'hidden',
  version: 1,
  walls: 0,
  lights: 0,
  spawns: 0,
  playerStarts: 0,
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

export const asset = (): Asset => ({
  id: ASSET_ID,
  hash: 'a'.repeat(64),
  mime: 'image/png',
  bytes: 1024,
  width: 1400,
  height: 1000,
  url: '/uploads/map.webp',
  previewUrl: '/uploads/map-preview.webp',
  thumbUrl: '/uploads/map-thumb.webp',
  createdAt: '2026-11-01T10:00:00.000Z',
});

export interface DmCampaignStoreHarness {
  store: InstanceType<typeof DmCampaignStore>;
  campaigns: WritableSignal<Campaign[]>;
  activeCampaign: WritableSignal<Campaign | null>;
  scenes: WritableSignal<Scene[]>;
  party: WritableSignal<Actor[]>;
  activeSession: WritableSignal<Session | null>;
  authRefresh: ReturnType<typeof vi.fn>;
  loadCampaigns: ReturnType<typeof vi.fn>;
  selectCampaign: ReturnType<typeof vi.fn>;
  loadScenes: ReturnType<typeof vi.fn>;
  loadActors: ReturnType<typeof vi.fn>;
  loadSessions: ReturnType<typeof vi.fn>;
  addCampaign: ReturnType<typeof vi.fn>;
  setActiveCampaign: ReturnType<typeof vi.fn>;
  prependScene: ReturnType<typeof vi.fn>;
  removeScene: ReturnType<typeof vi.fn>;
  campaignCreate: ReturnType<typeof vi.fn>;
  campaignGet: ReturnType<typeof vi.fn>;
  campaignPatch: ReturnType<typeof vi.fn>;
  deleteSceneApi: ReturnType<typeof vi.fn>;
  onAirSceneIds: ReturnType<typeof vi.fn>;
  assetGet: ReturnType<typeof vi.fn>;
  lastRead: ReturnType<typeof vi.fn>;
  lastWrite: ReturnType<typeof vi.fn>;
  lastClear: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  sceneClear: ReturnType<typeof vi.fn>;
  sceneLoad: ReturnType<typeof vi.fn>;
  sceneSnapshot: WritableSignal<SceneSnapshot | null>;
  actionStart: ReturnType<typeof vi.fn>;
  actionStop: ReturnType<typeof vi.fn>;
  loadScreens: ReturnType<typeof vi.fn>;
  loadProgram: ReturnType<typeof vi.fn>;
  diceLoad: ReturnType<typeof vi.fn>;
  connectDm: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  sessionSync: ReturnType<typeof vi.fn>;
  auxLoad: ReturnType<typeof vi.fn>;
  setBusy: ReturnType<typeof vi.fn>;
  setNotice: ReturnType<typeof vi.fn>;
  setStatusMessage: ReturnType<typeof vi.fn>;
  setSelectedTokenId: ReturnType<typeof vi.fn>;
  resetVolatile: ReturnType<typeof vi.fn>;
  setMeasure: ReturnType<typeof vi.fn>;
  mapsList: ReturnType<typeof vi.fn>;
  mapsGet: ReturnType<typeof vi.fn>;
  mapsCreateScene: ReturnType<typeof vi.fn>;
}

export const createDmCampaignStoreHarness = (): DmCampaignStoreHarness => {
  const campaigns = signal<Campaign[]>([]);
  const activeCampaign = signal<Campaign | null>(null);
  const scenes = signal<Scene[]>([]);
  const party = signal<Actor[]>([]);
  const activeSession = signal<Session | null>(null);
  const sceneSnapshot = signal<SceneSnapshot | null>(null);
  const authRefresh = vi.fn().mockResolvedValue('dm');
  const loadCampaigns = vi.fn().mockResolvedValue([]);
  const selectCampaign = vi.fn();
  const loadScenes = vi.fn().mockResolvedValue([]);
  const loadActors = vi.fn().mockResolvedValue([]);
  const loadSessions = vi.fn().mockResolvedValue([]);
  const addCampaign = vi.fn();
  const setActiveCampaign = vi.fn();
  const prependScene = vi.fn();
  const removeScene = vi.fn();
  const campaignCreate = vi.fn();
  const campaignGet = vi.fn();
  const campaignPatch = vi.fn();
  const deleteSceneApi = vi.fn();
  const onAirSceneIds = vi.fn(() => new Set<string>());
  const assetGet = vi.fn();
  const lastRead = vi.fn().mockReturnValue(null);
  const lastWrite = vi.fn();
  const lastClear = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);
  const sceneClear = vi.fn();
  const sceneLoad = vi.fn().mockResolvedValue(undefined);
  const actionStart = vi.fn();
  const actionStop = vi.fn();
  const loadScreens = vi.fn().mockResolvedValue(undefined);
  const loadProgram = vi.fn().mockResolvedValue(undefined);
  const diceLoad = vi.fn().mockResolvedValue(undefined);
  const connectDm = vi.fn();
  const restore = vi.fn();
  const sessionSync = vi.fn();
  const auxLoad = vi.fn().mockResolvedValue(undefined);
  const setBusy = vi.fn();
  const setNotice = vi.fn();
  const setStatusMessage = vi.fn();
  const setSelectedTokenId = vi.fn();
  const resetVolatile = vi.fn();
  const setMeasure = vi.fn();
  const mapsList = vi.fn().mockResolvedValue([]);
  const mapsGet = vi.fn();
  const mapsCreateScene = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { refresh: authRefresh } },
      {
        provide: CampaignService,
        useValue: {
          create: campaignCreate,
          get: campaignGet,
          patch: campaignPatch,
          deleteScene: deleteSceneApi,
        },
      },
      { provide: AssetService, useValue: { get: assetGet } },
      {
        provide: LastCampaignService,
        useValue: { read: lastRead, write: lastWrite, clear: lastClear },
      },
      { provide: Router, useValue: { navigate } },
      {
        provide: SceneStore,
        useValue: { snapshot: sceneSnapshot, clear: sceneClear, load: sceneLoad },
      },
      { provide: ActionStore, useValue: { start: actionStart, stop: actionStop } },
      { provide: RegiaStore, useValue: { loadScreens, loadProgram, onAirSceneIds } },
      { provide: DiceStore, useValue: { load: diceLoad } },
      { provide: RealtimeService, useValue: { connectDm, disconnect: vi.fn() } },
      {
        provide: CampaignShellStore,
        useValue: {
          campaigns,
          activeCampaign,
          scenes,
          party,
          activeSession,
          loadCampaigns,
          selectCampaign,
          loadScenes,
          loadActors,
          loadSessions,
          addCampaign,
          setActiveCampaign,
          prependScene,
          removeScene,
        },
      },
      { provide: DmLayoutStore, useValue: { restore, dockTab: () => 'initiative' } },
      { provide: DmSessionStore, useValue: { sync: sessionSync } },
      { provide: DmAuxStore, useValue: { load: auxLoad } },
      {
        provide: DmUiStore,
        useValue: { setBusy, setNotice, setStatusMessage, setSelectedTokenId },
      },
      { provide: MapService, useValue: { list: mapsList, get: mapsGet, createScene: mapsCreateScene } },
      { provide: SceneToolsStore, useValue: { resetVolatile, setMeasure } },
    ],
  });

  return {
    store: TestBed.inject(DmCampaignStore),
    campaigns,
    activeCampaign,
    scenes,
    party,
    activeSession,
    authRefresh,
    loadCampaigns,
    selectCampaign,
    loadScenes,
    loadActors,
    loadSessions,
    addCampaign,
    setActiveCampaign,
    prependScene,
    removeScene,
    campaignCreate,
    campaignGet,
    campaignPatch,
    deleteSceneApi,
    onAirSceneIds,
    assetGet,
    lastRead,
    lastWrite,
    lastClear,
    navigate,
    sceneClear,
    sceneLoad,
    sceneSnapshot,
    actionStart,
    actionStop,
    loadScreens,
    loadProgram,
    diceLoad,
    connectDm,
    restore,
    sessionSync,
    auxLoad,
    setBusy,
    setNotice,
    setStatusMessage,
    setSelectedTokenId,
    resetVolatile,
    setMeasure,
    mapsList,
    mapsGet,
    mapsCreateScene,
  };
};
