import { computed, inject, signal } from '@angular/core';
import {
  type ActionLogEntry,
  type Drawing,
  type FogOp,
  type GameAction,
  type GridConfig,
  type Scene,
  type SceneState,
} from '@dnd-vtt/shared';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { ActionStore } from '../../core/stores/action.store';
import { httpMessage } from '../../core/api/http-error';
import { SceneActionService } from '../../core/services/scene-action.service';
import { SceneStore } from '../../core/stores/scene.store';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';
import { SceneTokensStore } from './scene-tokens.store';

type FogConfirm = 'reveal' | 'hide';

/**
 * Fog, griglia e history della scena attiva. Le azioni passano da
 * `SceneTokensStore.send`, mentre undo/redo/reset-fog usano
 * `SceneActionService` e riallineano lo snapshot. La pagina resta
 * proprietaria della scena selezionata e le passa ogni volta.
 */
export const SceneFogStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    /** Modalità in attesa di conferma nel dialog fog. */
    fogConfirm: signal<FogConfirm | null>(null),
  })),
  withComputed(() => {
    const sceneStore = inject(SceneStore);
    const actions = inject(ActionStore);

    const state = computed<SceneState | null>(() => sceneStore.snapshot()?.state ?? null);
    const readOnly = computed(() => actions.status() === 'read-only');

    const lastAppliedAction = computed<ActionLogEntry | null>(() => {
      const sceneId = sceneStore.snapshot()?.scene.id;
      if (sceneId === undefined) {
        return null;
      }
      return actions.history()
        .find((entry) => entry.sceneId === sceneId && entry.status === 'applied') ?? null;
    });

    const undoneActions = computed(() =>
      actions.history().filter((entry) => entry.status === 'undone').length);

    return {
      state,
      grid: computed<GridConfig | null>(() => state()?.grid ?? null),
      sceneDoors: computed(() =>
        (state()?.terrain.walls ?? []).filter((wall) => wall.kind === 'door')),
      sceneLights: computed(() => state()?.terrain.lights ?? []),
      fogOverrideActive: computed(() => state()?.terrain.visionEnabled === true
        && state()?.grid.type === 'square'),
      undoneActions,
      lastAppliedAction,
      canUndo: computed(() =>
        !readOnly() && actions.pending() === 0 && lastAppliedAction() !== null),
      canRedo: computed(() =>
        !readOnly() && actions.pending() === 0 && undoneActions() > 0),
    };
  }),
  withMethods((store) => {
    const sceneStore = inject(SceneStore);
    const shell = inject(CampaignShellStore);
    const actions = inject(ActionStore);
    const sceneActions = inject(SceneActionService);
    const ui = inject(DmUiStore);
    const tokens = inject(SceneTokensStore);

    const send = async (sceneId: string | null, action: GameAction) =>
      tokens.send(sceneId, action);

    const clearHistory = async (): Promise<boolean> => {
      const campaign = shell.activeCampaign();
      if (campaign === null) {
        return false;
      }
      try {
        const result = await sceneActions.clearHistory(campaign.id);
        await actions.refreshHistory(campaign.id);
        ui.setStatusMessage(`History svuotata: ${result.cleared} azioni rimosse.`);
        return true;
      } catch (error) {
        ui.setNotice(messageFor(error));
        return false;
      }
    };

    const undoThrough = async (scene: Scene | null, entryId: string): Promise<void> => {
      const campaign = shell.activeCampaign();
      if (campaign === null || scene === null) {
        return;
      }
      try {
        const result = await sceneActions.undo(campaign.id, entryId);
        await sceneStore.load(scene.id);
        await actions.refreshHistory(campaign.id);
        ui.setStatusMessage(`${result.undone} azioni annullate.`);
      } catch {
        ui.setStatusMessage('Annullamento non riuscito.');
      }
    };

    return {
      async toggleDoor(
        scene: Scene | null,
        door: SceneState['terrain']['walls'][number],
      ): Promise<void> {
        if (door.kind !== 'door') {
          return;
        }
        await send(scene?.id ?? null, {
          type: 'terrain.door',
          wallId: door.id,
          state: door.door === 'open' ? 'closed' : 'open',
        });
      },

      async toggleLight(
        scene: Scene | null,
        light: SceneState['terrain']['lights'][number],
      ): Promise<void> {
        await send(scene?.id ?? null, {
          type: 'terrain.light',
          lightId: light.id,
          enabled: !light.enabled,
        });
      },

      async toggleVision(scene: Scene | null, enabled: boolean): Promise<void> {
        await send(scene?.id ?? null, { type: 'terrain.vision', enabled });
      },

      async changeGridType(scene: Scene | null, event: Event): Promise<void> {
        if (scene?.mapId) {
          ui.setNotice('Griglia bloccata: modificala dall’editor della mappa.');
          return;
        }
        const value = (event.target as HTMLSelectElement).value;
        const grid = store.grid();
        if (grid === null || (value !== 'square' && value !== 'hex')) {
          return;
        }
        await send(scene?.id ?? null, { type: 'grid.update', grid: { ...grid, type: value } });
        ui.setStatusMessage(value === 'hex' ? 'Griglia esagonale odd-r' : 'Griglia quadrata');
      },

      async changeGridSize(scene: Scene | null, event: Event): Promise<void> {
        if (scene?.mapId) {
          ui.setNotice('Griglia bloccata: modificala dall’editor della mappa.');
          return;
        }
        const value = Number((event.target as HTMLInputElement).value);
        const grid = store.grid();
        if (grid === null || !Number.isFinite(value)) {
          return;
        }
        const cellSizePx = Math.max(16, Math.min(400, Math.round(value)));
        await send(scene?.id ?? null, { type: 'grid.update', grid: { ...grid, cellSizePx } });
        ui.setStatusMessage(`Cella: ${cellSizePx} px`);
      },

      clearHistory,

      async resetFog(sceneId: string | null): Promise<boolean> {
        const campaign = shell.activeCampaign();
        if (campaign === null || sceneId === null) {
          return false;
        }
        try {
          const result = await sceneActions.resetFog(campaign.id, sceneId);
          await sceneStore.load(sceneId);
          await actions.refreshHistory(campaign.id);
          ui.setStatusMessage(`FOG ripristinata: ${result.cleared} azioni fog rimosse.`);
          return true;
        } catch (error) {
          ui.setNotice(messageFor(error));
          return false;
        }
      },

      async onFogApplied(sceneId: string | null, op: FogOp): Promise<void> {
        await send(sceneId, { type: 'fog.apply', op });
        ui.setStatusMessage(op.op === 'reveal' ? 'Fog: area rivelata' : 'Fog: area nascosta');
      },

      async onDrawingAdded(sceneId: string | null, drawing: Drawing): Promise<void> {
        await send(sceneId, { type: 'drawing.add', drawing });
        ui.setStatusMessage('Disegno aggiunto');
      },

      revealAll(): void {
        store.fogConfirm.set('reveal');
      },

      hideAll(): void {
        store.fogConfirm.set('hide');
      },

      async confirm(scene: Scene | null): Promise<void> {
        const mode = store.fogConfirm();
        store.fogConfirm.set(null);
        if (mode === null) {
          return;
        }
        const sceneId = scene?.id ?? null;
        if (store.fogOverrideActive()) {
          await send(sceneId, { type: 'fog.override', override: mode });
          ui.setStatusMessage(mode === 'reveal' ? 'Fog: rivela tutto' : 'Fog: nascondi tutto');
          return;
        }
        if (mode === 'reveal') {
          await send(sceneId, { type: 'fog.replace', base: 'revealed', ops: [] });
          ui.setStatusMessage('Fog: tutta la mappa rivelata');
        } else {
          await send(sceneId, { type: 'fog.replace', base: 'hidden', ops: [] });
          ui.setStatusMessage('Fog: tutta la mappa nascosta');
        }
      },

      async clearOverride(sceneId: string | null): Promise<void> {
        await send(sceneId, { type: 'fog.override', override: 'none' });
        ui.setStatusMessage('Fog: torna alla visione automatica');
      },

      cancel(): void {
        store.fogConfirm.set(null);
      },

      async undoLast(scene: Scene | null): Promise<void> {
        const campaign = shell.activeCampaign();
        if (campaign === null) {
          return;
        }
        await actions.refreshHistory(campaign.id);
        const entry = store.lastAppliedAction();
        if (entry === null) {
          return;
        }
        await undoThrough(scene, entry.id);
      },

      undoThrough,

      async redoLastBatch(scene: Scene | null): Promise<void> {
        const campaign = shell.activeCampaign();
        if (campaign === null || scene === null) {
          return;
        }
        try {
          const result = await sceneActions.redo(campaign.id);
          await sceneStore.load(scene.id);
          await actions.refreshHistory(campaign.id);
          ui.setStatusMessage(`${result.redone} azioni ripristinate.`);
        } catch {
          ui.setStatusMessage('Nessuna azione da ripetere.');
        }
      },
    };
  }),
);

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
  },
});
