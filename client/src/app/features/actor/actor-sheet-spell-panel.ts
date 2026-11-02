import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SpellPanelSlot {
  readonly level: number;
  readonly used: number;
  readonly max: number;
}

export interface SpellPanelPactSlot {
  readonly level: number;
  readonly used: number;
  readonly max: number;
}

export interface SpellPanelSpell {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly meta: string;
  readonly description: string;
}

export interface SpellSlotChange {
  readonly level: number;
  readonly delta: number;
}

@Component({
  selector: 'app-actor-sheet-spell-panel',
  templateUrl: './actor-sheet-spell-panel.html',
  styleUrl: './actor-sheet-spell-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetSpellPanel {
  public readonly slots = input.required<readonly SpellPanelSlot[]>();
  public readonly pactSlots = input<SpellPanelPactSlot | null>(null);
  public readonly spells = input.required<readonly SpellPanelSpell[]>();

  public readonly slotChange = output<SpellSlotChange>();
  public readonly pactSlotChange = output<number>();

  public changeSlot(level: number, delta: number): void {
    this.slotChange.emit({ level, delta });
  }

  public changePactSlot(delta: number): void {
    this.pactSlotChange.emit(delta);
  }
}
