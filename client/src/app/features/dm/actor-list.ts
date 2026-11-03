import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Actor, TokenState } from '@dnd-vtt/shared';

export interface ActorListDragStart {
  event: DragEvent;
  actor: Actor;
}

@Component({
  selector: 'app-actor-list',
  imports: [RouterLink],
  templateUrl: './actor-list.html',
  styleUrl: './actor-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActorList {
  public readonly actors = input.required<readonly Actor[]>();
  public readonly campaignId = input.required<string>();
  public readonly tokens = input.required<readonly TokenState[]>();
  public readonly canAdd = input(false);
  public readonly readOnly = input(false);
  public readonly subtitle = input.required<(actor: Actor) => string>();
  public readonly addActor = output<Actor>();
  public readonly dragStart = output<ActorListDragStart>();

  public readonly tokenCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const token of this.tokens()) {
      if (token.actorId === undefined) {
        continue;
      }
      counts[token.actorId] = (counts[token.actorId] ?? 0) + 1;
    }
    return counts;
  });

  public onDragStart(event: DragEvent, actor: Actor): void {
    this.dragStart.emit({ event, actor });
  }
}
