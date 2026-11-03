import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Scene } from '@dnd-vtt/shared';
import { Button } from '../../components/button/button';

@Component({
  selector: 'app-scene-list',
  imports: [RouterLink, Button],
  templateUrl: './scene-list.html',
  styleUrl: './scene-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneList {
  public readonly scenes = input.required<readonly Scene[]>();
  public readonly activeSceneId = input<string | null>(null);
  public readonly busy = input(false);
  public readonly selectScene = output<Scene>();
  public readonly openMapPicker = output<void>();
}
