import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import type {
  Ability,
  LevelUpPreview,
  PcStatblock,
} from '@dnd-vtt/shared';
import { Dialog } from '../../components/dialog/dialog';

export interface LevelUpFormState {
  readonly hpMethod: 'average' | 'roll';
  readonly hpRoll: number;
  readonly subclass: string;
  readonly asiPrimary: Ability;
  readonly asiSecondary: Ability;
  readonly asiSplit: boolean;
  readonly feat: string;
}

export interface LevelUpAbilityOption {
  readonly key: Ability;
  readonly label: string;
}

export interface LevelUpSubclassOption {
  readonly id: string;
  readonly name: string;
}

export interface LevelUpFeatOption {
  readonly id: string;
  readonly name: string;
}

@Component({
  selector: 'app-actor-sheet-level-up-dialog',
  imports: [Dialog, FormField],
  templateUrl: './actor-sheet-level-up-dialog.html',
  styleUrl: './actor-sheet-level-up-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetLevelUpDialog {
  public readonly open = input(false);
  public readonly character = input.required<PcStatblock | null>();
  public readonly currentXp = input(0);
  public readonly abilities = input<readonly LevelUpAbilityOption[]>([]);
  public readonly subclasses = input<readonly LevelUpSubclassOption[]>([]);
  public readonly needsSubclass = input(false);
  public readonly isAsi = input(false);
  public readonly feats = input<readonly LevelUpFeatOption[]>([]);
  public readonly preview = input<LevelUpPreview | null>(null);
  public readonly error = input<string | null>(null);
  public readonly busy = input(false);
  public readonly form = input.required<FieldTree<LevelUpFormState>>();

  public readonly closed = output<void>();
  public readonly previewRequest = output<void>();
  public readonly confirmRequest = output<void>();

  public close(): void {
    this.closed.emit();
  }

  public requestPreview(): void {
    this.previewRequest.emit();
  }

  public requestConfirm(): void {
    this.confirmRequest.emit();
  }
}
