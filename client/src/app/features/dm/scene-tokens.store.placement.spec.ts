import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultSceneState,
  defaultTerrain,
  type Actor,
  type AppliedAction,
  type Campaign,
  type GameAction,
  type MonsterStatblock,
  type Scene,
  type SceneSnapshot,
  type Terrain,
  type WallSegment,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionStore } from '../../core/stores/action.store';
import { DiceStore } from '../../core/stores/dice.store';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';
import { SceneTokensStore } from './scene-tokens.store';

const SCENE_ID = '0190f000-0000-7000-8000-000000000102';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000103';

const wall = (
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  extra: Partial<WallSegment> = {},
): WallSegment => ({
  id,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  ...extra,
});

/** Stessa fixture della scena reale: (11,4) è attraversata dal muro diagonale. */
const fixtureWalls = (): WallSegment[] => [
  wall('wall-h', 7, 5, 11, 5),
  wall('wall-diag', 11, 5, 12, 4),
  wall('door-open', 13, 3, 12, 4, { kind: 'door', door: 'open' }),
  wall('door-closed', 15, 3, 16, 4, { kind: 'door', door: 'closed' }),
];

const fixtureTerrain = (): Terrain => ({ ...defaultTerrain, walls: fixtureWalls() });

const scene = (): Scene => ({ id: SCENE_ID } as Scene);

const statblock = (overrides: Partial<MonsterStatblock> = {}): MonsterStatblock => ({
  kind: 'monster',
  size: 'medium',
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
  ...overrides,
});

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  id: ACTOR_ID,
  campaignId: null,
  kind: 'monster',
  name: 'Goblin',
  statblock: statblock(),
  rulesVersion: null,
  xp: 0,
  sheetVersion: 1,
  dmNotes: null,
  imageAssetId: null,
  portrait: null,
  hp: { current: 7, max: 7, temp: 0 },
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
  ...overrides,
});

/** Centro del footprint di `size` celle a partire dall'origine. */
const pointFor = (x: number, y: number, size = 1): { pointX: number; pointY: number } => ({
  pointX: (x + size / 2) * 70,
  pointY: (y + size / 2) * 70,
});

const snapshot = (terrain: Terrain = fixtureTerrain()): SceneSnapshot => ({
  scene: scene(),
  state: { ...createDefaultSceneState('hidden', terrain) },
  stateVersion: 1,
});

const applied = (): AppliedAction => ({ id: 'action-1' } as AppliedAction);

let store: InstanceType<typeof SceneTokensStore>;
let sceneSnapshot: WritableSignal<SceneSnapshot | null>;
let party: WritableSignal<Actor[]>;
let activeCampaign: WritableSignal<Campaign | null>;
let selectedTokenId: WritableSignal<string | null>;
let actionsSend: ReturnType<typeof vi.fn>;
let diceRoll: ReturnType<typeof vi.fn>;
let ui: {
  selectedTokenId: WritableSignal<string | null>;
  setStatusMessage: ReturnType<typeof vi.fn>;
  setSelectedTokenId: ReturnType<typeof vi.fn>;
};

const actionOf = (call: number): GameAction => actionsSend.mock.calls[call]?.[1] as GameAction;

describe('SceneTokensStore placement', () => {
  beforeEach(() => {
    sceneSnapshot = signal<SceneSnapshot | null>(snapshot());
    party = signal<Actor[]>([]);
    activeCampaign = signal<Campaign | null>(null);
    selectedTokenId = signal<string | null>(null);
    actionsSend = vi.fn().mockResolvedValue(applied());
    diceRoll = vi.fn();
    ui = {
      selectedTokenId,
      setStatusMessage: vi.fn(),
      setSelectedTokenId: vi.fn((id: string | null) => selectedTokenId.set(id)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ActionStore, useValue: { send: actionsSend } },
        { provide: SceneStore, useValue: { snapshot: sceneSnapshot } },
        { provide: CampaignShellStore, useValue: { party, activeCampaign } },
        { provide: DiceStore, useValue: { roll: diceRoll } },
        { provide: DmUiStore, useValue: ui },
      ],
    });
    store = TestBed.inject(SceneTokensStore);
  });

  it('non aggiunge un token in una cella attraversata dal muro diagonale', async () => {
    const { pointX, pointY } = pointFor(11, 4);

    await store.spawnActorToken(scene(), actor(), pointX, pointY);

    expect(actionsSend).not.toHaveBeenCalled();
    expect(ui.setSelectedTokenId).not.toHaveBeenCalled();
    expect(selectedTokenId()).toBeNull();
    expect(ui.setStatusMessage).toHaveBeenCalledTimes(1);
    expect(ui.setStatusMessage.mock.calls[0]?.[0]).toMatch(/piazz|muro|occupat/i);
  });

  it('aggiunge il token quando la cella è valida', async () => {
    const { pointX, pointY } = pointFor(10, 3);

    await store.spawnActorToken(scene(), actor(), pointX, pointY);

    const action = actionOf(0);
    expect(action.type).toBe('token.add');
    if (action.type !== 'token.add') {
      return;
    }
    expect(action.token).toMatchObject({ x: 10, y: 3, size: 1 });
    expect(selectedTokenId()).toBe(action.token.id);
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Token aggiunto: Goblin');
  });

  it('rifiuta una creatura size 2 con footprint invalido', async () => {
    const { pointX, pointY } = pointFor(10, 3, 2);

    await store.spawnActorToken(
      scene(),
      actor({ statblock: statblock({ size: 'large' }) }),
      pointX,
      pointY,
    );

    expect(actionsSend).not.toHaveBeenCalled();
    expect(ui.setSelectedTokenId).not.toHaveBeenCalled();
    expect(ui.setStatusMessage.mock.calls[0]?.[0]).toMatch(/piazz|muro|occupat/i);
  });

  it('onActorDropped applica la stessa validazione alla cella di drop', async () => {
    party.set([actor()]);
    const { pointX, pointY } = pointFor(11, 4);
    sceneSnapshot.set(snapshot());

    await store.onActorDropped(scene(), { actorId: ACTOR_ID, pointX, pointY });

    expect(actionsSend).not.toHaveBeenCalled();
    expect(selectedTokenId()).toBeNull();
    expect(ui.setStatusMessage.mock.calls[0]?.[0]).toMatch(/piazz|muro|occupat/i);
  });
});
