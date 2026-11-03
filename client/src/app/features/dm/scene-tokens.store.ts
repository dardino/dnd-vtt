import { computed, inject, signal } from '@angular/core';
import {
  abilityModifier,
  newId,
  SIZE_CELLS,
  snapTokenCell,
  sortInitiativeEntries,
  type Actor,
  type AppliedAction,
  type GameAction,
  type GridConfig,
  type InitiativeEntry,
  type InitiativeState,
  type Scene,
  type TokenState,
} from '@dnd-vtt/shared';
import { signalStore, withComputed, withMethods, withProps } from '@ngrx/signals';
import { ActionStore } from '../../core/action.store';
import { DiceStore } from '../../core/dice.store';
import { SceneStore } from '../../core/scene.store';
import type { ActorDropEvent, TokenMoveEvent } from '../scene/scene-canvas.component';
import { CampaignShellStore } from './campaign-shell.store';
import { DmUiStore } from './dm-ui.store';

/**
 * Token in mappa e iniziativa della console DM. Le azioni passano da
 * `ActionStore` come nel resto della pagina; qui vive solo la logica dei
 * token, mentre il canvas resta di competenza della pagina tramite
 * `focusRequest`.
 */
export const SceneTokensStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    /** Token da centrare: la pagina lo consuma con `consumeFocus`. */
    focusRequest: signal<string | null>(null),
  })),
  withComputed(() => {
    const scene = inject(SceneStore);
    return {
      tokens: computed((): TokenState[] => scene.snapshot()?.state.tokens ?? []),
      initiative: computed((): InitiativeState | null =>
        scene.snapshot()?.state.initiative ?? null),
    };
  }),
  withMethods((store) => {
    const actions = inject(ActionStore);
    const sceneStore = inject(SceneStore);
    const shell = inject(CampaignShellStore);
    const dice = inject(DiceStore);
    const ui = inject(DmUiStore);

    const send = async (
      sceneId: string | null,
      action: GameAction,
    ): Promise<AppliedAction | null> => {
      if (sceneId === null) {
        return null;
      }
      return actions.send(sceneId, action);
    };

    const grid = (): GridConfig | null => sceneStore.snapshot()?.state.grid ?? null;

    const setInitiative = async (
      sceneId: string,
      entries: InitiativeEntry[],
      active: boolean,
      round: number,
      turnIndex: number,
    ): Promise<void> => {
      await send(sceneId, {
        type: 'initiative.set',
        initiative: {
          active,
          round,
          turnIndex: Math.min(turnIndex, Math.max(0, entries.length - 1)),
          entries,
        },
      });
    };

    const spawnActorToken = async (
      scene: Scene,
      actor: Actor,
      pointX: number,
      pointY: number,
    ): Promise<void> => {
      const gridConfig = grid();
      if (gridConfig === null) {
        return;
      }
      if (actor.kind === 'pc') {
        const existing = store.tokens().find((token) => token.actorId === actor.id);
        if (existing !== undefined) {
          ui.setSelectedTokenId(existing.id);
          store.focusRequest.set(existing.id);
          ui.setStatusMessage(`${actor.name} è già in mappa.`);
          return;
        }
      }
      const size = SIZE_CELLS[actor.statblock.size];
      const cell = snapTokenCell(gridConfig, { x: pointX, y: pointY }, size);
      const hp = actor.hp ?? { current: 1, max: 1, temp: 0 };
      const token: TokenState = {
        id: newId(),
        actorId: actor.id,
        label: actor.name,
        x: cell.x,
        y: cell.y,
        size,
        rotation: 0,
        elevation: 0,
        hp,
        conditions: [...actor.statblock.conditions],
        visible: true,
        owner: 'dm',
      };
      ui.setSelectedTokenId(token.id);
      ui.setStatusMessage(`Token aggiunto: ${actor.name}`);
      await send(scene.id, { type: 'token.add', token });
    };

    return {
      send,

      tokenHp(tokenId: string): string {
        const token = store.tokens().find((entry) => entry.id === tokenId);
        return token === undefined ? '—' : `${token.hp.current}/${token.hp.max}`;
      },

      async changeTokenHp(
        sceneId: string | null,
        token: TokenState,
        delta: number,
      ): Promise<void> {
        ui.setStatusMessage(`${token.label}: ${delta > 0 ? '+' : ''}${delta} PF`);
        await send(sceneId, { type: 'token.hp', tokenId: token.id, delta });
      },

      select(tokenId: string | null): void {
        ui.setSelectedTokenId(tokenId);
      },

      /** Seleziona il token e chiede al canvas di centrarlo. */
      center(token: TokenState): void {
        ui.setSelectedTokenId(token.id);
        store.focusRequest.set(token.id);
      },

      consumeFocus(): void {
        store.focusRequest.set(null);
      },

      async toggleVisibility(sceneId: string | null, token: TokenState): Promise<void> {
        ui.setStatusMessage(`${token.label}: ${token.visible ? 'nascosto' : 'visibile'}`);
        await send(sceneId, {
          type: 'token.update',
          tokenId: token.id,
          patch: { visible: !token.visible },
        });
      },

      async remove(sceneId: string | null, token: TokenState): Promise<void> {
        ui.setStatusMessage(`${token.label}: rimosso`);
        const applied = await send(sceneId, { type: 'token.remove', tokenId: token.id });
        if (applied !== null && ui.selectedTokenId() === token.id) {
          ui.setSelectedTokenId(null);
        }
      },

      async onTokenMoved(sceneId: string | null, event: TokenMoveEvent): Promise<void> {
        ui.setStatusMessage(`Token spostato in (${event.x}, ${event.y})`);
        await send(sceneId, {
          type: 'token.move',
          tokenId: event.tokenId,
          x: event.x,
          y: event.y,
          ...(event.force === true ? { force: true } : {}),
        });
      },

      async addActorToMap(scene: Scene, actor: Actor): Promise<void> {
        await spawnActorToken(scene, actor, scene.widthPx / 2, scene.heightPx / 2);
      },

      async onActorDropped(scene: Scene | null, event: ActorDropEvent): Promise<void> {
        if (scene === null) {
          return;
        }
        const actor = shell.party().find((entry) => entry.id === event.actorId);
        if (actor === undefined) {
          return;
        }
        await spawnActorToken(scene, actor, event.pointX, event.pointY);
      },

      spawnActorToken,

      async rollInitiative(scene: Scene | null): Promise<void> {
        if (scene === null) {
          return;
        }
        const campaign = shell.activeCampaign();
        if (campaign === null) {
          return;
        }
        const entries: InitiativeEntry[] = [];
        for (const token of store.tokens()) {
          const actor = shell.party().find((entry) => entry.id === token.actorId);
          const tiebreak = actor === undefined
            ? 0
            : abilityModifier(actor.statblock.abilities.dex);
          const formula = tiebreak === 0 ? '1d20' : `1d20${tiebreak > 0 ? '+' : ''}${tiebreak}`;
          const roll = await dice.roll(campaign.id, {
            formula,
            mode: 'normal',
            visibility: 'dm',
            sceneId: scene.id,
            tokenId: token.id,
          });
          entries.push({
            id: newId(),
            tokenId: token.id,
            label: token.label,
            value: roll?.total ?? 10 + tiebreak,
            tiebreak,
            hidden: !token.visible,
            defeated: false,
          });
        }
        if (entries.length === 0) {
          ui.setStatusMessage('Nessun token in mappa per l’iniziativa.');
          return;
        }
        await setInitiative(scene.id, sortInitiativeEntries(entries), true, 1, 0);
        ui.setStatusMessage('Iniziativa tirata dal server.');
      },

      async addTokenToInitiative(scene: Scene, token: TokenState): Promise<void> {
        const initiative = store.initiative();
        if (
          initiative === null
          || initiative.entries.some((entry) => entry.tokenId === token.id)
        ) {
          return;
        }
        const actor = shell.party().find((entry) => entry.id === token.actorId);
        const tiebreak = actor === undefined ? 0 : abilityModifier(actor.statblock.abilities.dex);
        const entries = sortInitiativeEntries([
          ...initiative.entries,
          {
            id: newId(),
            tokenId: token.id,
            label: token.label,
            value: 10 + tiebreak,
            tiebreak,
            hidden: !token.visible,
            defeated: false,
          },
        ]);
        await setInitiative(
          scene.id,
          entries,
          initiative.active,
          initiative.round,
          initiative.turnIndex,
        );
      },

      async updateInitiativeValue(
        scene: Scene | null,
        entryId: string,
        event: Event,
      ): Promise<void> {
        if (scene === null) {
          return;
        }
        const initiative = store.initiative();
        const value = Number((event.target as HTMLInputElement).value);
        if (initiative === null || !Number.isFinite(value)) {
          return;
        }
        const entries = initiative.entries.map((entry) =>
          entry.id === entryId ? { ...entry, value: Math.trunc(value) } : entry);
        await setInitiative(
          scene.id,
          entries,
          initiative.active,
          initiative.round,
          initiative.turnIndex,
        );
      },

      async sortInitiative(scene: Scene | null): Promise<void> {
        if (scene === null) {
          return;
        }
        const initiative = store.initiative();
        if (initiative === null) {
          return;
        }
        await setInitiative(
          scene.id,
          sortInitiativeEntries(initiative.entries),
          initiative.active,
          initiative.round,
          0,
        );
      },

      async nextTurn(scene: Scene | null): Promise<void> {
        if (scene === null) {
          return;
        }
        await send(scene.id, { type: 'initiative.next' });
      },

      async endInitiative(scene: Scene | null): Promise<void> {
        if (scene === null) {
          return;
        }
        const initiative = store.initiative();
        if (initiative === null) {
          return;
        }
        await setInitiative(scene.id, initiative.entries, false, 0, 0);
        ui.setStatusMessage('Iniziativa terminata.');
      },

      setInitiative,
    };
  }),
);
