import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-sidebar-section',
  templateUrl: './sidebar-section.html',
  styleUrl: './sidebar-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarSection {
  public readonly id = input.required<string>();
  public readonly label = input.required<string>();
  public readonly open = input(false);
  public readonly count = input<number | null>(null);
  public readonly hasActions = input(false);
  public readonly toggled = output<void>();
}
