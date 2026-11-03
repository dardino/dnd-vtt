import { computed, inject } from '@angular/core';
import type {
  Display,
  ProgramComposition,
  ProgramState,
  ProgramVersion,
  Scene,
  Viewport,
} from '@dnd-vtt/shared';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ProgramService } from '../../core/services/program.service';
import {
  lastSeen,
  projectionLabel,
  withDisplay,
  type ScreenSummary,
} from './regia-summary';
import { createRegiaViewport } from './regia-viewport';

export type { ScreenSummary } from './regia-summary';

export interface RegiaState {
  /** Ultima versione letta del program (stato + versione ottimistica). */
  program: ProgramVersion | null;
  /** Schermi connessi riportati dalla presence WebSocket. */
  connectedDisplays: number;
  screens: ScreenSummary[];
  screenDialog: ScreenSummary | null;
  screenViewport: Viewport | null;
  busy: boolean;
  error: unknown;
}

export const initialRegia: RegiaState = {
  program: null,
  connectedDisplays: 0,
  screens: [],
  screenDialog: null,
  screenViewport: null,
  busy: false,
  error: null,
};

/**
 * Regia della console DM: program (blackout e composizione), schermi online,
 * anteprima dello schermo selezionato e viewport persistito. Le chiamate HTTP
 * restano su `ProgramService`; la parte viewport vive in `regia-viewport.ts`.
 */
export const RegiaStore = signalStore(
  { providedIn: 'root' },
  withState(initialRegia),
  withComputed((store) => ({
    programState: computed((): ProgramState | null => store.program()?.state ?? null),
    screenZoomLabel: computed((): number => Math.round((store.screenViewport()?.zoom ?? 1) * 100)),
    screenAspect: computed((): string => {
      const display = store.screenDialog()?.display;
      const width = display?.viewportWidth ?? 16;
      const height = display?.viewportHeight ?? 9;
      return `${width} / ${height}`;
    }),
  })),
  withMethods((store) => {
    const programsApi = inject(ProgramService);

    let pending = 0;

    const {
      openScreenDialog,
      closeScreenDialog,
      refreshScreenDialog,
      putViewport,
      zoomBy,
      resetView,
      startPan,
      movePan,
      endPan,
      isViewportDirty,
      waitForViewportSave,
      cancelPendingScreenViewport,
      dispose,
    } = createRegiaViewport(programsApi, {
      dialog: () => store.screenDialog(),
      screens: () => store.screens(),
      viewport: () => store.screenViewport(),
      patch: (patch) => patchState(store, patch),
    });

    const track = async <T>(operation: () => Promise<T>): Promise<T> => {
      pending += 1;
      patchState(store, { busy: true, error: null });
      try {
        return await operation();
      } catch (error) {
        patchState(store, { error });
        throw error;
      } finally {
        pending -= 1;
        if (pending === 0) {
          patchState(store, { busy: false });
        }
      }
    };

    const loadScreens = async (campaignId: string): Promise<void> => {
      try {
        const displays = (await programsApi.listOnlineDisplays(campaignId))
          .filter((display) => display.revokedAt === null);
        const items = await Promise.all(displays.map(async (display): Promise<ScreenSummary> => {
          try {
            const envelope = await programsApi.getDisplayState(display.code);
            return { display, state: envelope.state };
          } catch {
            return { display, state: null };
          }
        }));
        patchState(store, { screens: items, error: null });
        const open = store.screenDialog();
        if (open !== null) {
          const match = items.find((item) => item.display.id === open.display.id);
          if (match === undefined) {
            closeScreenDialog();
          } else {
            patchState(store, {
              screenDialog: { ...match, state: isViewportDirty() ? open.state : match.state },
            });
          }
        }
      } catch (error) {
        patchState(store, { screens: [], error });
      }
    };

    const putComposition = async (
      campaignId: string,
      summary: ScreenSummary,
      composition: ProgramComposition,
    ): Promise<Display> => track(async () => {
      const latest = await programsApi.getDisplayState(summary.display.code);
      const updated = await programsApi.putDisplayComposition(
        campaignId,
        summary.display.id,
        latest.display.compositionVersion,
        composition,
      );
      const display: Display = { ...summary.display, compositionVersion: updated.version };
      patchState(store, withDisplay(store.screens(), store.screenDialog(), display));
      if (store.screenDialog()?.display.id === display.id) {
        void refreshScreenDialog();
      }
      return display;
    });

    return {
      setConnectedDisplays(displays: number): void {
        patchState(store, { connectedDisplays: displays });
      },

      async loadProgram(campaignId: string): Promise<ProgramVersion> {
        try {
          const program = await programsApi.get(campaignId);
          patchState(store, { program, error: null });
          return program;
        } catch (error) {
          patchState(store, { error });
          throw error;
        }
      },

      /** Rilegge gli schermi online, preservando il viewport locale se in modifica. */
      loadScreens,

      /**
       * Legge la versione corrente del program e la riscrive con `mutate`,
       * evitando 409 quando due azioni concorrono sullo stesso documento.
       */
      async putProgram(
        campaignId: string,
        mutate: (state: ProgramState) => ProgramState,
      ): Promise<ProgramVersion> {
        return track(async () => {
          const current = await programsApi.get(campaignId);
          const updated = await programsApi.put(campaignId, current.version, mutate(current.state));
          patchState(store, { program: updated });
          return updated;
        });
      },

      putComposition,

      async createDisplay(
        campaignId: string,
        label = 'Schermo giocatori',
      ): Promise<Display> {
        return track(async () => {
          const display = await programsApi.createDisplay(campaignId, { label });
          void loadScreens(campaignId);
          return display;
        });
      },

      async revokeDisplay(campaignId: string, displayId: string): Promise<void> {
        return track(async () => {
          await programsApi.revokeDisplay(displayId);
          if (store.screenDialog()?.display.id === displayId) {
            closeScreenDialog();
          }
          await loadScreens(campaignId);
        });
      },

      /** Porta la scena attiva sullo schermo scelto, riusando il base del program. */
      async takeSceneTo(
        campaignId: string,
        scene: Scene,
        summary: ScreenSummary,
        startView?: Viewport,
      ): Promise<Display> {
        return track(async () => {
          cancelPendingScreenViewport();
          await waitForViewportSave();
          cancelPendingScreenViewport();
          const current = await programsApi.get(campaignId);
          const composition: ProgramComposition = {
            base: {
              ...current.state.base,
              content: {
                type: 'map',
                sceneId: scene.id,
                viewport: startView ?? {
                  x: scene.widthPx / 2,
                  y: scene.heightPx / 2,
                  zoom: 1,
                },
                fog: true,
                cameraLocked: false,
              },
            },
            overlays: current.state.overlays,
          };
          return putComposition(campaignId, summary, composition);
        });
      },

      openScreenDialog,
      closeScreenDialog,
      refreshScreenDialog,
      putViewport,
      zoomBy,
      resetView,
      startPan,
      movePan,
      endPan,
      dispose,
      projectionLabel,
      lastSeen,
    };
  }),
);
