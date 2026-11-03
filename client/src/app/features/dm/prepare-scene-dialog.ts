import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Actor, MapSummary, PlayerStart } from '@dnd-vtt/shared';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

export interface PrepareSceneAssignment {
  actorId: string;
  startId: string;
}

@Component({
  selector: 'app-prepare-scene-dialog',
  imports: [Button, Dialog],
  templateUrl: './prepare-scene-dialog.html',
  styleUrl: './prepare-scene-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrepareSceneDialog {
  public readonly open = input(false);
  public readonly map = input<MapSummary | null>(null);
  public readonly name = input('');
  public readonly assignments = input.required<Readonly<Record<string, string>>>();
  public readonly partyPcs = input.required<readonly Actor[]>();
  public readonly startOptions = input.required<readonly PlayerStart[]>();
  public readonly busy = input(false);

  public readonly nameChange = output<string>();
  public readonly assignmentChange = output<PrepareSceneAssignment>();
  public readonly start = output<void>();
  // `cancel` è un evento DOM nativo: il lint vieta il nome, si usa `dismiss`.
  public readonly dismiss = output<void>();

  public requestNameChange(event: Event): void {
    this.nameChange.emit((event.target as HTMLInputElement).value);
  }

  public requestAssignment(actorId: string, event: Event): void {
    this.assignmentChange.emit({
      actorId,
      startId: (event.target as HTMLSelectElement).value,
    });
  }

  public requestStart(): void {
    this.start.emit();
  }

  public requestDismiss(): void {
    this.dismiss.emit();
  }
}
