import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';
import type { ScreenSummary } from './regia-summary';

@Component({
  selector: 'app-take-target-dialog',
  imports: [Button, Dialog],
  templateUrl: './take-target-dialog.html',
  styleUrl: './take-target-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TakeTargetDialog {
  public readonly open = input(false);
  public readonly screens = input.required<readonly ScreenSummary[]>();
  public readonly projectionLabel = input.required<(summary: ScreenSummary) => string>();

  public readonly take = output<ScreenSummary>();
  // `cancel` è un evento DOM nativo: il lint vieta il nome, si usa `dismiss`.
  public readonly dismiss = output<void>();

  public requestTake(summary: ScreenSummary): void {
    this.take.emit(summary);
  }

  public requestDismiss(): void {
    this.dismiss.emit();
  }
}
