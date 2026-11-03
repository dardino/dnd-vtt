import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createDefaultSceneState, type SceneSnapshot, type TokenState } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneStore } from './scene.store';
import { ToastService } from './toast.service';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const OTHER_SCENE_ID = '0190f000-0000-7000-8000-000000000099';

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

const snapshot = (
  id: string = SCENE_ID,
  name = 'Ingresso',
  stateVersion = 1,
): SceneSnapshot => ({
  scene: {
    id,
    campaignId: CAMPAIGN_ID,
    name,
    imageAssetId: null,
    backgroundTransform: { x: 0, y: 0, scale: 1 },
    widthPx: 1920,
    heightPx: 1080,
    stateVersion,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
  },
  state: createDefaultSceneState(),
  stateVersion,
});

const sceneUrl = (id: string): string => `/api/v1/scenes/${id}/snapshot?force=true`;

describe('SceneStore', () => {
  let store: InstanceType<typeof SceneStore>;
  let http: HttpTestingController;
  let toasts: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SceneStore);
    http = TestBed.inject(HttpTestingController);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    for (const toast of toasts.toasts()) {
      toasts.dismiss(toast.id);
    }
    http.verify();
  });

  /** Il resource parte in un effect: il primo tick crea la richiesta HTTP. */
  const startLoad = (sceneId: string): Promise<void> => {
    const loading = store.load(sceneId);
    TestBed.tick();
    return loading;
  };

  const settle = async (loading: Promise<void>): Promise<void> => {
    await TestBed.inject(ApplicationRef).whenStable();
    await loading;
    TestBed.tick();
  };

  const loadScene = async (sceneId = SCENE_ID, stateVersion = 1): Promise<void> => {
    const loading = startLoad(sceneId);
    http.expectOne(sceneUrl(sceneId)).flush(snapshot(sceneId, 'Ingresso', stateVersion));
    await settle(loading);
  };

  it('carica lo snapshot dal server', async () => {
    await loadScene();

    expect(store.stateVersion()).toBe(1);
    expect(store.snapshot()?.scene.name).toBe('Ingresso');
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('espone l’errore 404 con il messaggio di scena non più esistente', async () => {
    const loading = startLoad(SCENE_ID);
    http.expectOne(sceneUrl(SCENE_ID)).flush(
      { error: { message: 'not found' } },
      { status: 404, statusText: 'Not Found' },
    );
    await settle(loading);

    expect(store.loading()).toBe(false);
    expect(store.error()).toBe('La scena non esiste più.');
    expect(store.snapshot()).toBeNull();
    expect(toasts.toasts()).toEqual([
      expect.objectContaining({ message: 'La scena non esiste più.', kind: 'error' }),
    ]);
  });

  it('cambio scena: la risposta vecchia arrivata dopo non sovrascrive la nuova', async () => {
    const first = startLoad(SCENE_ID);
    const oldRequest = http.expectOne(sceneUrl(SCENE_ID));

    const second = startLoad(OTHER_SCENE_ID);
    http.expectOne(sceneUrl(OTHER_SCENE_ID)).flush(snapshot(OTHER_SCENE_ID, 'Cripta', 4));
    await settle(second);

    expect(store.snapshot()?.scene.id).toBe(OTHER_SCENE_ID);
    expect(store.snapshot()?.scene.name).toBe('Cripta');
    expect(store.stateVersion()).toBe(4);

    // La risposta della scena precedente arriva solo ora: va scartata.
    oldRequest.flush(snapshot(SCENE_ID, 'Ingresso', 1));
    await TestBed.inject(ApplicationRef).whenStable();
    await first;

    expect(store.snapshot()?.scene.id).toBe(OTHER_SCENE_ID);
    expect(store.stateVersion()).toBe(4);
  });

  it('ricarica la stessa scena con reload()', async () => {
    await loadScene();

    const reloading = startLoad(SCENE_ID);
    http.expectOne(sceneUrl(SCENE_ID)).flush(snapshot(SCENE_ID, 'Ingresso', 2));
    await settle(reloading);

    expect(store.stateVersion()).toBe(2);
  });

  it('dopo clear() la stessa scena viene riletta con force=true', async () => {
    await loadScene();

    store.clear();
    const loading = startLoad(SCENE_ID);
    http.expectOne(sceneUrl(SCENE_ID)).flush(snapshot(SCENE_ID, 'Ingresso', 3));
    await settle(loading);

    expect(store.snapshot()?.scene.id).toBe(SCENE_ID);
    expect(store.stateVersion()).toBe(3);
  });

  it('applica solo le azioni canoniche della scena corrente', async () => {
    await loadScene();

    store.applyServerAction({
      id: '0190f000-0000-7000-8000-000000000003',
      sceneId: '0190f000-0000-7000-8000-000000000098',
      type: 'token.add',
      label: 'Token aggiunto: Goblin',
      stateVersion: 5,
      action: { type: 'token.add', token: token() },
      inverse: { type: 'token.remove', tokenId: 'goblin-1' },
      at: '2026-10-28T10:01:00.000Z',
    });
    expect(store.snapshot()?.state.tokens).toHaveLength(0);

    store.applyServerAction({
      id: '0190f000-0000-7000-8000-000000000004',
      sceneId: SCENE_ID,
      type: 'token.add',
      label: 'Token aggiunto: Goblin',
      stateVersion: 2,
      action: { type: 'token.add', token: token() },
      inverse: { type: 'token.remove', tokenId: 'goblin-1' },
      at: '2026-10-28T10:01:00.000Z',
    });
    expect(store.snapshot()?.state.tokens).toHaveLength(1);
    expect(store.stateVersion()).toBe(2);
  });

  it('applica in modo ottimistico e conferma la versione senza duplicare', async () => {
    await loadScene();

    store.applyOptimistic({ type: 'token.add', token: token() });
    expect(store.snapshot()?.state.tokens).toHaveLength(1);
    expect(store.stateVersion()).toBe(1);

    store.ackVersion(2);
    expect(store.stateVersion()).toBe(2);
    expect(store.snapshot()?.stateVersion).toBe(2);

    store.applyServerAction({
      id: '0190f000-0000-7000-8000-000000000005',
      sceneId: SCENE_ID,
      type: 'token.add',
      label: 'Token aggiunto: Goblin',
      stateVersion: 2,
      action: { type: 'token.add', token: token() },
      inverse: { type: 'token.remove', tokenId: 'goblin-1' },
      at: '2026-10-28T10:01:00.000Z',
    });
    expect(store.snapshot()?.state.tokens).toHaveLength(1);
  });
});
