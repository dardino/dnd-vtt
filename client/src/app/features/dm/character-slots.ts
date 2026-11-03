import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Actor } from '@dnd-vtt/shared';
import type { ActorPortraitThumb } from '../scene/scene-canvas.component';

export interface CharacterSlotsDragStart {
  event: DragEvent;
  actor: Actor;
}

@Component({
  selector: 'app-character-slots',
  imports: [RouterLink],
  templateUrl: './character-slots.html',
  styleUrl: './character-slots.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterSlots {
  public readonly slots = input.required<readonly (Actor | null)[]>();
  public readonly campaignId = input.required<string>();
  public readonly readOnly = input(false);
  public readonly portraitFor = input.required<(actor: Actor) => ActorPortraitThumb | null>();
  public readonly subtitle = input.required<(actor: Actor) => string>();
  public readonly hpRatio = input.required<(actor: Actor) => number>();
  public readonly dragStart = output<CharacterSlotsDragStart>();
  public readonly selectActor = output<Actor>();

  public onDragStart(event: DragEvent, actor: Actor): void {
    this.dragStart.emit({ event, actor });
  }

  public onSelect(actor: Actor): void {
    this.selectActor.emit(actor);
  }
}
