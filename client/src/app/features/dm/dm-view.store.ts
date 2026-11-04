import { computed, inject } from '@angular/core';
import {
  DEFAULT_ACTOR_PORTRAIT,
  computeVisionGrid,
  defaultBackgroundTransform,
  fogBrushRadius,
  gridDrawingWidth,
  startsOf,
  tokenCenterCell,
  type Actor,
  type PublicDoor,
  type TokenState,
  type VisionGrid,
  type VisionSource,
} from '@dnd-vtt/shared';
import { signalStore, withComputed, withMethods } from '@ngrx/signals';
import { ActionStore } from '../../core/stores/action.store';
import { AuthService } from '../../core/auth/auth.service';
import { MeasurementService } from '../../core/ui/measurement.service';
import { SceneStore } from '../../core/stores/scene.store';
import type { ActorPortraitThumb } from '../scene/scene-canvas.component';
import { CampaignShellStore } from './campaign-shell.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmUiStore } from './dm-ui.store';
import { RegiaStore } from './regia.store';
import { SceneToolsStore } from './scene-tools.store';

/**
 * Proiezioni derivate della console DM: tutto ciò che la pagina calcolava dai
 * signal di scena, azioni, campagna, strumenti e regia. Nessuna scrittura:
 * gli store restano proprietari dello stato e la pagina espone solo alias.
 */
export const DmViewStore = signalStore(
  { providedIn: 'root' },
  withComputed(() => {
    const auth = inject(AuthService);
    const sceneStore = inject(SceneStore);
    const actions = inject(ActionStore);
    const shell = inject(CampaignShellStore);
    const campaign = inject(DmCampaignStore);
    const sceneTools = inject(SceneToolsStore);
    const regia = inject(RegiaStore);
    const ui = inject(DmUiStore);
    const units = inject(MeasurementService);

    const state = computed(() => sceneStore.snapshot()?.state ?? null);
    const grid = computed(() => state()?.grid ?? null);
    const tokens = computed((): TokenState[] => state()?.tokens ?? []);
    const activeScene = campaign.activeScene;

    const partyPcs = computed(() =>
      shell.party().filter((actor) => actor.kind === 'pc'));

    const blackout = computed(() => regia.programState()?.blackout === true);

    const fogBrushRadiusPx = computed(() =>
      fogBrushRadius(grid()?.cellSizePx ?? 100, sceneTools.fogBrushCells()));

    return {
      /** Trasformazione sfondo della scena attiva, con default condiviso. */
      backgroundTransform: computed(() =>
        activeScene()?.backgroundTransform ?? defaultBackgroundTransform),

      /** Errore dell'ultimo login, mostrato nel dialogo. */
      loginError: computed(() => auth.error()),

      hasCampaigns: computed(() => shell.campaigns().length > 0),

      /** Snapshot della scena attiva, incluso `stateVersion` per la statusbar. */
      snapshot: computed(() => sceneStore.snapshot()),

      partyPcs,

      startOptions: computed(() => {
        const doc = campaign.prepareDoc();
        return doc === null ? [] : startsOf(doc);
      }),

      /** Porte della scena in forma pubblica per il canvas. */
      dmDoors: computed<PublicDoor[]>(() =>
        (state()?.terrain.walls ?? [])
          .filter((wall) => wall.kind === 'door')
          .map((wall) => ({
            id: wall.id,
            a: wall.a,
            b: wall.b,
            state: wall.door === 'open' ? 'open' : 'closed',
          }))),

      /** Griglia di visione calcolata dai sensi dei token del party. */
      visionGrid: computed<VisionGrid | null>(() => {
        const sceneState = state();
        const scene = activeScene();
        if (
          sceneState === null
          || scene === null
          || !sceneState.terrain.visionEnabled
          || sceneState.grid.type !== 'square'
        ) {
          return null;
        }
        const actors = shell.party();
        const sources: VisionSource[] = sceneState.tokens.flatMap((token) => {
          const actor = token.actorId === undefined
            ? undefined
            : actors.find((entry) => entry.id === token.actorId);
          if (actor === undefined || (actor.kind !== 'pc' && token.owner !== 'players')) {
            return [];
          }
          const senses = actor.statblock.senses;
          return [{
            cell: tokenCenterCell(token),
            ...(senses.darkvision === undefined ? {} : { darkvision: senses.darkvision }),
            ...(senses.blindsight === undefined ? {} : { blindsight: senses.blindsight }),
            ...(senses.truesight === undefined ? {} : { truesight: senses.truesight }),
            ...(senses.tremorsense === undefined ? {} : { tremorsense: senses.tremorsense }),
            ...(token.light === undefined ? {} : { light: token.light }),
          }];
        });
        return computeVisionGrid({
          widthPx: scene.widthPx,
          heightPx: scene.heightPx,
          grid: sceneState.grid,
          terrain: sceneState.terrain,
          sources,
        });
      }),

      selectedToken: computed<TokenState | null>(() => {
        const id = ui.selectedTokenId();
        return tokens().find((token) => token.id === id) ?? null;
      }),

      syncLabel: computed(() => {
        const status = actions.status();
        if (status === 'pending') {
          return `pending ${actions.pending()}`;
        }
        return status;
      }),

      readOnly: computed(() => actions.status() === 'read-only'),

      slots: computed<(Actor | null)[]>(() => {
        const actors = shell.party()
          .filter((actor) => actor.kind === 'pc')
          .slice(0, 10);
        return Array.from({ length: 10 }, (_, index) => actors[index] ?? null);
      }),

      actorPortraits: computed<Record<string, ActorPortraitThumb>>(() => {
        const urls = shell.actorAssetUrls();
        const portraits: Record<string, ActorPortraitThumb> = {};
        for (const actor of shell.party()) {
          if (actor.imageAssetId === null) {
            continue;
          }
          const url = urls[actor.imageAssetId];
          if (url === undefined) {
            continue;
          }
          const portrait = actor.portrait ?? DEFAULT_ACTOR_PORTRAIT;
          portraits[actor.id] = { url, ...portrait };
        }
        return portraits;
      }),

      blackout,

      airLabel: computed(() => {
        if (campaign.mode() !== 'ready' || regia.connectedDisplays() === 0) {
          return 'OFF AIR';
        }
        return blackout() ? 'BLACKOUT' : 'ON AIR';
      }),

      zoomLabel: computed(() => `${Math.round(ui.zoom() * 100)}%`),

      measureLabel: computed(() => {
        const measure = sceneTools.measure();
        return measure === null ? '—' : units.formatDistance(measure.feet);
      }),

      fogBrushRadiusPx,

      fogBrushDiameterPx: computed(() => Math.round(fogBrushRadiusPx() * 2)),

      pencilWidthPx: computed(() =>
        gridDrawingWidth(grid()?.cellSizePx ?? 70, sceneTools.pencilTenths() / 10)),
    };
  }),
  withMethods(() => {
    const shell = inject(CampaignShellStore);

    return {
      /** Ritratto del canvas per un attore, o `null` se l'asset manca. */
      portraitFor(actor: Actor): ActorPortraitThumb | null {
        if (actor.imageAssetId === null) {
          return null;
        }
        const url = shell.actorAssetUrls()[actor.imageAssetId];
        if (url === undefined) {
          return null;
        }
        return { url, ...(actor.portrait ?? DEFAULT_ACTOR_PORTRAIT) };
      },
    };
  }),
);
