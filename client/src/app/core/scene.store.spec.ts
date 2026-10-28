import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createDefaultSceneState, type SceneSnapshot, type TokenState } from '@dnd-vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneStore } from './scene.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';

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

const snapshot = (): SceneSnapshot => ({
  scene: {
    id: SCENE_ID,
    campaignId: CAMPAIGN_ID,
    name: 'Ingresso',
    imageAssetId: null,
    widthPx: 1920,
    heightPx: 1080,
    stateVersion: 1,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
  },
  state: createDefaultSceneState(),
  stateVersion: 1,
});

describe('SceneStore', () => {
  let store: InstanceType<typeof SceneStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SceneStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('carica lo snapshot dal server', async () => {
    const loading = store.load(SCENE_ID);
    http.expectOne(`/api/v1/scenes/${SCENE_ID}/snapshot?force=true`).flush(snapshot());
    await loading;

    expect(store.stateVersion()).toBe(1);
    expect(store.snapshot()?.scene.name).toBe('Ingresso');
    expect(store.error()).toBeNull();
  });

  it('applica solo le azioni canoniche della scena corrente', async () => {
    const loading = store.load(SCENE_ID);
    http.expectOne(`/api/v1/scenes/${SCENE_ID}/snapshot?force=true`).flush(snapshot());
    await loading;

    store.applyServerAction({
      id: '0190f000-0000-7000-8000-000000000003',
      sceneId: '0190f000-0000-7000-8000-000000000099',
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
});
