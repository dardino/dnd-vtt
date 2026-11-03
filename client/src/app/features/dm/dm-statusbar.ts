import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface DmStatusbarToken {
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Statusbar della console DM: messaggio di stato, esito della sincronizzazione,
 * versione dello stato, conteggi, zoom/misura, token selezionato e cronometro.
 * È puramente presentazionale; il ripple "Riallinea" è delegato alla pagina.
 */
@Component({
  selector: 'app-dm-statusbar',
  templateUrl: './dm-statusbar.html',
  styleUrl: './dm-statusbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmStatusbar {
  public readonly message = input.required<string>();
  public readonly syncStatus = input.required<string>();
  public readonly syncLabel = input.required<string>();
  public readonly version = input.required<number>();
  public readonly tokenCount = input.required<number>();
  public readonly zoomLabel = input.required<string>();
  public readonly measureLabel = input.required<string>();
  public readonly selectedToken = input<DmStatusbarToken | null>(null);
  public readonly sessionLabel = input.required<string>();

  public readonly sync = output<void>();
}
