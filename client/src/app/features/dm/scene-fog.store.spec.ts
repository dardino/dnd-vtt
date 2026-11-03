import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultSceneState,
  defaultBackgroundTransform,
  type ActionLogEntry,
  type Campaign,
  type Drawing,
  type FogOp,
  type GameAction,
  type Scene,
  type SceneSnapshot,
  type SceneState,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionStore, type ActionSyncStatus } from '../../core/action.store';
import { SceneActionService } from '../../core/scene-action.service';
import { SceneStore } from '../../core/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';
import { SceneFogStore } from './scene-fog.store';
import { SceneTokensStore } from './scene-tokens.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const ENTRY_ID = '0190f000-0000-7000-8000-000000000003';
const MAP_ID = '0190f000-0000-7000-8000-000000000004';
const FOG_OP_ID = 'fog-op-1';

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
  backgroundTransform: defaultBackgroundTransform,
  widthPx: 1400,
  heightPx: 1000,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

const door = (): SceneState['terrain']['walls'][number] => ({
  id: 'door-1',
  kind: 'door',
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  door: 'closed',
});

const light = (): SceneState['terrain']['lights'][number] => ({
  id: 'light-1',
  x: 10,
  y: 20,
  brightFeet: 20,
  dimFeet: 40,
  color: '#ffcc80',
  enabled: true,
  shape: 'circle',
  angle: 60,
});

const fogOp = (): FogOp => ({
  id: FOG_OP_ID,
  op: 'reveal',
  shape: { type: 'rect', x: 0, y: 0, width: 100, height: 100 },
  softness: 0,
});

const drawing = (): Drawing => ({
  id: 'drawing-1',
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  color: '#ffffff',
  width: 2,
  visible: true,
});

const logEntry = (overrides: Partial<ActionLogEntry> = {}): ActionLogEntry => ({
  id: ENTRY_ID,
  sceneId: SCENE_ID,
  actorId: null,
  clientId: 'client-1',
  origin: 'dm',
  type: 'fog.apply',
  label: 'Fog',
  payload: { type: 'fog.apply', op: fogOp() },
  inverse: { type: 'fog.remove', opId: FOG_OP_ID },
  status: 'applied',
  stateVersion: 2,
  createdAt: '2026-11-03T10:00:00.000Z',
  undoneAt: null,
  ...overrides,
});

const snapshot = (state: Partial<SceneState> = {}, sceneOverrides: Partial<Scene> = {}): SceneSnapshot => ({
  scene: scene(sceneOverrides),
  state: { ...createDefaultSceneState(), ...state },
  stateVersion: 1,
});

const eventOf = (value: string): Event => ({ target: { value } } as unknown as Event);

const actionOf = (call: number): GameAction => send.mock.calls[call]?.[1] as GameAction;

let store: InstanceType<typeof SceneFogStore>;
let sceneSnapshot: WritableSignal<SceneSnapshot | null>;
let history: WritableSignal<ActionLogEntry[]>;
let pending: WritableSignal<number>;
let actionStatus: WritableSignal<ActionSyncStatus>;
let activeCampaign: WritableSignal<Campaign | null>;
let send: ReturnType<typeof vi.fn>;
let undo: ReturnType<typeof vi.fn>;
let redo: ReturnType<typeof vi.fn>;
let clearHistoryApi: ReturnType<typeof vi.fn>;
let resetFogApi: ReturnType<typeof vi.fn>;
let sceneLoad: ReturnType<typeof vi.fn>;
let refreshHistory: ReturnType<typeof vi.fn>;
let setNotice: ReturnType<typeof vi.fn>;
let setStatusMessage: ReturnType<typeof vi.fn>;

describe('SceneFogStore', () => {
  beforeEach(() => {
    sceneSnapshot = signal<SceneSnapshot | null>(snapshot());
    history = signal<ActionLogEntry[]>([]);
    pending = signal(0);
    actionStatus = signal<ActionSyncStatus>('synced');
    activeCampaign = signal<Campaign | null>(campaign());
    send = vi.fn().mockResolvedValue({ id: 'applied-1' });
    undo = vi.fn().mockResolvedValue({ undone: 2 });
    redo = vi.fn().mockResolvedValue({ redone: 3 });
    clearHistoryApi = vi.fn().mockResolvedValue({ cleared: 4 });
    resetFogApi = vi.fn().mockResolvedValue({ cleared: 5 });
    sceneLoad = vi.fn().mockResolvedValue(undefined);
    refreshHistory = vi.fn().mockResolvedValue(undefined);
    setNotice = vi.fn();
    setStatusMessage = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: SceneStore, useValue: { snapshot: sceneSnapshot, load: sceneLoad } },
        { provide: CampaignShellStore, useValue: { activeCampaign } },
        {
          provide: ActionStore,
          useValue: { history, pending, status: actionStatus, refreshHistory },
        },
        {
          provide: SceneActionService,
          useValue: {
            undo,
            redo,
            clearHistory: clearHistoryApi,
            resetFog: resetFogApi,
          },
        },
        { provide: DmUiStore, useValue: { setNotice, setStatusMessage } },
        { provide: SceneTokensStore, useValue: { send } },
      ],
    });
    store = TestBed.inject(SceneFogStore);
  });

  it('espone stato, griglia e scenografia dallo snapshot', () => {
    sceneSnapshot.set(snapshot({
      grid: { ...createDefaultSceneState().grid, type: 'hex' },
      terrain: {
        ...createDefaultSceneState().terrain,
        walls: [door(), { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 0, y: 50 } }],
        lights: [light()],
      },
    }));

    expect(store.state()?.grid.type).toBe('hex');
    expect(store.grid()?.type).toBe('hex');
    expect(store.sceneDoors().map((entry) => entry.id)).toEqual(['door-1']);
    expect(store.sceneLights()).toHaveLength(1);
    expect(store.fogOverrideActive()).toBe(false);

    sceneSnapshot.set(snapshot());
    expect(store.fogOverrideActive()).toBe(true);
  });

  it('rilancia door, light e vision sulla scena attiva', async () => {
    await store.toggleDoor(scene(), door());
    expect(actionOf(0)).toEqual({ type: 'terrain.door', wallId: 'door-1', state: 'open' });

    await store.toggleLight(scene(), light());
    expect(actionOf(1)).toEqual({ type: 'terrain.light', lightId: 'light-1', enabled: false });

    await store.toggleVision(scene(), false);
    expect(actionOf(2)).toEqual({ type: 'terrain.vision', enabled: false });
  });

  it('ignora muri che non sono porte', async () => {
    await store.toggleDoor(scene(), {
      id: 'wall-1',
      kind: 'wall',
      a: { x: 0, y: 0 },
      b: { x: 10, y: 10 },
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('cambia tipo e dimensione griglia senza mappa', async () => {
    await store.changeGridType(scene(), eventOf('hex'));
    expect(actionOf(0)).toEqual({
      type: 'grid.update',
      grid: expect.objectContaining({ type: 'hex' }),
    });
    expect(setStatusMessage).toHaveBeenCalledWith('Griglia esagonale odd-r');

    await store.changeGridSize(scene(), eventOf('999'));
    expect(actionOf(1)).toEqual({
      type: 'grid.update',
      grid: expect.objectContaining({ cellSizePx: 400 }),
    });
    expect(setStatusMessage).toHaveBeenCalledWith('Cella: 400 px');
  });

  it('blocca la griglia quando la scena viene da una mappa', async () => {
    await store.changeGridType(scene({ mapId: MAP_ID }), eventOf('hex'));
    await store.changeGridSize(scene({ mapId: MAP_ID }), eventOf('80'));

    expect(send).not.toHaveBeenCalled();
    expect(setNotice).toHaveBeenCalledWith('Griglia bloccata: modificala dall’editor della mappa.');
  });

  it('gestisce la conferma reveal/hide con e senza override', async () => {
    sceneSnapshot.set(snapshot({ terrain: { ...createDefaultSceneState().terrain, visionEnabled: false } }));
    store.revealAll();
    expect(store.fogConfirm()).toBe('reveal');
    await store.confirm(scene());
    expect(store.fogConfirm()).toBeNull();
    expect(actionOf(0)).toEqual({ type: 'fog.replace', base: 'revealed', ops: [] });

    store.hideAll();
    await store.confirm(scene());
    expect(actionOf(1)).toEqual({ type: 'fog.replace', base: 'hidden', ops: [] });

    sceneSnapshot.set(snapshot());
    store.hideAll();
    await store.confirm(scene());
    expect(actionOf(2)).toEqual({ type: 'fog.override', override: 'hide' });
    expect(setStatusMessage).toHaveBeenCalledWith('Fog: nascondi tutto');
  });

  it('clearOverride, cancel e onFogApplied aggiornano il dialog e la scena', async () => {
    store.revealAll();
    store.cancel();
    expect(store.fogConfirm()).toBeNull();

    await store.clearOverride(SCENE_ID);
    expect(actionOf(0)).toEqual({ type: 'fog.override', override: 'none' });

    await store.onFogApplied(SCENE_ID, fogOp());
    expect(actionOf(1)).toEqual({ type: 'fog.apply', op: fogOp() });
    expect(setStatusMessage).toHaveBeenCalledWith('Fog: area rivelata');
  });

  it('onDrawingAdded invia il disegno e conferma', async () => {
    await store.onDrawingAdded(SCENE_ID, drawing());

    expect(actionOf(0)).toEqual({ type: 'drawing.add', drawing: drawing() });
    expect(setStatusMessage).toHaveBeenCalledWith('Disegno aggiunto');
  });

  it('undoLast annulla fino all’ultima azione applicata', async () => {
    history.set([
      logEntry({ id: 'undone-1', status: 'undone' }),
      logEntry(),
    ]);

    await store.undoLast(scene());

    expect(refreshHistory).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(undo).toHaveBeenCalledWith(CAMPAIGN_ID, ENTRY_ID);
    expect(sceneLoad).toHaveBeenCalledWith(SCENE_ID);
    expect(setStatusMessage).toHaveBeenCalledWith('2 azioni annullate.');
  });

  it('undoLast senza azioni applicate non chiama il server', async () => {
    await store.undoLast(scene());

    expect(undo).not.toHaveBeenCalled();
    expect(sceneLoad).not.toHaveBeenCalled();
  });

  it('undoThrough e redoLastBatch riallineano la scena', async () => {
    await store.undoThrough(scene(), ENTRY_ID);
    expect(undo).toHaveBeenCalledWith(CAMPAIGN_ID, ENTRY_ID);
    expect(sceneLoad).toHaveBeenCalledWith(SCENE_ID);

    await store.redoLastBatch(scene());
    expect(redo).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(setStatusMessage).toHaveBeenCalledWith('3 azioni ripristinate.');
  });

  it('segnala undo/redo falliti senza propagare l’errore', async () => {
    undo.mockRejectedValueOnce(new Error('boom'));
    redo.mockRejectedValueOnce(new Error('boom'));

    await store.undoThrough(scene(), ENTRY_ID);
    await store.redoLastBatch(scene());

    expect(setStatusMessage).toHaveBeenCalledWith('Annullamento non riuscito.');
    expect(setStatusMessage).toHaveBeenCalledWith('Nessuna azione da ripetere.');
  });

  it('clearHistory e resetFog puliscono e riallineano', async () => {
    await expect(store.clearHistory()).resolves.toBe(true);
    expect(clearHistoryApi).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(setStatusMessage).toHaveBeenCalledWith('History svuotata: 4 azioni rimosse.');

    await expect(store.resetFog(SCENE_ID)).resolves.toBe(true);
    expect(resetFogApi).toHaveBeenCalledWith(CAMPAIGN_ID, SCENE_ID);
    expect(sceneLoad).toHaveBeenCalledWith(SCENE_ID);
    expect(setStatusMessage).toHaveBeenCalledWith('FOG ripristinata: 5 azioni fog rimosse.');
  });

  it('clearHistory/resetFog riportano l’errore nel notice', async () => {
    clearHistoryApi.mockRejectedValueOnce(new Error('boom'));
    resetFogApi.mockRejectedValueOnce(new Error('boom'));

    await expect(store.clearHistory()).resolves.toBe(false);
    await expect(store.resetFog(SCENE_ID)).resolves.toBe(false);

    expect(setNotice).toHaveBeenCalledTimes(2);
  });

  it('calcola canUndo/canRedo da history, pending e read-only', () => {
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);

    history.set([logEntry(), logEntry({ id: 'undone-1', status: 'undone' })]);
    expect(store.undoneActions()).toBe(1);
    expect(store.lastAppliedAction()?.id).toBe(ENTRY_ID);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);

    pending.set(1);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);

    pending.set(0);
    actionStatus.set('read-only');
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });

  it('lastAppliedAction ignora le azioni di altre scene', () => {
    history.set([logEntry({ sceneId: 'other-scene' })]);

    expect(store.lastAppliedAction()).toBeNull();
  });
});
