import { TestBed } from '@angular/core/testing';
import type { Actor, Asset, Campaign, Scene, Session } from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorService } from '../../core/services/actor.service';
import { AssetService } from '../../core/services/asset.service';
import { CampaignService } from '../../core/services/campaign.service';
import { CampaignShellStore } from './campaign-shell.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000003';
const ASSET_ID = '0190f000-0000-7000-8000-000000000004';

const campaign = (id = CAMPAIGN_ID, name = 'La Valle'): Campaign => ({
  id,
  name,
  description: '',
  activeSceneId: SCENE_ID,
  fogDefault: 'hidden',
  autoApprove: false,
  advancementMode: 'milestone',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const scene = (): Scene => ({
  id: SCENE_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Ingresso',
  imageAssetId: null,
  backgroundTransform: { x: 0, y: 0, scale: 1 },
  widthPx: 1920,
  heightPx: 1080,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const actor = (): Actor => ({
  id: ACTOR_ID,
  campaignId: CAMPAIGN_ID,
  kind: 'pc',
  name: 'Aria',
  statblock: {
    kind: 'pc',
    size: 'medium',
    abilities: { str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 8 },
    hp: { current: 10, max: 20, temp: 0 },
    speed: { walk: 30 },
    senses: {},
    languages: ['common'],
    conditions: [],
    rulesVersion: 'test',
    class: { id: 'fighter', level: 1 },
    species: { id: 'human' },
    background: { id: 'soldier' },
    abilityGeneration: {
      method: 'pointBuy',
      base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
    },
    abilityIncreases: [],
    proficiencies: {
      saves: ['str', 'con'],
      skills: ['athletics', 'perception'],
      expertise: [],
      tools: [],
      armor: ['light', 'medium', 'heavy', 'shield'],
      weapons: ['simple', 'martial'],
    },
    feats: [],
    weaponMasteries: [],
    resources: [],
    spells: {
      cantrips: [],
      known: [],
      prepared: [],
      alwaysPrepared: [],
      spellbook: [],
      slots: [],
    },
    hitDice: { die: 10, total: 1, used: 0 },
    hpRolls: [],
    deathSaves: { successes: 0, failures: 0 },
    currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
    overrides: {},
    snapshot: { features: [], spells: [], items: [] },
  },
  rulesVersion: 'test',
  xp: 0,
  sheetVersion: 1,
  dmNotes: null,
  imageAssetId: ASSET_ID,
  portrait: null,
  hp: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const session = (id: string, endedAt: string | null): Session => ({
  id,
  campaignId: CAMPAIGN_ID,
  number: 1,
  startedAt: '2026-11-01T10:00:00.000Z',
  endedAt,
  durationSeconds: null,
  notes: null,
});

const asset = (url: string): Asset => ({
  id: ASSET_ID,
  url,
  previewUrl: url,
  thumbUrl: url,
  hash: 'a'.repeat(64),
  mime: 'image/png',
  bytes: 128,
  width: 64,
  height: 64,
  createdAt: '2026-11-01T10:00:00.000Z',
});

interface CampaignApiFake {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  listScenes: ReturnType<typeof vi.fn>;
  createScene: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  updateScene: ReturnType<typeof vi.fn>;
  getSnapshot: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  stopSession: ReturnType<typeof vi.fn>;
  exportCampaign: ReturnType<typeof vi.fn>;
  importCampaign: ReturnType<typeof vi.fn>;
}

describe('CampaignShellStore', () => {
  let store: InstanceType<typeof CampaignShellStore>;
  let campaignsApi: CampaignApiFake;
  let actorsApi: {
    listByCampaign: ReturnType<typeof vi.fn>;
    createPc: ReturnType<typeof vi.fn>;
    createActor: ReturnType<typeof vi.fn>;
  };
  let assetsApi: { get: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    campaignsApi = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(campaign()),
      create: vi.fn(),
      listScenes: vi.fn().mockResolvedValue([]),
      createScene: vi.fn(),
      patch: vi.fn(),
      updateScene: vi.fn(),
      getSnapshot: vi.fn(),
      listSessions: vi.fn().mockResolvedValue([]),
      startSession: vi.fn(),
      stopSession: vi.fn(),
      exportCampaign: vi.fn(),
      importCampaign: vi.fn(),
    };
    actorsApi = {
      listByCampaign: vi.fn().mockResolvedValue([]),
      createPc: vi.fn(),
      createActor: vi.fn(),
    };
    assetsApi = {
      get: vi.fn().mockResolvedValue(asset('/uploads/aria.png')),
      upload: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: CampaignService, useValue: campaignsApi },
        { provide: ActorService, useValue: actorsApi },
        { provide: AssetService, useValue: assetsApi },
      ],
    });
    store = TestBed.inject(CampaignShellStore);
  });

  it('carica la lista campagne e spegne il loading', async () => {
    campaignsApi.list.mockResolvedValue([campaign()]);

    await expect(store.loadCampaigns()).resolves.toHaveLength(1);

    expect(store.campaigns()).toHaveLength(1);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(campaignsApi.list).toHaveBeenCalledTimes(1);
  });

  it('seleziona la campagna richiesta e la rende attiva', async () => {
    const active = campaign(CAMPAIGN_ID, 'La Valle Perduta');
    campaignsApi.get.mockResolvedValue(active);

    await expect(store.selectCampaign(CAMPAIGN_ID)).resolves.toBe(active);

    expect(campaignsApi.get).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(store.activeCampaign()).toBe(active);
    expect(store.loading()).toBe(false);
  });

  it('registra l\u2019errore e lo rilancia quando il caricamento fallisce', async () => {
    const failure = new Error('offline');
    campaignsApi.get.mockRejectedValue(failure);

    await expect(store.selectCampaign(CAMPAIGN_ID)).rejects.toBe(failure);

    expect(store.error()).toBe(failure);
    expect(store.loading()).toBe(false);
    expect(store.activeCampaign()).toBeNull();
  });

  it('carica scene e attori con i ritratti', async () => {
    campaignsApi.listScenes.mockResolvedValue([scene()]);
    actorsApi.listByCampaign.mockResolvedValue([actor()]);

    await expect(store.loadScenes(CAMPAIGN_ID)).resolves.toHaveLength(1);
    await expect(store.loadActors(CAMPAIGN_ID)).resolves.toHaveLength(1);

    expect(store.scenes()).toHaveLength(1);
    expect(store.party()).toHaveLength(1);
    expect(assetsApi.get).toHaveBeenCalledWith(ASSET_ID);
    expect(store.actorAssetUrls()).toEqual({ [ASSET_ID]: '/uploads/aria.png' });
    expect(campaignsApi.listScenes).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(actorsApi.listByCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it('carica le sessioni e deduce quella aperta', async () => {
    const closed = session('0190f000-0000-7000-8000-000000000020', '2026-11-01T12:00:00.000Z');
    const open = session('0190f000-0000-7000-8000-000000000021', null);
    campaignsApi.listSessions.mockResolvedValue([closed, open]);

    await expect(store.loadSessions(CAMPAIGN_ID)).resolves.toHaveLength(2);

    expect(store.sessions()).toHaveLength(2);
    expect(store.activeSession()).toBe(open);
    expect(campaignsApi.listSessions).toHaveBeenCalledWith(CAMPAIGN_ID);
  });
});
