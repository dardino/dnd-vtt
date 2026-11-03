import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import type { DiceMode, DiceRoll, DiceVisibility } from '@dnd-vtt/shared';
import {
  DiceFormulaError,
  diceModeSchema,
  diceVisibilitySchema,
  parseFormula,
} from '@dnd-vtt/shared';
import { DiceStore } from '../../core/stores/dice.store';
import { Dialog } from '../../components/dialog/dialog';

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

interface DiceFormModel {
  formula: string;
  modifier: number | null;
  mode: DiceMode;
  visibility: DiceVisibility;
}

const initialDiceForm = (): DiceFormModel => ({
  formula: '1d20',
  modifier: 0,
  mode: 'normal',
  visibility: 'public',
});

@Component({
  selector: 'app-dice-overlay',
  imports: [Dialog, FormField],
  templateUrl: './dice-overlay.component.html',
  styleUrl: './dice-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiceOverlayComponent {
  public readonly open = input(false);
  public readonly campaignId = input.required<string>();
  public readonly sceneId = input<string | null>(null);
  public readonly tokenId = input<string | null>(null);
  public readonly closed = output<void>();
  public readonly rolled = output<DiceRoll>();

  public readonly store = inject(DiceStore);
  public readonly quickDice = QUICK_DICE;
  public readonly result = computed(() => this.store.last());

  private readonly model = signal<DiceFormModel>(initialDiceForm());
  public readonly diceForm = form(this.model, (path) => {
    required(path.formula, { message: 'Inserisci una formula' });
    validate(path.formula, ({ value }) => {
      try {
        parseFormula(value());
        return null;
      } catch (error) {
        return {
          kind: 'formula',
          message: error instanceof DiceFormulaError ? error.message : 'Formula non valida',
        };
      }
    });
    validate(path.modifier, ({ value }) => {
      const raw = value();
      if (raw === null || raw === undefined) {
        return null;
      }
      return Number.isFinite(raw) && Number.isInteger(raw)
        ? null
        : { kind: 'modifier', message: 'Inserisci un modificatore intero' };
    });
    validate(path.mode, ({ value }) =>
      diceModeSchema.safeParse(value()).success
        ? null
        : { kind: 'mode', message: 'Scegli un modo valido' });
    validate(path.visibility, ({ value }) =>
      diceVisibilitySchema.safeParse(value()).success
        ? null
        : { kind: 'visibility', message: 'Scegli una visibilità valida' });
  });

  public quickDie(sides: number): void {
    this.diceForm.formula().value.set(`1d${sides}`);
  }

  public async roll(): Promise<void> {
    await submit(this.diceForm, {
      action: async () => {
        const base = this.diceForm.formula().value().trim();
        const modifier = this.diceForm.modifier().value() ?? 0;
        const formula = modifier === 0 ? base : `${base}${modifier > 0 ? '+' : ''}${modifier}`;
        const result = await this.store.roll(this.campaignId(), {
          formula,
          mode: this.diceForm.mode().value(),
          visibility: this.diceForm.visibility().value(),
          ...(this.sceneId() === null ? {} : { sceneId: this.sceneId() ?? undefined }),
          ...(this.tokenId() === null ? {} : { tokenId: this.tokenId() ?? undefined }),
        });
        if (result !== null) {
          this.rolled.emit(result);
        }
        return undefined;
      },
    });
  }

  public close(): void {
    this.closed.emit();
  }
}
