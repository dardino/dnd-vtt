import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import type { DiceMode, DiceRoll, DiceVisibility } from '@dnd-vtt/shared';
import { DiceFormulaError, parseFormula } from '@dnd-vtt/shared';
import { DiceStore } from '../../core/dice.store';
import { Dialog } from '../../components/dialog/dialog';

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

interface DiceFormModel {
  formula: string;
}

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
  public readonly modifier = signal(0);
  public readonly mode = signal<DiceMode>('normal');
  public readonly visibility = signal<DiceVisibility>('public');
  public readonly result = computed(() => this.store.last());

  // PoC B1: il campo formula usa Signal Forms; gli altri controlli restano signal semplici.
  private readonly model = signal<DiceFormModel>({ formula: '1d20' });
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
  });

  public setModifier(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.modifier.set(Number.isFinite(value) ? Math.trunc(value) : 0);
  }

  public setMode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'normal' || value === 'advantage' || value === 'disadvantage') {
      this.mode.set(value);
    }
  }

  public setVisibility(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'public' || value === 'dm') {
      this.visibility.set(value);
    }
  }

  public quickDie(sides: number): void {
    this.diceForm.formula().value.set(`1d${sides}`);
  }

  public async roll(): Promise<void> {
    await submit(this.diceForm, {
      action: async () => {
        const base = this.diceForm.formula().value().trim();
        const modifier = this.modifier();
        const formula = modifier === 0 ? base : `${base}${modifier > 0 ? '+' : ''}${modifier}`;
        const result = await this.store.roll(this.campaignId(), {
          formula,
          mode: this.mode(),
          visibility: this.visibility(),
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
