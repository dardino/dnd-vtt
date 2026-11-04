import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Scene } from '@dnd-vtt/shared';
import { Button } from '../../components/button/button';
import { sceneDeleteBlockedReason } from './dm-scene-delete';

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
  public readonly onAirSceneIds = input<ReadonlySet<string>>(new Set());
  public readonly busy = input(false);
  public readonly selectScene = output<Scene>();
  public readonly openMapPicker = output<void>();
  public readonly deleteScene = output<Scene>();

  public canDelete(scene: Scene): boolean {
    return sceneDeleteBlockedReason(
      scene,
      this.activeSceneId(),
      this.onAirSceneIds(),
    ) === null;
  }

  public deleteBlockedReason(scene: Scene): string | null {
    return sceneDeleteBlockedReason(
      scene,
      this.activeSceneId(),
      this.onAirSceneIds(),
    );
  }

  public requestDelete(scene: Scene): void {
    if (!this.canDelete(scene)) {
      return;
    }
    this.deleteScene.emit(scene);
  }
}
