import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MapSummary } from '@dnd-vtt/shared';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

@Component({
  selector: 'app-map-picker-dialog',
  imports: [Button, Dialog, RouterLink],
  templateUrl: './map-picker-dialog.html',
  styleUrl: './map-picker-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapPickerDialog {
  public readonly open = input(false);
  public readonly maps = input.required<readonly MapSummary[]>();
  public readonly loading = input(false);

  public readonly choose = output<MapSummary>();
  public readonly create = output<void>();
  // `close` è un evento DOM nativo: il lint vieta il nome, si usa `closed`.
  public readonly closed = output<void>();

  public requestChoose(map: MapSummary): void {
    this.choose.emit(map);
  }

  public requestCreate(): void {
    this.create.emit();
  }

  public requestClose(): void {
    this.closed.emit();
  }
}
