import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultSceneState,
  type ActionLogEntry,
  type ActionRequest,
  type AppliedAction,
  type SceneSnapshot,
  type TokenState,
} from '@dnd-vtt/shared';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionStore } from './action.store';
import { RealtimeService, type RealtimeAction, type RealtimeStatus } from './realtime.service';
import { SceneStore } from './scene.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const ACTION_ID = '0190f000-0000-7000-8000-000000000003';

const token = (): TokenState => ({
  id: 'goblin-1',
  label: 'Goblin',
  x: 1,
  y: 1,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
});

const snapshot = (stateVersion = 1): SceneSnapshot => ({
  scene: {
    id: SCENE_ID,
    campaignId: CAMPAIGN_ID,
    name: 'Ingresso',
    imageAssetId: null,
    widthPx: 1920,
    heightPx: 1080,
    stateVersion,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
  },
  state: createDefaultSceneState(),
  stateVersion,
});

const applied = (stateVersion: number): AppliedAction => ({
  id: ACTION_ID,
  sceneId: SCENE_ID,
  type: 'token.add',
  label: 'Token aggiunto: Goblin',
  stateVersion,
  action: { type: 'token.add', token: token() },
  inverse: { type: 'token.remove', tokenId: 'goblin-1' },
  at: '2026-11-01T10:00:01.000Z',
});

const entry = (stateVersion: number): ActionLogEntry => ({
  id: ACTION_ID,
  sceneId: SCENE_ID,
  actorId: null,
  clientId: 'client-test',
  origin: 'dm',
  type: 'token.add',
  label: 'Token aggiunto: Goblin',
  payload: { type: 'token.add', token: token() },
  inverse: { type: 'token.remove', tokenId: 'goblin-1' },
  status: 'applied',
  stateVersion,
  createdAt: '2026-11-01T10:00:01.000Z',
  undoneAt: null,
});

/** Sostituto minimo: il Subject è la fonte che il test controlla a mano. */
class FakeRealtimeService {
  readonly status = signal<RealtimeStatus>('idle');
  readonly events = new Subject<RealtimeAction>();
  readonly actions$ = this.events.asObservable();
}

describe('ActionStore', () => {
  let store: InstanceType<typeof ActionStore>;
  let scene: InstanceType<typeof SceneStore>;
  let http: HttpTestingController;
  let realtime: FakeRealtimeService;

  const historyUrl = `/api/v1/campaigns/${CAMPAIGN_ID}/actions`;
  const sceneUrl = `/api/v1/scenes/${SCENE_ID}/snapshot?force=true`;

  beforeEach(() => {
    vi.useFakeTimers();
    realtime = new FakeRealtimeService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeService, useValue: realtime },
      ],
    });
    store = TestBed.inject(ActionStore);
    scene = TestBed.inject(SceneStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.stop();
    http.verify();
    vi.useRealTimers();
    realtime.events.complete();
  });

  const loadScene = async (stateVersion = 1): Promise<void> => {
    const loading = scene.load(SCENE_ID);
    http.expectOne(sceneUrl).flush(snapshot(stateVersion));
    await loading;
  };

  const flushHistory = (): void => {
    http.expectOne(historyUrl).flush({ items: [] });
  };

  const start = (): void => {
    store.start(CAMPAIGN_ID, SCENE_ID);
    flushHistory();
  };

  const poll = async (items: ActionLogEntry[]): Promise<void> => {
    const version = scene.stateVersion();
    await vi.advanceTimersByTimeAsync(2000);
    http
      .expectOne(`${historyUrl}?sinceVersion=${version}&sceneId=${SCENE_ID}`)
      .flush({ items });
    await vi.advanceTimersByTimeAsync(0);
  };

  it('applica l’azione ricevuta dal WebSocket quando la versione è quella attesa', async () => {
    await loadScene(1);
    start();

    realtime.events.next(applied(2));

    expect(scene.stateVersion()).toBe(2);
    expect(scene.snapshot()?.state.tokens).toHaveLength(1);
    expect(store.status()).toBe('synced');
    flushHistory();
  });

  it('ricarica la scena quando il WebSocket salta una versione', async () => {
    await loadScene(1);
    start();

    realtime.events.next(applied(3));

    http.expectOne(sceneUrl).flush(snapshot(3));
    await vi.advanceTimersByTimeAsync(0);

    expect(scene.stateVersion()).toBe(3);
    // Il gap non applica il payload dell'evento: lo stato arriva dal server.
    expect(scene.snapshot()?.state.tokens).toHaveLength(0);
  });

  it('usa il polling solo quando il WebSocket non è aperto', async () => {
    await loadScene(1);
    start();

    await poll([entry(2)]);
    expect(scene.stateVersion()).toBe(2);
    expect(scene.snapshot()?.state.tokens).toHaveLength(1);
    flushHistory();

    realtime.status.set('open');
    await vi.advanceTimersByTimeAsync(2000);
    http.expectNone(`${historyUrl}?sinceVersion=2&sceneId=${SCENE_ID}`);
  });

  it('non applica due volte la stessa azione fra WebSocket e polling', async () => {
    await loadScene(1);
    start();

    realtime.events.next(applied(2));
    realtime.events.next(applied(2));
    expect(scene.snapshot()?.state.tokens).toHaveLength(1);
    flushHistory();

    // Il polling può restituire la stessa entry in caso di race: la cache `seen` la scarta.
    await poll([entry(2)]);
    expect(scene.snapshot()?.state.tokens).toHaveLength(1);
    expect(scene.stateVersion()).toBe(2);
    flushHistory();
  });

  it('scarta l’eco del proprio invio alla versione attesa senza riapplicarla', async () => {
    await loadScene(1);
    start();

    const sending = store.send(SCENE_ID, { type: 'token.add', token: token() });
    const post = http.expectOne(`/api/v1/campaigns/${CAMPAIGN_ID}/actions`);
    const request = post.request.body as ActionRequest;
    // L'id è già in `seen` (ottimistico) e l'evento arriva a current + 1: solo ack.
    realtime.events.next({ ...applied(2), id: request.id });

    expect(scene.stateVersion()).toBe(2);
    expect(scene.snapshot()?.state.tokens).toHaveLength(1);

    post.flush({ ...applied(2), id: request.id });
    await sending;
    flushHistory();
  });

  it('non applica eventi arrivati dopo stop', async () => {
    await loadScene(1);
    start();

    store.stop();
    realtime.events.next(applied(2));
    await vi.advanceTimersByTimeAsync(2000);

    expect(scene.stateVersion()).toBe(1);
    expect(scene.snapshot()?.state.tokens).toHaveLength(0);
  });

  it('ricarica la scena e riallinea history e lastSyncedAt su una revisione', async () => {
    await loadScene(1);
    start();

    realtime.events.next({ sceneId: SCENE_ID, stateVersion: 3 });
    http.expectOne(sceneUrl).flush(snapshot(3));
    await vi.advanceTimersByTimeAsync(0);

    expect(scene.stateVersion()).toBe(3);
    http.expectOne(historyUrl).flush({ items: [entry(3)] });
    await vi.advanceTimersByTimeAsync(0);

    expect(store.history()).toHaveLength(1);
    expect(store.lastSyncedAt()).not.toBeNull();
  });
});
