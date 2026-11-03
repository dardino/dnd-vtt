import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { qrMatrix } from './qr-matrix';

@Component({
  selector: 'app-qr-code',
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCode {
  public readonly value = input.required<string>();
  public readonly size = input(160);
  public readonly label = input('QR code');

  protected readonly matrix = computed(() => qrMatrix(this.value()));
  protected readonly viewBox = computed(() => {
    const { size } = this.matrix();
    return `0 0 ${size} ${size}`;
  });
}
