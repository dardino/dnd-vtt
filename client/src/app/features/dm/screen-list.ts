import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ScreenSummary } from './regia-summary';

@Component({
  selector: 'app-screen-list',
  templateUrl: './screen-list.html',
  styleUrl: './screen-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenList {
  public readonly screens = input.required<readonly ScreenSummary[]>();
  public readonly projectionLabel = input.required<(summary: ScreenSummary) => string>();
  public readonly lastSeen = input.required<(summary: ScreenSummary) => string>();
  public readonly selectScreen = output<ScreenSummary>();
}
