import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface InventoryPanelItem {
  readonly id: string;
  readonly name: string;
  readonly range: string | null;
  readonly valueGp: number;
}

@Component({
  selector: 'app-actor-sheet-inventory-panel',
  templateUrl: './actor-sheet-inventory-panel.html',
  styleUrl: './actor-sheet-inventory-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorSheetInventoryPanel {
  public readonly items = input.required<readonly InventoryPanelItem[]>();
  public readonly currency = input.required<string>();
}
