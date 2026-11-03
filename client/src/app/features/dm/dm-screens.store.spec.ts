import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createDefaultSceneState,
  defaultBackgroundTransform,
  type Campaign,
  type Display,
  type ProgramVersion,
  type Scene,
  type SceneSnapshot,
  type Viewport,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmScreensStore } from './dm-screens.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmUiStore } from './dm-ui.store';
import { RegiaStore, type ScreenSummary } from './regia.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const DISPLAY_ID = '0190f000-0000-7000-8000-000000000003';
const START_VIEW: Viewport = { x: 12, y: 34, zoom: 2 };

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
  backgroundTransform: defaultBackgroundTransform,
  widthPx: 1920,
  heightPx: 1080,
  stateVersion: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
});

const display = (code = 'ABCD1234'): Display => ({
  id: DISPLAY_ID,
  campaignId: CAMPAIGN_ID,
  code,
  label: 'Schermo giocatori',
  compositionVersion: 1,
  viewportWidth: 1920,
  viewportHeight: 1080,
  createdAt: '2026-11-01T10:00:00.000Z',
  lastSeenAt: '2026-11-01T10:05:00.000Z',
  revokedAt: null,
});

const summary = (code = 'ABCD1234'): ScreenSummary => ({
  display: display(code),
  state: null,
});

const program = (blackout = false): ProgramVersion => ({
  version: 3,
  state: {
    base: {
      id: 'base',
      content: { type: 'blank' },
      frame: { x: 0, y: 0, width: 1, height: 1 },
      opacity: 1,
      interactive: false,
    },
    overlays: [],
    hud: { dice: true, initiative: true, pointer: true },
    blackout,
    background: '#000000',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
});

const snapshot = (): SceneSnapshot => ({
  scene: scene(),
  state: { ...createDefaultSceneState(), startView: START_VIEW },
  stateVersion: 1,
});

interface ScreensHarness {
  store: InstanceType<typeof DmScreensStore>;
  activeCampaign: WritableSignal<Campaign | null>;
  activeScene: WritableSignal<Scene | null>;
  screens: WritableSignal<ScreenSummary[]>;
  busy: WritableSignal<boolean>;
  state: WritableSignal<SceneSnapshot | null>;
  createDisplay: ReturnType<typeof vi.fn>;
  takeSceneTo: ReturnType<typeof vi.fn>;
  putProgram: ReturnType<typeof vi.fn>;
  setStatusMessage: ReturnType<typeof vi.fn>;
  setNotice: ReturnType<typeof vi.fn>;
}

const createHarness = (): ScreensHarness => {
  const activeCampaign = signal<Campaign | null>(campaign());
  const activeScene = signal<Scene | null>(scene());
  const screens = signal<ScreenSummary[]>([]);
  const busy = signal(false);
  const state = signal<SceneSnapshot | null>(snapshot());
  const createDisplay = vi.fn().mockResolvedValue(display());
  const takeSceneTo = vi.fn().mockResolvedValue(display());
  const putProgram = vi.fn().mockImplementation(
    (_campaignId: string, mutate: (state: ProgramVersion['state']) => ProgramVersion['state']) =>
      Promise.resolve({ version: 4, state: mutate(program().state) }),
  );
  const setStatusMessage = vi.fn();
  const setNotice = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      {
        provide: RegiaStore,
        useValue: {
          screens,
          busy,
          createDisplay,
          takeSceneTo,
          putProgram,
        },
      },
      { provide: CampaignShellStore, useValue: { activeCampaign } },
      { provide: DmCampaignStore, useValue: { activeScene } },
      { provide: SceneStore, useValue: { snapshot: state } },
      { provide: DmUiStore, useValue: { setStatusMessage, setNotice } },
    ],
  });

  return {
    store: TestBed.inject(DmScreensStore),
    activeCampaign,
    activeScene,
    screens,
    busy,
    state,
    createDisplay,
    takeSceneTo,
    putProgram,
    setStatusMessage,
    setNotice,
  };
};

let h: ScreensHarness;

describe('DmScreensStore', () => {
  beforeEach(() => {
    h = createHarness();
  });

  it('apre un display e lo notifica nella statusbar', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    await h.store.openScreen();

    expect(h.createDisplay).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(open).toHaveBeenCalledWith('/display/ABCD1234', '_blank');
    expect(h.setStatusMessage).toHaveBeenCalledWith('Schermo aperto: ABCD1234');
    open.mockRestore();
  });

  it('riporta il fallback quando l’apertura dello schermo fallisce', async () => {
    h.createDisplay.mockRejectedValue(new Error('boom'));

    await h.store.openScreen();

    expect(h.setStatusMessage).toHaveBeenCalledWith(
      'Operazione non riuscita. Controlla il server e riprova.',
    );
  });

  it('senza schermi online mostra un avviso e non apre il target', () => {
    h.store.takeScene();

    expect(h.setNotice).toHaveBeenCalledWith(
      'Nessuno schermo online: apri uno schermo prima di mandare in onda.',
    );
    expect(h.store.takeTargetOpen()).toBe(false);
    expect(h.takeSceneTo).not.toHaveBeenCalled();
  });

  it('con un solo schermo manda subito in onda', async () => {
    h.screens.set([summary()]);

    h.store.takeScene();
    await Promise.resolve();

    expect(h.store.takeTargetOpen()).toBe(false);
    expect(h.takeSceneTo).toHaveBeenCalledWith(CAMPAIGN_ID, scene(), summary(), START_VIEW);
    expect(h.setStatusMessage).toHaveBeenCalledWith('In onda su ABCD1234: Ingresso');
  });

  it('con più schermi apre il dialogo di scelta', () => {
    h.screens.set([summary('ABCD1234'), summary('EFGH5678')]);

    h.store.takeScene();

    expect(h.store.takeTargetOpen()).toBe(true);
    expect(h.takeSceneTo).not.toHaveBeenCalled();
  });

  it('takeSceneTo chiude il target e usa la startView dello snapshot', async () => {
    h.screens.set([summary('ABCD1234'), summary('EFGH5678')]);
    h.store.takeScene();
    expect(h.store.takeTargetOpen()).toBe(true);

    await h.store.takeSceneTo(summary('EFGH5678'));

    expect(h.store.takeTargetOpen()).toBe(false);
    expect(h.takeSceneTo).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      scene(),
      summary('EFGH5678'),
      START_VIEW,
    );
    expect(h.setStatusMessage).toHaveBeenCalledWith('In onda su ABCD1234: Ingresso');
  });

  it('takeSceneTo non fa nulla senza scena attiva', async () => {
    h.activeScene.set(null);

    await h.store.takeSceneTo(summary());

    expect(h.takeSceneTo).not.toHaveBeenCalled();
    expect(h.store.takeTargetOpen()).toBe(false);
  });

  it('inverte il blackout e aggiorna il messaggio', async () => {
    await h.store.toggleBlackout();

    expect(h.putProgram).toHaveBeenCalledWith(CAMPAIGN_ID, expect.any(Function));
    expect(h.setStatusMessage).toHaveBeenCalledWith('Schermo in blackout');
  });
});
