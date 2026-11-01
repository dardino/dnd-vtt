import { HttpErrorResponse } from '@angular/common/http';
import type { Display, Viewport } from '@dnd-vtt/shared';
import type { ProgramService } from '../../core/program.service';
import {
  screenViewportOf,
  stateWithViewport,
  withDialogViewport,
  withDisplay,
  withDisplayVersion,
  type ScreenSummary,
} from './regia-summary';

export interface RegiaViewportPatch {
  screenViewport?: Viewport | null;
  screenDialog?: ScreenSummary | null;
  screens?: ScreenSummary[];
}

export interface RegiaViewportHost {
  dialog(): ScreenSummary | null;
  screens(): ScreenSummary[];
  viewport(): Viewport | null;
  patch(patch: RegiaViewportPatch): void;
}

/**
 * Viewport dello schermo selezionato: zoom/pan locale, debounce del salvataggio,
 * refresh ogni 2 s dell'anteprima e gestione dei 409 di versione. Lo stato vive
 * nel `RegiaStore`; qui c'è solo la logica di interazione e persistenza.
 */
export const createRegiaViewport = (programsApi: ProgramService, host: RegiaViewportHost) => {
  let screenTimer: ReturnType<typeof setInterval> | null = null;
  let screenDragging = false;
  let screenDragStart: { x: number; y: number; viewport: Viewport } = {
    x: 0,
    y: 0,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  let viewportTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingViewport: Viewport | null = null;
  let viewportSaving = false;
  let viewportSave: Promise<void> | null = null;

  const cancelPendingScreenViewport = (): void => {
    pendingViewport = null;
    if (viewportTimer !== null) {
      clearTimeout(viewportTimer);
      viewportTimer = null;
    }
  };

  const viewportDirty = (): boolean =>
    screenDragging || pendingViewport !== null || viewportSaving;

  const applyScreenViewport = (viewport: Viewport, persist: boolean): void => {
    host.patch({ screenViewport: viewport });
    const patch = withDialogViewport(host.screens(), host.dialog(), viewport);
    if (patch !== null) {
      host.patch(patch);
    }
    if (persist) {
      queueScreenViewport(viewport);
    }
  };

  const queueScreenViewport = (viewport: Viewport): void => {
    pendingViewport = viewport;
    if (viewportSaving || viewportTimer !== null) {
      return;
    }
    viewportTimer = setTimeout(() => {
      viewportTimer = null;
      void flushScreenViewport();
    }, 120);
  };

  const saveScreenViewport = async (display: Display, viewport: Viewport): Promise<void> => {
    try {
      const updated = await programsApi.putDisplayViewport(
        display.campaignId,
        display.id,
        viewport,
      );
      host.patch(withDisplayVersion(host.screens(), host.dialog(), display.id, updated.version));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        try {
          const envelope = await programsApi.getDisplayState(display.code);
          host.patch(withDisplay(host.screens(), host.dialog(), envelope.display));
        } catch {
          // Lo schermo potrebbe essere stato chiuso.
        }
      }
      if (pendingViewport === null) {
        pendingViewport = viewport;
      }
    }
  };

  const flushScreenViewport = async (): Promise<void> => {
    if (viewportSaving) {
      return;
    }
    const viewport = pendingViewport;
    pendingViewport = null;
    const summary = host.dialog();
    if (viewport === null || summary === null) {
      return;
    }
    viewportSaving = true;
    const save = saveScreenViewport(summary.display, viewport);
    viewportSave = save;
    try {
      await save;
    } finally {
      if (viewportSave === save) {
        viewportSave = null;
      }
      viewportSaving = false;
      if (pendingViewport !== null) {
        queueScreenViewport(pendingViewport);
      }
    }
  };

  const waitForViewportSave = async (): Promise<void> => {
    let save = viewportSave;
    while (save !== null) {
      await save;
      save = viewportSave;
    }
  };

  const stopScreenPolling = (): void => {
    if (screenTimer !== null) {
      clearInterval(screenTimer);
      screenTimer = null;
    }
  };

  const refreshScreenDialog = async (): Promise<void> => {
    const current = host.dialog();
    if (current === null) {
      return;
    }
    try {
      const envelope = await programsApi.getDisplayState(current.display.code);
      const dirty = viewportDirty();
      let state = envelope.state;
      const localViewport = host.viewport();
      if (dirty && localViewport !== null) {
        state = stateWithViewport(state, localViewport);
      }
      const updated: ScreenSummary = { display: envelope.display, state };
      host.patch({
        screenDialog: updated,
        screens: host.screens().map((item) =>
          (item.display.id === updated.display.id ? updated : item)),
      });
      const nextViewport = state.composition.base.type === 'map'
        ? state.composition.base.viewport ?? null
        : null;
      if (!dirty && nextViewport !== null) {
        host.patch({ screenViewport: nextViewport });
      }
    } catch {
      // Lo schermo può essere stato revocato mentre il dialog è aperto.
    }
  };

  const startScreenPolling = (): void => {
    stopScreenPolling();
    screenTimer = setInterval(() => {
      void refreshScreenDialog();
    }, 2000);
  };

  const openScreenDialog = (summary: ScreenSummary): void => {
    host.patch({
      screenDialog: summary,
      screenViewport: screenViewportOf(summary),
    });
    startScreenPolling();
    void refreshScreenDialog();
  };

  const closeScreenDialog = (): void => {
    host.patch({ screenDialog: null, screenViewport: null });
    screenDragging = false;
    cancelPendingScreenViewport();
    stopScreenPolling();
  };

  const zoomBy = (factor: number): void => {
    const viewport = host.viewport();
    if (viewport === null) {
      return;
    }
    applyScreenViewport({
      ...viewport,
      zoom: Math.max(0.2, Math.min(5, viewport.zoom * factor)),
    }, true);
  };

  const resetView = (): void => {
    const state = host.dialog()?.state;
    const scene = state?.composition.base.type === 'map'
      ? state.composition.base.scene
      : undefined;
    if (scene === undefined) {
      applyScreenViewport({ x: 0, y: 0, zoom: 1 }, true);
      return;
    }
    applyScreenViewport({
      x: scene.widthPx / 2,
      y: scene.heightPx / 2,
      zoom: 1,
    }, true);
  };

  const startPan = (x: number, y: number): void => {
    const viewport = host.viewport();
    if (viewport === null) {
      return;
    }
    screenDragging = true;
    screenDragStart = { x, y, viewport };
  };

  const movePan = (x: number, y: number, rect: { width: number; height: number }): void => {
    if (!screenDragging) {
      return;
    }
    const start = screenDragStart.viewport;
    const dx = x - screenDragStart.x;
    const dy = y - screenDragStart.y;
    const base = host.dialog()?.state?.composition.base;
    const scene = base?.type === 'map' ? base.scene : undefined;
    const fit = scene === undefined
      ? 1
      : Math.min(rect.width / scene.widthPx, rect.height / scene.heightPx);
    const scale = Math.max(0.01, fit * start.zoom);
    applyScreenViewport({
      x: start.x - dx / scale,
      y: start.y - dy / scale,
      zoom: start.zoom,
    }, true);
  };

  const endPan = (): void => {
    screenDragging = false;
  };

  return {
    openScreenDialog,
    closeScreenDialog,
    refreshScreenDialog,
    putViewport: saveScreenViewport,
    zoomBy,
    resetView,
    startPan,
    movePan,
    endPan,
    waitForViewportSave,
    cancelPendingScreenViewport,
    isViewportDirty: viewportDirty,
    /** Ferma polling e salvataggi in sospeso e azzera l'anteprima alla distruzione. */
    dispose: (): void => {
      stopScreenPolling();
      cancelPendingScreenViewport();
      screenDragging = false;
      host.patch({ screenDialog: null, screenViewport: null });
    },
  };
};
