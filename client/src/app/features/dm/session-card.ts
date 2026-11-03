import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Session } from '@dnd-vtt/shared';

@Component({
  selector: 'app-session-card',
  templateUrl: './session-card.html',
  styleUrl: './session-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionCard {
  public readonly session = input<Session | null>(null);
  public readonly label = input.required<string>();
  public readonly busy = input(false);
  public readonly start = output<void>();
  public readonly stop = output<void>();
}
