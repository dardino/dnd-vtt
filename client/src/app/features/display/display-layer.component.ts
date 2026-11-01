import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  defaultTerrain,
  type Condition,
  type DisplayLayer,
  type DisplayState,
  type PublicScene,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import {
  SceneCanvasComponent,
  type ActorPortraitThumb,
  type SceneMapImage,
} from '../scene/scene-canvas.component';

@Component({
  selector: 'app-display-layer',
  imports: [SceneCanvasComponent],
  templateUrl: './display-layer.component.html',
  styleUrl: './display-layer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayLayerComponent {
  public readonly layer = input.required<DisplayLayer>();
  public readonly initiative = input<DisplayState['initiative']>();

  public readonly frameStyle = computed<Record<string, string>>(() => {
    const layer = this.layer();
    return {
      '--frame-x': String(layer.frame.x),
      '--frame-y': String(layer.frame.y),
      '--frame-width': String(layer.frame.width),
      '--frame-height': String(layer.frame.height),
      '--layer-opacity': String(layer.opacity),
    };
  });

  public readonly mapImage = computed<SceneMapImage | null>(() => {
    const scene = this.layer().scene;
    if (scene === undefined || scene.imageUrl === null) {
      return null;
    }
    return {
      url: scene.imageUrl,
      previewUrl: scene.imageUrl,
      hash: scene.id,
      width: scene.widthPx,
      height: scene.heightPx,
      tiled: false,
    };
  });

  public readonly sceneState = computed<SceneState | null>(() => {
    const scene = this.layer().scene;
    return scene === undefined ? null : toSceneState(scene);
  });

  public readonly tokenPortraits = computed<Record<string, ActorPortraitThumb>>(() => {
    const portraits: Record<string, ActorPortraitThumb> = {};
    for (const token of this.layer().scene?.tokens ?? []) {
      if (token.imageUrl !== null && token.portrait !== null) {
        portraits[token.id] = { url: token.imageUrl, ...token.portrait };
      }
    }
    return portraits;
  });
}

/** Proiezione pubblica → stato minimo richiesto dal canvas. */
const toSceneState = (scene: PublicScene): SceneState => ({
  grid: scene.grid,
  fog: scene.fog,
  terrain: defaultTerrain,
  showDoorIcons: true,
  tokens: scene.tokens.map((token): TokenState => ({
    id: token.id,
    label: token.label,
    x: token.x,
    y: token.y,
    size: token.size,
    rotation: token.rotation,
    elevation: token.elevation,
    hp: token.hp === undefined
      ? { current: 1, max: 1, temp: 0 }
      : { ...token.hp, temp: 0 },
    conditions: token.conditions.map((name): Condition => ({ name })),
    visible: true,
  })),
  loot: [],
  drawings: [],
  initiative: { active: false, round: 0, turnIndex: 0, entries: [] },
});
