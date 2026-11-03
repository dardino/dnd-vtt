import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { InitiativeState } from '@dnd-vtt/shared';
import { ActionStore } from '../../core/action.store';
import { DiceStore } from '../../core/dice.store';

export const DOCK_TABS = ['initiative', 'dice', 'actions'] as const;
export type DockTab = (typeof DOCK_TABS)[number];

export interface DockValueChange {
  id: string;
  event: Event;
}

/**
 * Dock della console DM (iniziativa, log dadi, history azioni). I dati del
 * log e dell'history arrivano dagli store; i comandi di scena restano
 * delegati alla pagina tramite output.
 */
@Component({
  selector: 'app-dm-dock',
  templateUrl: './dm-dock.html',
  styleUrl: './dm-dock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmDock {
  public readonly dice = inject(DiceStore);
  public readonly actions = inject(ActionStore);

  public readonly open = input(true);
  public readonly tab = input<DockTab>('initiative');
  public readonly initiative = input<InitiativeState | null>(null);
  public readonly tokenHp = input.required<(tokenId: string) => string>();

  public readonly tabChange = output<DockTab>();
  // `toggle` è richiesto come nome dell'output dal contratto del dock; non è un
  // evento DOM nativo del componente ma solo il binding `(toggle)` della pagina.
  // eslint-disable-next-line @angular-eslint/no-output-native
  public readonly toggle = output<void>();
  public readonly rollInitiative = output<void>();
  public readonly nextTurn = output<void>();
  public readonly sort = output<void>();
  public readonly end = output<void>();
  public readonly updateValue = output<DockValueChange>();
  public readonly openDice = output<void>();
  public readonly redoBatch = output<void>();
  public readonly undoThrough = output<string>();

  public readonly undoneActions = computed(() =>
    this.actions.history().filter((entry) => entry.status === 'undone').length);
}
