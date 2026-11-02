import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-actor-sheet-notes-panel',
  templateUrl: './actor-sheet-notes-panel.html',
  styleUrl: './actor-sheet-notes-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetNotesPanel {
  public readonly notes = input.required<string>();
  public readonly saving = input(false);
  public readonly saved = input(false);

  public readonly notesChange = output<string>();
  public readonly save = output<void>();

  public onInput(event: Event): void {
    this.notesChange.emit((event.target as HTMLTextAreaElement).value);
  }

  public onSave(): void {
    this.save.emit();
  }
}
