import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type {
  Display,
  DisplayState,
  DisplayStateEnvelope,
  ProgramLayer,
  ProgramVersion,
  Scene,
  Viewport,
} from '@dnd-vtt/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgramService } from '../../core/program.service';
import { RegiaStore, type ScreenSummary } from './regia.store';

const CAMPAIGN_ID = '0190f000-0000-7000-8000-000000000001';
const SCENE_ID = '0190f000-0000-7000-8000-000000000002';
const DISPLAY_ID = '0190f000-0000-7000-8000-000000000003';

const layer = (): ProgramLayer => ({
  id: 'base',
  content: { type: 'blank' },
  frame: { x: 0, y: 0, width: 1, height: 1 },
  opacity: 1,
  interactive: false,
});

const program = (version = 3, blackout = false): ProgramVersion => ({
  version,
  state: {
    base: layer(),
    overlays: [],
    hud: { dice: true, initiative: true, pointer: true },
    blackout,
    background: '#000000',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
});

const display = (overrides: Partial<Display> = {}): Display => ({
  id: DISPLAY_ID,
  campaignId: CAMPAIGN_ID,
  code: 'ABCD1234',
  label: 'Schermo giocatori',
  compositionVersion: 2,
  viewportWidth: 1920,
  viewportHeight: 1080,
  createdAt: '2026-11-01T10:00:00.000Z',
  lastSeenAt: '2026-11-01T10:05:00.000Z',
  revokedAt: null,
  ...overrides,
});

const displayState = (viewport: Viewport = { x: 0, y: 0, zoom: 1 }): DisplayState => ({
  campaign: { id: CAMPAIGN_ID, name: 'La Valle' },
  compositionVersion: 2,
  program: {
    hud: { dice: true, initiative: true, pointer: true },
    blackout: false,
    background: '#000000',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
  composition: {
    base: {
      id: 'base',
      frame: { x: 0, y: 0, width: 1, height: 1 },
      opacity: 1,
      type: 'map',
      scene: {
        id: SCENE_ID,
        name: 'Ingresso',
        widthPx: 1920,
        heightPx: 1080,
        imageUrl: null,
        backgroundTransform: { x: 0, y: 0, scale: 1 },
        grid: {
          type: 'square',
          cellSizePx: 70,
          offsetX: 0,
          offsetY: 0,
          feetPerCell: 5,
          diagonalRule: '5-5-5',
          hexOffset: 'odd-r',
        },
        tokens: [],
        fog: { base: 'hidden', ops: [], override: 'none' },
      },
      viewport,
    },
    overlays: [],
  },
  rolls: [],
});

const envelope = (
  viewport: Viewport = { x: 0, y: 0, zoom: 1 },
  overrides: Partial<Display> = {},
): DisplayStateEnvelope => ({
  display: display(overrides),
  state: displayState(viewport),
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

const summary = (viewport: Viewport = { x: 0, y: 0, zoom: 1 }): ScreenSummary => ({
  display: display(),
  state: displayState(viewport),
});

interface ProgramApiFake {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  createDisplay: ReturnType<typeof vi.fn>;
  putDisplayComposition: ReturnType<typeof vi.fn>;
  putDisplayViewport: ReturnType<typeof vi.fn>;
  listOnlineDisplays: ReturnType<typeof vi.fn>;
  getDisplayState: ReturnType<typeof vi.fn>;
  revokeDisplay: ReturnType<typeof vi.fn>;
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('RegiaStore', () => {
  let store: InstanceType<typeof RegiaStore>;
  let programsApi: ProgramApiFake;

  beforeEach(() => {
    programsApi = {
      get: vi.fn().mockResolvedValue(program()),
      put: vi.fn().mockImplementation(
        (_campaignId: string, _version: number, state: ProgramVersion['state']) =>
          Promise.resolve({ version: 4, state }),
      ),
      createDisplay: vi.fn().mockResolvedValue(display()),
      putDisplayComposition: vi.fn().mockResolvedValue({
        version: 5,
        composition: displayState().composition,
      }),
      putDisplayViewport: vi.fn().mockResolvedValue({ version: 6, viewport: { x: 1, y: 2, zoom: 1 } }),
      listOnlineDisplays: vi.fn().mockResolvedValue([display()]),
      getDisplayState: vi.fn().mockResolvedValue(envelope()),
      revokeDisplay: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ProgramService, useValue: programsApi }],
    });
    store = TestBed.inject(RegiaStore);
  });

  it('carica program e schermi online, ignorando i display revocati', async () => {
    programsApi.listOnlineDisplays.mockResolvedValue([
      display(),
      display({ id: '0190f000-0000-7000-8000-000000000004', code: 'REVOKED1', revokedAt: '2026-11-01T11:00:00.000Z' }),
    ]);

    await expect(store.loadProgram(CAMPAIGN_ID)).resolves.toEqual(program());
    await store.loadScreens(CAMPAIGN_ID);

    expect(store.programState()?.blackout).toBe(false);
    expect(store.program()?.version).toBe(3);
    expect(store.screens()).toHaveLength(1);
    expect(store.screens()[0]?.state?.compositionVersion).toBe(2);
    expect(programsApi.listOnlineDisplays).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it('aggiorna la versione leggendo prima lo stato corrente', async () => {
    programsApi.get.mockResolvedValue(program(7));

    const updated = await store.putProgram(CAMPAIGN_ID, (state) => ({
      ...state,
      blackout: !state.blackout,
    }));

    expect(programsApi.put).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      7,
      expect.objectContaining({ blackout: true }),
    );
    expect(updated.state.blackout).toBe(true);
    expect(store.program()?.state.blackout).toBe(true);
    expect(store.busy()).toBe(false);
  });

  it('crea un display e ricarica la lista online', async () => {
    const expected = display();
    programsApi.createDisplay.mockResolvedValue(expected);

    const created = await store.createDisplay(CAMPAIGN_ID);
    await flush();

    expect(created).toBe(expected);
    expect(programsApi.createDisplay).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      { label: 'Schermo giocatori' },
    );
    expect(store.screens()).toHaveLength(1);
  });

  it('salva il viewport e riporta la nuova compositionVersion sugli schermi', async () => {
    programsApi.listOnlineDisplays.mockResolvedValue([display()]);
    await store.loadScreens(CAMPAIGN_ID);

    await store.putViewport(display(), { x: 1, y: 2, zoom: 1 });

    expect(programsApi.putDisplayViewport).toHaveBeenCalledWith(CAMPAIGN_ID, DISPLAY_ID, {
      x: 1,
      y: 2,
      zoom: 1,
    });
    expect(store.screens()[0]?.display.compositionVersion).toBe(6);
  });

  it('inizializza il viewport dallo schermo selezionato e lo azzera alla distruzione', () => {
    const selected = summary({ x: 10, y: 20, zoom: 2 });

    store.openScreenDialog(selected);

    expect(store.screenDialog()).toBe(selected);
    expect(store.screenViewport()).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(store.screenZoomLabel()).toBe(200);
    store.dispose();
    expect(store.screenDialog()).toBeNull();
    expect(store.screenViewport()).toBeNull();
  });

  it('ricarica il display dopo un 409 sul salvataggio del viewport', async () => {
    await store.loadScreens(CAMPAIGN_ID);
    store.openScreenDialog(summary());
    await flush();

    programsApi.putDisplayViewport.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 409 }),
    );
    const refreshed = display({ compositionVersion: 9, label: 'Schermo aggiornato' });
    programsApi.getDisplayState.mockResolvedValue({
      display: refreshed,
      state: displayState({ x: 3, y: 4, zoom: 2 }),
    });

    await store.putViewport(display(), { x: 3, y: 4, zoom: 2 });

    expect(programsApi.getDisplayState).toHaveBeenLastCalledWith(display().code);
    expect(store.screenDialog()?.display).toEqual(refreshed);
    expect(store.screens()[0]?.display).toEqual(refreshed);
    store.dispose();
    programsApi.getDisplayState.mockResolvedValue(envelope());
  });

  it('marca lo schermo senza stato se la lettura del display fallisce', async () => {
    programsApi.getDisplayState.mockRejectedValue(
      new HttpErrorResponse({ status: 404 }),
    );

    await store.loadScreens(CAMPAIGN_ID);

    expect(store.screens()).toHaveLength(1);
    expect(store.screens()[0]?.state).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('fa debounce dello zoom e coalesce i salvataggi in sospeso', async () => {
    vi.useFakeTimers();
    try {
      await store.loadScreens(CAMPAIGN_ID);
      store.openScreenDialog(summary());

      store.zoomBy(2);
      store.zoomBy(2);

      expect(store.screenViewport()).toEqual({ x: 0, y: 0, zoom: 4 });
      expect(programsApi.putDisplayViewport).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(120);

      expect(programsApi.putDisplayViewport).toHaveBeenCalledTimes(1);
      expect(programsApi.putDisplayViewport).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        DISPLAY_ID,
        { x: 0, y: 0, zoom: 4 },
      );
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it('sposta il viewport col pan e salva dopo il debounce', async () => {
    vi.useFakeTimers();
    try {
      await store.loadScreens(CAMPAIGN_ID);
      store.openScreenDialog(summary());

      store.movePan(110, 70, { width: 1920, height: 1080 });
      expect(store.screenViewport()).toEqual({ x: 0, y: 0, zoom: 1 });

      store.startPan(10, 20);
      store.movePan(110, 70, { width: 1920, height: 1080 });

      expect(store.screenViewport()).toEqual({ x: -100, y: -50, zoom: 1 });
      expect(programsApi.putDisplayViewport).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(120);

      expect(programsApi.putDisplayViewport).toHaveBeenCalledTimes(1);
      expect(programsApi.putDisplayViewport).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        DISPLAY_ID,
        { x: -100, y: -50, zoom: 1 },
      );
    } finally {
      store.dispose();
      vi.useRealTimers();
    }
  });

  it('manda in onda la scena riusando il base del program', async () => {
    programsApi.get.mockResolvedValue(program());
    programsApi.getDisplayState.mockResolvedValue(envelope());
    await store.loadScreens(CAMPAIGN_ID);

    await store.takeSceneTo(CAMPAIGN_ID, scene(), summary());

    const base = program().state.base;
    expect(programsApi.putDisplayComposition).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      DISPLAY_ID,
      2,
      expect.objectContaining({
        base: expect.objectContaining({
          ...base,
          content: expect.objectContaining({ type: 'map', sceneId: SCENE_ID }),
        }),
        overlays: [],
      }),
    );
    expect(store.screens()[0]?.display.compositionVersion).toBe(5);
  });
});
