import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MeasurementUnit } from '../../core/ui/measurement.service';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

@Component({
  selector: 'app-map-settings-dialog',
  imports: [Button, Dialog],
  templateUrl: './map-settings-dialog.html',
  styleUrl: './map-settings-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapSettingsDialog {
  public readonly open = input(false);
  public readonly unit = input.required<MeasurementUnit>();
  public readonly brushCells = input.required<number>();
  public readonly pencilTenths = input.required<number>();
  public readonly brushDiameterPx = input.required<number>();
  public readonly pencilWidthPx = input.required<number>();

  public readonly unitChange = output<MeasurementUnit>();
  public readonly brushChange = output<number>();
  public readonly pencilChange = output<number>();
  public readonly clearHistory = output<void>();
  public readonly resetFog = output<void>();
  // `close` è un evento DOM nativo: il lint vieta il nome, si usa `closed`.
  public readonly closed = output<void>();

  public requestUnitChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.unitChange.emit(value === 'metric' ? 'metric' : 'imperial');
  }

  public requestBrushChange(event: Event): void {
    this.brushChange.emit(Number((event.target as HTMLInputElement).value));
  }

  public requestPencilChange(event: Event): void {
    this.pencilChange.emit(Number((event.target as HTMLInputElement).value));
  }

  public requestClearHistory(): void {
    this.clearHistory.emit();
  }

  public requestResetFog(): void {
    this.resetFog.emit();
  }

  public requestClose(): void {
    this.closed.emit();
  }
}
