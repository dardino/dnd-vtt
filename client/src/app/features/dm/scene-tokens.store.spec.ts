import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  defaultBackgroundTransform,
  defaultGridConfig,
  createDefaultSceneState,
  SIZE_CELLS,
  snapTokenCell,
  type Actor,
  type AppliedAction,
  type Campaign,
  type GameAction,
  type InitiativeState,
  type Scene,
  type SceneSnapshot,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionStore } from '../../core/stores/action.store';
import { DiceStore } from '../../core/stores/dice.store';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';
import { SceneTokensStore } from './scene-tokens.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const ACTOR_ID = '0190f000-0000-7000-8000-000000000003';
const TOKEN_ID = '0190f000-0000-7000-8000-000000000004';

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
  name: 'Cripta',
  imageAssetId: null,
  backgroundTransform: defaultBackgroundTransform,
  widthPx: 1400,
  heightPx: 1000,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const actor = (overrides: Partial<Actor> = {}): Actor => ({
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
  ...overrides,
});

const token = (overrides: Partial<TokenState> = {}): TokenState => ({
  id: TOKEN_ID,
  actorId: ACTOR_ID,
  label: 'Goblin',
  x: 2,
  y: 3,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
  owner: 'dm',
  ...overrides,
});

const initiative = (overrides: Partial<InitiativeState> = {}): InitiativeState => ({
  active: false,
  round: 0,
  turnIndex: 0,
  entries: [],
  ...overrides,
});

const snapshot = (state: Partial<SceneState> = {}): SceneSnapshot => ({
  scene: scene(),
  state: { ...createState(), ...state },
  stateVersion: 1,
});

const createState = (): SceneState => createDefaultSceneState();

const applied = (): AppliedAction => ({ id: 'action-1' } as AppliedAction);

const actionOf = (call: number): GameAction => actionsSend.mock.calls[call]?.[1] as GameAction;

const eventOf = (value: string): Event => ({ target: { value } } as unknown as Event);

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

describe('SceneTokensStore', () => {
  beforeEach(() => {
    sceneSnapshot = signal<SceneSnapshot | null>(snapshot());
    party = signal<Actor[]>([]);
    activeCampaign = signal<Campaign | null>(campaign());
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

  it('espone token e iniziativa dallo snapshot', () => {
    sceneSnapshot.set(snapshot({
      tokens: [token()],
      initiative: initiative({ active: true, round: 2 }),
    }));

    expect(store.tokens()).toEqual([token()]);
    expect(store.initiative()).toMatchObject({ active: true, round: 2 });
    expect(store.tokenHp(TOKEN_ID)).toBe('7/7');
    expect(store.tokenHp('missing')).toBe('—');
  });

  it('changeTokenHp invia il delta e aggiorna lo stato', async () => {
    await store.changeTokenHp(SCENE_ID, token(), 3);

    expect(actionsSend).toHaveBeenCalledWith(SCENE_ID, {
      type: 'token.hp',
      tokenId: TOKEN_ID,
      delta: 3,
    });
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Goblin: +3 PF');
  });

  it('changeTokenHp senza scena non invia nulla', async () => {
    await store.changeTokenHp(null, token(), -2);

    expect(actionsSend).not.toHaveBeenCalled();
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Goblin: -2 PF');
  });

  it('select e remove aggiornano la selezione solo se confermata', async () => {
    store.select(TOKEN_ID);
    expect(selectedTokenId()).toBe(TOKEN_ID);

    actionsSend.mockResolvedValueOnce(applied());
    await store.remove(SCENE_ID, token());
    expect(actionsSend).toHaveBeenCalledWith(SCENE_ID, {
      type: 'token.remove',
      tokenId: TOKEN_ID,
    });
    expect(selectedTokenId()).toBeNull();

    selectedTokenId.set('another-token');
    await store.remove(SCENE_ID, token());
    expect(selectedTokenId()).toBe('another-token');

    selectedTokenId.set(TOKEN_ID);
    actionsSend.mockResolvedValueOnce(null);
    await store.remove(SCENE_ID, token());
    expect(selectedTokenId()).toBe(TOKEN_ID);
  });

  it('center seleziona il token e richiede il focus al canvas', () => {
    store.center(token());

    expect(selectedTokenId()).toBe(TOKEN_ID);
    expect(store.focusRequest()).toBe(TOKEN_ID);

    store.consumeFocus();
    expect(store.focusRequest()).toBeNull();
  });

  it('toggleVisibility inverte il flag e aggiorna lo stato', async () => {
    await store.toggleVisibility(SCENE_ID, token({ visible: false }));

    expect(actionsSend).toHaveBeenCalledWith(SCENE_ID, {
      type: 'token.update',
      tokenId: TOKEN_ID,
      patch: { visible: true },
    });
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Goblin: visibile');
  });

  it('onTokenMoved invia il movimento e il force solo quando richiesto', async () => {
    await store.onTokenMoved(SCENE_ID, { tokenId: TOKEN_ID, x: 4, y: 5 });
    expect(actionOf(0)).toEqual({
      type: 'token.move',
      tokenId: TOKEN_ID,
      x: 4,
      y: 5,
    });

    await store.onTokenMoved(SCENE_ID, { tokenId: TOKEN_ID, x: 4, y: 5, force: true });
    expect(actionOf(1)).toEqual({
      type: 'token.move',
      tokenId: TOKEN_ID,
      x: 4,
      y: 5,
      force: true,
    });
  });

  it('addActorToMap crea il token al centro e richiede il focus', async () => {
    const goblin = actor();
    await store.addActorToMap(scene(), goblin);

    const action = actionOf(0);
    expect(action.type).toBe('token.add');
    if (action.type !== 'token.add') {
      return;
    }
    const expected = snapTokenCell(
      defaultGridConfig,
      { x: scene().widthPx / 2, y: scene().heightPx / 2 },
      SIZE_CELLS[goblin.statblock.size],
    );
    expect(action.token).toMatchObject({
      actorId: ACTOR_ID,
      label: 'Goblin',
      x: expected.x,
      y: expected.y,
      visible: true,
      owner: 'dm',
    });
    expect(selectedTokenId()).toBe(action.token.id);
    expect(store.focusRequest()).toBeNull();
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Token aggiunto: Goblin');
  });

  it('onActorDropped trova l’attore e ignora quelli sconosciuti', async () => {
    party.set([actor()]);

    await store.onActorDropped(scene(), {
      actorId: ACTOR_ID,
      pointX: 140,
      pointY: 210,
    });
    expect(actionOf(0).type).toBe('token.add');

    await store.onActorDropped(scene(), {
      actorId: 'missing-actor',
      pointX: 0,
      pointY: 0,
    });
    expect(actionsSend).toHaveBeenCalledTimes(1);
  });

  it('non duplica un PC già in mappa e ne richiede il focus', async () => {
    const pc = actor({ kind: 'pc' });
    sceneSnapshot.set(snapshot({ tokens: [token({ actorId: pc.id })] }));

    await store.addActorToMap(scene(), pc);

    expect(actionsSend).not.toHaveBeenCalled();
    expect(selectedTokenId()).toBe(TOKEN_ID);
    expect(store.focusRequest()).toBe(TOKEN_ID);
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Goblin è già in mappa.');
  });

  it('rollInitiative tira per ogni token e invia l’ordine', async () => {
    party.set([actor()]);
    sceneSnapshot.set(snapshot({
      tokens: [token(), token({ id: 'token-2', label: 'Orso', actorId: 'unknown-actor' })],
    }));
    diceRoll
      .mockResolvedValueOnce({ total: 18 })
      .mockResolvedValueOnce({ total: 5 });

    await store.rollInitiative(scene());

    expect(diceRoll).toHaveBeenNthCalledWith(1, CAMPAIGN_ID, expect.objectContaining({
      formula: '1d20+2',
      sceneId: SCENE_ID,
      tokenId: TOKEN_ID,
    }));
    expect(diceRoll).toHaveBeenNthCalledWith(2, CAMPAIGN_ID, expect.objectContaining({
      formula: '1d20',
      tokenId: 'token-2',
    }));
    const action = actionOf(0);
    expect(action.type).toBe('initiative.set');
    if (action.type !== 'initiative.set') {
      return;
    }
    expect(action.initiative).toMatchObject({ active: true, round: 1, turnIndex: 0 });
    expect(action.initiative.entries.map((entry) => entry.value)).toEqual([18, 5]);
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Iniziativa tirata dal server.');
  });

  it('rollInitiative senza token non invia azioni', async () => {
    await store.rollInitiative(scene());

    expect(diceRoll).not.toHaveBeenCalled();
    expect(actionsSend).not.toHaveBeenCalled();
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Nessun token in mappa per l’iniziativa.');
  });

  it('addTokenToInitiative aggiunge una voce e ignora i duplicati', async () => {
    sceneSnapshot.set(snapshot({
      initiative: initiative({ active: true, round: 2, turnIndex: 1 }),
    }));
    party.set([actor()]);

    await store.addTokenToInitiative(scene(), token());
    const action = actionOf(0);
    expect(action.type).toBe('initiative.set');
    if (action.type !== 'initiative.set') {
      return;
    }
    expect(action.initiative).toMatchObject({ active: true, round: 2, turnIndex: 0 });
    expect(action.initiative.entries).toHaveLength(1);
    expect(action.initiative.entries[0]).toMatchObject({ value: 12, tiebreak: 2 });

    sceneSnapshot.set(snapshot({
      initiative: initiative({ entries: [{
        id: 'entry-1', tokenId: TOKEN_ID, label: 'Goblin', value: 10, tiebreak: 0, hidden: false, defeated: false,
      }] }),
    }));
    await store.addTokenToInitiative(scene(), token());
    expect(actionsSend).toHaveBeenCalledTimes(1);
  });

  it('updateInitiativeValue tronca il valore e mantiene lo stato', async () => {
    sceneSnapshot.set(snapshot({
      initiative: initiative({
        active: true,
        round: 3,
        turnIndex: 1,
        entries: [{
          id: 'entry-1', tokenId: TOKEN_ID, label: 'Goblin', value: 10, tiebreak: 0, hidden: false, defeated: false,
        }],
      }),
    }));

    await store.updateInitiativeValue(scene(), 'entry-1', eventOf('17.9'));

    const action = actionOf(0);
    expect(action.type).toBe('initiative.set');
    if (action.type !== 'initiative.set') {
      return;
    }
    expect(action.initiative).toMatchObject({ active: true, round: 3, turnIndex: 0 });
    expect(action.initiative.entries[0]?.value).toBe(17);
  });

  it('sortInitiative ordina e riporta il turno a zero', async () => {
    sceneSnapshot.set(snapshot({
      initiative: initiative({
        active: true,
        round: 2,
        turnIndex: 1,
        entries: [
          { id: 'low', tokenId: 't1', label: 'Basso', value: 3, tiebreak: 0, hidden: false, defeated: false },
          { id: 'high', tokenId: 't2', label: 'Alto', value: 20, tiebreak: 0, hidden: false, defeated: false },
        ],
      }),
    }));

    await store.sortInitiative(scene());

    const action = actionOf(0);
    expect(action.type).toBe('initiative.set');
    if (action.type !== 'initiative.set') {
      return;
    }
    expect(action.initiative.entries.map((entry) => entry.id)).toEqual(['high', 'low']);
    expect(action.initiative.turnIndex).toBe(0);
  });

  it('nextTurn ed endInitiative inviano i comandi attesi', async () => {
    sceneSnapshot.set(snapshot({ initiative: initiative({ active: true, round: 2 }) }));

    await store.nextTurn(scene());
    expect(actionOf(0)).toEqual({ type: 'initiative.next' });

    await store.endInitiative(scene());
    const action = actionOf(1);
    expect(action.type).toBe('initiative.set');
    if (action.type !== 'initiative.set') {
      return;
    }
    expect(action.initiative).toMatchObject({ active: false, round: 0, turnIndex: 0 });
    expect(ui.setStatusMessage).toHaveBeenCalledWith('Iniziativa terminata.');
  });

  it('send ignora una scena assente e delega le altre azioni', async () => {
    expect(await store.send(null, { type: 'initiative.next' })).toBeNull();
    expect(actionsSend).not.toHaveBeenCalled();

    await store.send(SCENE_ID, { type: 'initiative.next' });
    expect(actionsSend).toHaveBeenCalledWith(SCENE_ID, { type: 'initiative.next' });
  });
});
