import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import {
  conditionNameSchema,
  type Condition,
  type ConditionName,
  type DeathSaves,
  type HitDice,
} from '@dnd-vtt/shared';

export type CombatHpMode = 'damage' | 'heal' | 'temp';

export interface CombatHpChange {
  readonly mode: CombatHpMode;
  readonly amount: number;
}

export interface CombatDeathSaveChange {
  readonly kind: keyof DeathSaves;
  readonly delta: number;
}

export type CombatRestKind = 'short' | 'long';

export interface CombatCharacter {
  readonly deathSaves: DeathSaves;
  readonly hitDice: HitDice;
}

@Component({
  selector: 'app-actor-sheet-combat-panel',
  templateUrl: './actor-sheet-combat-panel.html',
  styleUrl: './actor-sheet-combat-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetCombatPanel {
  public readonly conditions = input.required<readonly Condition[]>();
  public readonly character = input<CombatCharacter | null>(null);
  public readonly busy = input(false);
  public readonly restBusy = input(false);

  public readonly hpPatch = output<CombatHpChange>();
  public readonly conditionAdd = output<Condition>();
  public readonly conditionToggle = output<Condition>();
  public readonly deathSave = output<CombatDeathSaveChange>();
  public readonly hitDice = output<number>();
  public readonly rest = output<CombatRestKind>();

  public readonly conditionNames = conditionNameSchema.options;
  public readonly damageAmount = signal(5);
  public readonly healAmount = signal(5);
  public readonly tempAmount = signal(0);
  public readonly conditionToAdd = signal<ConditionName>('prone');

  public setDamage(event: Event): void {
    this.damageAmount.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setHeal(event: Event): void {
    this.healAmount.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setTemp(event: Event): void {
    this.tempAmount.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setConditionToAdd(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if ((conditionNameSchema.options as string[]).includes(value)) {
      this.conditionToAdd.set(value as ConditionName);
    }
  }

  public submitDamage(): void {
    this.hpPatch.emit({ mode: 'damage', amount: this.damageAmount() });
  }

  public submitHeal(): void {
    this.hpPatch.emit({ mode: 'heal', amount: this.healAmount() });
  }

  public submitTemp(): void {
    this.hpPatch.emit({ mode: 'temp', amount: this.tempAmount() });
  }

  public addCondition(): void {
    this.conditionAdd.emit({ name: this.conditionToAdd() });
  }

  public toggleCondition(condition: Condition): void {
    this.conditionToggle.emit(condition);
  }

  public changeDeathSave(kind: keyof DeathSaves, delta: number): void {
    this.deathSave.emit({ kind, delta });
  }

  public changeHitDice(delta: number): void {
    this.hitDice.emit(delta);
  }

  public startRest(type: CombatRestKind): void {
    this.rest.emit(type);
  }
}
