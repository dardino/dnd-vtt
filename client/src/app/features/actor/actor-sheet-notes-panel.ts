import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';

@Component({
  selector: 'app-actor-sheet-notes-panel',
  imports: [FormField],
  templateUrl: './actor-sheet-notes-panel.html',
  styleUrl: './actor-sheet-notes-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetNotesPanel {
  public readonly field = input.required<FieldTree<string>>();
  public readonly saving = input(false);
  public readonly saved = input(false);

  public readonly save = output<void>();

  public readonly fieldState = computed(() => this.field()());

  public readonly counter = computed(() => {
    const state = this.fieldState();
    const length = state.value().length;
    const max = state.maxLength?.();
    return max === undefined ? `${length} caratteri` : `${length} / ${max} caratteri`;
  });

  public onSave(): void {
    this.save.emit();
  }
}
