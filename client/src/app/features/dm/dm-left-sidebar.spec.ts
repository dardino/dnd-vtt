import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  createDefaultSceneState,
  defaultBackgroundTransform,
  type Actor,
  type Campaign,
  type Scene,
  type TokenState,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionStore } from '../../core/stores/action.store';
import { MeasurementService } from '../../core/ui/measurement.service';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmAuxStore } from './dm-aux.store';
import { DmCampaignStore, type ShellMode } from './dm-campaign.store';
import { DEFAULT_SECTIONS, DmLayoutStore } from './dm-layout.store';
import { DmLeftSidebar } from './dm-left-sidebar';
import { DmSessionStore } from './dm-session.store';
import { DmUiStore } from './dm-ui.store';
import { RegiaStore } from './regia.store';
import { SceneFogStore } from './scene-fog.store';
import { SceneTokensStore } from './scene-tokens.store';
import { SceneToolsStore } from './scene-tools.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const OTHER_SCENE_ID = '0190f000-0000-7000-8000-000000000003';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000004';

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

const scene = (overrides: Partial<Scene> = {}): Scene => ({
  id: SCENE_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Cripta',
  imageAssetId: null,
  widthPx: 1400,
  heightPx: 1000,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  backgroundTransform: defaultBackgroundTransform,
  ...overrides,
});

const monster = (): Actor => ({
  id: ACTOR_ID,
  campaignId: CAMPAIGN_ID,
  kind: 'monster',
  name: 'Goblin',
  statblock: {
    kind: 'monster',
    size: 'small',
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    hp: { current: 7, max: 7, temp: 0 },
    speed: { walk: 30 },
    senses: {},
    languages: ['common'],
    conditions: [],
    creatureType: 'humanoid',
    cr: '1/4',
    tags: [],
    ac: 15,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    traits: [],
    actions: [],
    reactions: [],
  },
  rulesVersion: null,
  xp: 0,
  sheetVersion: 1,
  dmNotes: null,
  imageAssetId: null,
  portrait: null,
  hp: { current: 7, max: 7, temp: 0 },
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
});

const token = (): TokenState => ({
  id: '0190f000-0000-7000-8000-000000000005',
  actorId: ACTOR_ID,
  label: 'Goblin',
  x: 0,
  y: 0,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
  owner: 'dm',
});

describe('DmLeftSidebar', () => {
  const leftOpen = signal(true);
  const sections = signal({ ...DEFAULT_SECTIONS });
  const busy = signal(false);
  const mode = signal<ShellMode>('ready');
  const activeScene = signal<Scene | null>(scene());
  const activeCampaign = signal<Campaign | null>(campaign());
  const scenes = signal<Scene[]>([scene()]);
  const party = signal<Actor[]>([monster()]);
  const tokens = signal<TokenState[]>([token()]);
  const fullState = signal(createDefaultSceneState());
  const grid = signal(createDefaultSceneState().grid);
  const sceneDoors = signal(createDefaultSceneState().terrain.walls);
  const sceneLights = signal(createDefaultSceneState().terrain.lights);
  const aiEnabled = signal(true);
  const aiText = signal('Goblin');
  const aiPreview = signal(null);
  const aiBusy = signal(false);
  const aiName = signal('Goblin');
  const aiMessage = signal('IA pronta');
  const includePrivateNotes = signal(false);
  const status = signal('synced');

  const toggleLeft = vi.fn(() => leftOpen.update((open) => !open));
  const toggleSection = vi.fn((section: keyof typeof DEFAULT_SECTIONS) => {
    sections.update((state) => ({ ...state, [section]: !state[section] }));
    return !sections()[section];
  });
  const persistActive = vi.fn();
  const setStatusMessage = vi.fn();
  const setNotice = vi.fn();
  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  const changeAdvancementMode = vi.fn().mockResolvedValue(undefined);
  const selectScene = vi.fn().mockResolvedValue(undefined);
  const openMapPicker = vi.fn().mockResolvedValue(undefined);
  const addActorToMap = vi.fn().mockResolvedValue(undefined);
  const setFogSoftness = vi.fn();
  const setFogSnap = vi.fn();
  const changeGridType = vi.fn().mockResolvedValue(undefined);
  const changeGridSize = vi.fn().mockResolvedValue(undefined);
  const toggleVision = vi.fn().mockResolvedValue(undefined);
  const toggleDoor = vi.fn().mockResolvedValue(undefined);
  const toggleLight = vi.fn().mockResolvedValue(undefined);
  const revealAll = vi.fn();
  const hideAll = vi.fn();
  const clearOverride = vi.fn().mockResolvedValue(undefined);
  const analyze = vi.fn().mockResolvedValue(undefined);
  const createMonster = vi.fn().mockResolvedValue(undefined);
  const setText = vi.fn();
  const setName = vi.fn();

  beforeEach(() => {
    leftOpen.set(true);
    sections.set({ ...DEFAULT_SECTIONS });
    busy.set(false);
    mode.set('ready');
    activeScene.set(scene());
    activeCampaign.set(campaign());
    scenes.set([scene()]);
    party.set([monster()]);
    tokens.set([token()]);
    fullState.set(createDefaultSceneState());
    grid.set(createDefaultSceneState().grid);
    sceneDoors.set([]);
    sceneLights.set([]);
    aiEnabled.set(true);
    aiText.set('Goblin');
    aiPreview.set(null);
    aiBusy.set(false);
    aiName.set('Goblin');
    includePrivateNotes.set(false);
    status.set('synced');
    [
      toggleLeft,
      toggleSection,
      persistActive,
      setStatusMessage,
      setNotice,
      start,
      stop,
      changeAdvancementMode,
      selectScene,
      openMapPicker,
      addActorToMap,
      setFogSoftness,
      setFogSnap,
      changeGridType,
      changeGridSize,
      toggleVision,
      toggleDoor,
      toggleLight,
      revealAll,
      hideAll,
      clearOverride,
      analyze,
      createMonster,
      setText,
      setName,
    ].forEach((fn) => fn.mockClear());

    TestBed.configureTestingModule({
      imports: [DmLeftSidebar],
      providers: [
        provideRouter([]),
        {
          provide: DmLayoutStore,
          useValue: { leftOpen, sections, toggleLeft, toggleSection, persistActive },
        },
        {
          provide: CampaignShellStore,
          useValue: {
            activeCampaign,
            scenes,
            party,
            activeSession: signal(null),
            addCampaign: vi.fn(),
          },
        },
        { provide: SceneStore, useValue: { loading: signal(false) } },
        { provide: DmUiStore, useValue: { busy, setStatusMessage, setNotice } },
        {
          provide: DmSessionStore,
          useValue: {
            sessionBusy: signal(false),
            sessionLabel: () => '00:00:00',
            start,
            stop,
          },
        },
        {
          provide: DmCampaignStore,
          useValue: {
            mode,
            activeScene,
            changeAdvancementMode,
            selectScene,
            openMapPicker,
            sceneDeleteTarget: signal<Scene | null>(null),
            askDeleteScene: vi.fn(),
            cancelDeleteScene: vi.fn(),
            confirmDeleteScene: vi.fn(),
            enterCampaign: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RegiaStore,
          useValue: { onAirSceneIds: () => new Set<string>() },
        },
        {
          provide: SceneFogStore,
          useValue: {
            state: fullState,
            grid,
            sceneDoors,
            sceneLights,
            changeGridType,
            changeGridSize,
            toggleVision,
            toggleDoor,
            toggleLight,
            revealAll,
            hideAll,
            clearOverride,
          },
        },
        { provide: SceneTokensStore, useValue: { tokens, addActorToMap } },
        {
          provide: SceneToolsStore,
          useValue: {
            fogBrushCells: signal(3),
            fogSoftness: signal(0),
            fogSnap: signal(true),
            pencilTenths: signal(2.5),
            setFogSoftness,
            setFogSnap,
          },
        },
        {
          provide: DmAuxStore,
          useValue: {
            aiEnabled,
            aiMessage,
            aiText,
            aiBusy,
            aiPreview,
            aiName,
            includePrivateNotes,
            analyze,
            createMonster,
            setText,
            setName,
            setIncludePrivateNotes: vi.fn(),
            export: vi.fn().mockResolvedValue(undefined),
            import: vi.fn(),
          },
        },
        { provide: ActionStore, useValue: { status } },
        { provide: MeasurementService, useValue: { formatDistance: (feet: number) => `${feet} ft` } },
      ],
    });
  });

  const create = (): { root: HTMLElement; fixture: ComponentFixture<DmLeftSidebar> } => {
    const fixture = TestBed.createComponent(DmLeftSidebar);
    fixture.detectChanges();
    return { root: fixture.nativeElement as HTMLElement, fixture };
  };

  const sectionTrigger = (root: HTMLElement, label: string): HTMLButtonElement => {
    const trigger = [...root.querySelectorAll<HTMLButtonElement>('.accordion__trigger')]
      .find((candidate) => candidate.textContent?.includes(label));
    if (trigger === undefined) {
      throw new Error(`Sezione "${label}" non trovata`);
    }
    return trigger;
  };
  it('mostra le sezioni e collassa il pannello con persistenza', () => {
    const { root, fixture } = create();

    expect(root.querySelector('.dm-panel--left')?.getAttribute('aria-label')).toBe('Campagna');
    expect(sectionTrigger(root, 'Dati campagna')).toBeDefined();
    expect(sectionTrigger(root, 'Scene')).toBeDefined();
    expect(sectionTrigger(root, 'Griglia')).toBeDefined();
    expect(sectionTrigger(root, 'Fog')).toBeDefined();
    expect(sectionTrigger(root, 'Scenografia')).toBeDefined();
    expect(sectionTrigger(root, 'Attori')).toBeDefined();
    expect(sectionTrigger(root, 'Chat IA')).toBeDefined();

    root.querySelector<HTMLButtonElement>('.panel-toggle')?.click();
    fixture.detectChanges();

    expect(toggleLeft).toHaveBeenCalledTimes(1);
    expect(persistActive).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.dm-panel--left')?.classList.contains('is-collapsed')).toBe(true);
    expect(root.querySelectorAll('.accordion')).toHaveLength(0);
  });
  it('persiste il toggle delle sezioni', () => {
    const { root } = create();

    sectionTrigger(root, 'Fog').click();

    expect(toggleSection).toHaveBeenCalledWith('fog');
    expect(persistActive).toHaveBeenCalledTimes(1);
  });
  it('collega sessione e cambio modalità avanzamento alla campagna', () => {
    const { root } = create();

    const startButton = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Avvia sessione'));
    startButton?.click();
    expect(start).toHaveBeenCalledWith(CAMPAIGN_ID);

    const select = root.querySelector<HTMLSelectElement>('select')!;
    select.value = 'xp';
    select.dispatchEvent(new Event('change'));
    expect(changeAdvancementMode).toHaveBeenCalledTimes(1);
  });
  it('crea e seleziona le scene', () => {
    scenes.set([scene(), scene({ id: OTHER_SCENE_ID, name: 'Torre' })]);
    const { root } = create();

    const scenesBody = root.querySelector<HTMLElement>('#sidebar-scenes');
    const createButton = scenesBody?.querySelector<HTMLButtonElement>('app-button button');
    createButton?.click();
    expect(openMapPicker).toHaveBeenCalledTimes(1);

    root.querySelector<HTMLButtonElement>('[aria-label="Attiva scena Torre"]')?.click();
    expect(selectScene).toHaveBeenCalledWith(scenes()[1]);
  });

  it('controlla fog e scenografia con gli store', () => {
    activeScene.set(scene());
    const { root } = create();
    const fogBody = root.querySelector<HTMLElement>('#sidebar-fog');
    if (fogBody === null) {
      throw new Error('Sezione fog mancante');
    }

    const softness = fogBody.querySelector<HTMLInputElement>('input[type="number"]');
    if (softness !== null) {
      softness.value = '40';
      softness.dispatchEvent(new Event('input'));
    }
    expect(setFogSoftness).toHaveBeenCalledWith(40);

    fogBody.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    expect(setFogSnap).toHaveBeenCalledWith(false);

    const revealButton = [...fogBody.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Rivela tutto'));
    revealButton?.click();
    expect(revealAll).toHaveBeenCalledTimes(1);

    const vision = root.querySelector<HTMLInputElement>('#sidebar-scenography input[type="checkbox"]');
    vision?.click();
    expect(toggleVision).toHaveBeenCalledWith(scene(), false);
  });

  it('aggiunge gli attori alla scena e disabilita in sola lettura', () => {
    const { root, fixture } = create();

    root.querySelector<HTMLButtonElement>('app-actor-list .icon-button')?.click();
    expect(addActorToMap).toHaveBeenCalledWith(scene(), monster());

    status.set('read-only');
    fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('app-actor-list .icon-button')?.disabled).toBe(true);
  });

  it('delega la sezione Chat IA al pannello dedicato', () => {
    const { root } = create();

    const section = root.querySelector('#sidebar-ai');
    expect(section?.querySelector('app-dm-ai-panel')).not.toBeNull();
  });
});
