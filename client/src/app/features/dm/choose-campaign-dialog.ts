import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Campaign } from '@dnd-vtt/shared';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

@Component({
  selector: 'app-choose-campaign-dialog',
  imports: [Button, Dialog],
  templateUrl: './choose-campaign-dialog.html',
  styleUrl: './choose-campaign-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChooseCampaignDialog {
  public readonly open = input(false);
  public readonly campaigns = input.required<readonly Campaign[]>();
  public readonly dismissible = input(true);

  // `select` è vietato da `@angular-eslint/no-output-native` (evento DOM nativo).
  public readonly selectCampaign = output<string>();
  public readonly create = output<void>();
  public readonly closed = output<void>();

  public requestSelect(campaignId: string): void {
    this.selectCampaign.emit(campaignId);
  }

  public requestCreate(): void {
    this.create.emit();
  }

  public requestClose(): void {
    this.closed.emit();
  }
}
