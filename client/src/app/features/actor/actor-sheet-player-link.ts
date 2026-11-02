import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-actor-sheet-player-link',
  templateUrl: './actor-sheet-player-link.html',
  styleUrl: './actor-sheet-player-link.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetPlayerLink {
  public readonly url = input.required<string | null>();
  public readonly editing = input.required<boolean>();
  public readonly busy = input(false);
  public readonly error = input<string | null>(null);

  public readonly copyRequest = output<void>();
  public readonly toggleEditing = output<void>();

  public requestCopy(): void {
    this.copyRequest.emit();
  }

  public requestToggleEditing(): void {
    this.toggleEditing.emit();
  }
}
