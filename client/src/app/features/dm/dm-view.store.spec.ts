import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultSceneState,
  defaultBackgroundTransform,
  type Actor,
  type Campaign,
  type Scene,
  type SceneSnapshot,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionStore, type ActionSyncStatus } from '../../core/action.store';
import { AuthService } from '../../core/auth.service';
import { MeasurementService } from '../../core/measurement.service';
import { SceneStore } from '../../core/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmUiStore } from './dm-ui.store';
import { DmViewStore } from './dm-view.store';
import { RegiaStore } from './regia.store';
import { SceneToolsStore } from './scene-tools.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000003';

const campaign = (): Campaign => ({
  id: CAMPAIGN_ID,
  name: 'La Valle',
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
  backgroundTransform: { x: 12, y: 34, scale: 2 },
  widthPx: 1400,
  heightPx: 700,
  stateVersion: 5,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const pc = (id: string, name: string, imageAssetId: string | null = null): Actor => ({
  id,
  campaignId: CAMPAIGN_ID,
  kind: 'pc',
  name,
  statblock: {
    kind: 'pc',
    size: 'medium',
    abilities: { str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 8 },
    hp: { current: 10, max: 20, temp: 0 },
    speed: { walk: 30 },
    senses: { darkvision: 60 },
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
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    overrides: {},
    snapshot: { features: [], spells: [], items: [] },
  },
  rulesVersion: 'test',
  xp: 0,
  sheetVersion: 1,
  dmNotes: null,
  imageAssetId,
  portrait: null,
  hp: { current: 10, max: 20, temp: 0 },
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
});

const snapshot = (): SceneSnapshot => ({
  scene: scene(),
  state: createDefaultSceneState(),
  stateVersion: 5,
});

describe('DmViewStore', () => {
  let store: InstanceType<typeof DmViewStore>;
  let sceneSnapshot: WritableSignal<SceneSnapshot | null>;
  let party: WritableSignal<Actor[]>;
  let assetUrls: WritableSignal<Record<string, string>>;
  let mode: WritableSignal<'loading' | 'ready'>;
  let actionStatus: WritableSignal<ActionSyncStatus>;
  let pending: WritableSignal<number>;
  let selectedTokenId: WritableSignal<string | null>;
  let zoom: WritableSignal<number>;
  let displays: WritableSignal<number>;
  let programState: WritableSignal<{ blackout: boolean } | null>;
  let measure: WritableSignal<{ feet: number } | null>;
  let formatDistance: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sceneSnapshot = signal<SceneSnapshot | null>(snapshot());
    party = signal<Actor[]>([]);
    assetUrls = signal<Record<string, string>>({});
    mode = signal<'loading' | 'ready'>('ready');
    actionStatus = signal<ActionSyncStatus>('synced');
    pending = signal(0);
    selectedTokenId = signal<string | null>(null);
    zoom = signal(1);
    displays = signal(0);
    programState = signal<{ blackout: boolean } | null>(null);
    measure = signal<{ feet: number } | null>(null);
    formatDistance = vi.fn((feet: number) => `${feet} ft`);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { error: signal<string | null>(null) } },
        { provide: SceneStore, useValue: { snapshot: sceneSnapshot } },
        {
          provide: ActionStore,
          useValue: { status: actionStatus, pending, history: signal([]) },
        },
        {
          provide: CampaignShellStore,
          useValue: {
            party,
            actorAssetUrls: assetUrls,
            campaigns: signal([campaign()]),
          },
        },
        {
          provide: DmCampaignStore,
          useValue: {
            mode,
            activeScene: signal<Scene | null>(scene()),
            prepareDoc: signal(null),
          },
        },
        {
          provide: SceneToolsStore,
          useValue: {
            fogBrushCells: signal(2),
            pencilTenths: signal(3),
            measure,
          },
        },
        {
          provide: RegiaStore,
          useValue: {
            programState,
            connectedDisplays: displays,
            busy: signal(false),
          },
        },
        {
          provide: DmUiStore,
          useValue: { zoom, selectedTokenId, statusMessage: signal('') },
        },
        { provide: MeasurementService, useValue: { formatDistance } },
      ],
    });
    store = TestBed.inject(DmViewStore);
  });

  it('espone la trasformazione sfondo della scena attiva', () => {
    expect(store.backgroundTransform()).toEqual({ x: 12, y: 34, scale: 2 });
    expect(store.snapshot()?.stateVersion).toBe(5);
    expect(store.hasCampaigns()).toBe(true);
  });

  it('riempie dieci slot con i soli PC del party', () => {
    party.set(Array.from({ length: 12 }, (_, index) => pc(`${ACTOR_ID}${index}`, `Eroe ${index}`)));

    const slots = store.slots();

    expect(slots).toHaveLength(10);
    expect(slots[9]?.name).toBe('Eroe 9');
  });

  it('lascia null gli slot senza personaggi', () => {
    party.set([pc(ACTOR_ID, 'Aria')]);

    expect(store.slots().filter((actor) => actor === null)).toHaveLength(9);
    expect(store.partyPcs()).toHaveLength(1);
  });

  it('mappa solo le porte della scena', () => {
    const base = createDefaultSceneState();
    sceneSnapshot.set({
      scene: scene(),
      stateVersion: 5,
      state: {
        ...base,
        terrain: {
          ...base.terrain,
          walls: [
            { id: 'w1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
            { id: 'd1', kind: 'door', door: 'open', a: { x: 1, y: 0 }, b: { x: 2, y: 0 } },
            { id: 'd2', kind: 'door', door: 'closed', a: { x: 2, y: 0 }, b: { x: 3, y: 0 } },
          ],
        },
      },
    });

    expect(store.dmDoors()).toEqual([
      { id: 'd1', a: { x: 1, y: 0 }, b: { x: 2, y: 0 }, state: 'open' },
      { id: 'd2', a: { x: 2, y: 0 }, b: { x: 3, y: 0 }, state: 'closed' },
    ]);
  });

  it('calcola la visione dai token del party e la azzera senza visione', () => {
    const actor = pc(ACTOR_ID, 'Aria');
    party.set([actor]);
    const base = createDefaultSceneState();
    const tokens = [{
      id: 't1',
      actorId: ACTOR_ID,
      label: 'Aria',
      x: 0,
      y: 0,
      size: 1,
      rotation: 0,
      elevation: 0,
      hp: { current: 10, max: 20, temp: 0 },
      conditions: [],
      visible: true,
    }];
    sceneSnapshot.set({
      scene: scene(),
      stateVersion: 5,
      state: { ...base, tokens },
    });

    expect(store.visionGrid()).not.toBeNull();

    sceneSnapshot.set({
      scene: scene(),
      stateVersion: 5,
      state: { ...base, tokens, terrain: { ...base.terrain, visionEnabled: false } },
    });

    expect(store.visionGrid()).toBeNull();
  });

  it('deriva le etichette di sync, zoom, measure e onda', () => {
    expect(store.syncLabel()).toBe('synced');
    actionStatus.set('pending');
    pending.set(3);
    expect(store.syncLabel()).toBe('pending 3');
    actionStatus.set('read-only');
    expect(store.readOnly()).toBe(true);

    zoom.set(1.75);
    expect(store.zoomLabel()).toBe('175%');

    expect(store.measureLabel()).toBe('—');
    measure.set({ feet: 30 });
    expect(store.measureLabel()).toBe('30 ft');

    expect(store.airLabel()).toBe('OFF AIR');
    displays.set(1);
    expect(store.airLabel()).toBe('ON AIR');
    programState.set({ blackout: true });
    expect(store.airLabel()).toBe('BLACKOUT');
    expect(store.blackout()).toBe(true);
    mode.set('loading');
    expect(store.airLabel()).toBe('OFF AIR');
  });

  it('calcola i pixel di pennello e matita dalla griglia', () => {
    expect(store.fogBrushRadiusPx()).toBe(70);
    expect(store.fogBrushDiameterPx()).toBe(140);
    expect(store.pencilWidthPx()).toBe(21);
  });

  it('espone il ritratto solo quando asset e URL esistono', () => {
    const actor = pc(ACTOR_ID, 'Aria', 'asset-1');
    party.set([actor]);
    assetUrls.set({ 'asset-1': 'https://example.test/aria.png' });

    expect(store.portraitFor(actor)).toEqual({
      url: 'https://example.test/aria.png',
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1.25,
    });
    expect(store.actorPortraits()[ACTOR_ID]?.url).toBe('https://example.test/aria.png');
    expect(store.portraitFor(pc('other', 'Senza foto'))).toBeNull();
  });
});

describe('DmViewStore defaults', () => {
  it('usa la trasformazione neutra senza scena attiva', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { error: signal<string | null>(null) } },
        { provide: SceneStore, useValue: { snapshot: signal(null) } },
        {
          provide: ActionStore,
          useValue: { status: signal('synced'), pending: signal(0), history: signal([]) },
        },
        {
          provide: CampaignShellStore,
          useValue: { party: signal([]), actorAssetUrls: signal({}), campaigns: signal([]) },
        },
        {
          provide: DmCampaignStore,
          useValue: {
            mode: signal('ready'),
            activeScene: signal(null),
            prepareDoc: signal(null),
          },
        },
        {
          provide: SceneToolsStore,
          useValue: { fogBrushCells: signal(2), pencilTenths: signal(3), measure: signal(null) },
        },
        {
          provide: RegiaStore,
          useValue: {
            programState: signal(null),
            connectedDisplays: signal(0),
            busy: signal(false),
          },
        },
        {
          provide: DmUiStore,
          useValue: { zoom: signal(1), selectedTokenId: signal(null), statusMessage: signal('') },
        },
        { provide: MeasurementService, useValue: { formatDistance: vi.fn() } },
      ],
    });
    const store = TestBed.inject(DmViewStore);

    expect(store.backgroundTransform()).toEqual(defaultBackgroundTransform);
    expect(store.hasCampaigns()).toBe(false);
    expect(store.visionGrid()).toBeNull();
  });
});
