import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

export type FogConfirmMode = 'reveal' | 'hide';

@Component({
  selector: 'app-fog-confirm-dialog',
  imports: [Button, Dialog],
  templateUrl: './fog-confirm-dialog.html',
  styleUrl: './fog-confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FogConfirmDialog {
  public readonly open = input(false);
  public readonly mode = input<FogConfirmMode | null>(null);
  public readonly overrideActive = input(false);

  public readonly confirm = output<void>();
  // `cancel` è un evento DOM nativo: il lint vieta il nome, si usa `dismiss`.
  public readonly dismiss = output<void>();

  public readonly title = computed(() =>
    this.mode() === 'hide' ? 'Nascondi tutta la mappa?' : 'Rivelare tutta la mappa?');

  public requestConfirm(): void {
    this.confirm.emit();
  }

  public requestDismiss(): void {
    this.dismiss.emit();
  }
}
