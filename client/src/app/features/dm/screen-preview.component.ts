import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import {
  type Condition,
  type DisplayLayer,
  type DisplayState,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import {
  SceneCanvasComponent,
  type ActorPortraitThumb,
  type SceneMapImage,
} from '../scene/scene-canvas.component';

@Component({
  selector: 'app-screen-preview',
  imports: [NgTemplateOutlet, SceneCanvasComponent],
  templateUrl: './screen-preview.component.html',
  styleUrl: './screen-preview.component.scss',
})
export class ScreenPreviewComponent {
  public readonly state = input.required<DisplayState>();

  public readonly base = computed<DisplayLayer>(() => this.state().composition.base);
  public readonly overlays = computed<DisplayLayer[]>(() => this.state().composition.overlays);

  public frameStyle(layer: DisplayLayer): Record<string, string> {
    return {
      '--frame-x': String(layer.frame.x),
      '--frame-y': String(layer.frame.y),
      '--frame-width': String(layer.frame.width),
      '--frame-height': String(layer.frame.height),
      '--layer-opacity': String(layer.opacity),
    };
  }

  public mapImage(layer: DisplayLayer): SceneMapImage | null {
    const scene = layer.scene;
    if (scene === undefined || scene.imageUrl === null) {
      return null;
    }
    return {
      url: scene.imageUrl,
      previewUrl: scene.imageUrl,
      hash: scene.id,
      width: scene.widthPx,
      height: scene.heightPx,
      // L'anteprima usa la stessa immagine intera dello schermo reale: la
      // piramide di tile è indicizzata per asset e non per scena.
      tiled: false,
    };
  }

  public sceneState(layer: DisplayLayer): SceneState | null {
    const scene = layer.scene;
    if (scene === undefined) {
      return null;
    }
    return {
      grid: scene.grid,
      fog: scene.fog,
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
        conditions: token.conditions.map((name) => ({ name } as Condition)),
        visible: true,
      })),
      loot: [],
      drawings: [],
      initiative: { active: false, round: 0, turnIndex: 0, entries: [] },
    };
  }

  public tokenPortraits(layer: DisplayLayer): Record<string, ActorPortraitThumb> {
    const portraits: Record<string, ActorPortraitThumb> = {};
    for (const token of layer.scene?.tokens ?? []) {
      if (token.imageUrl !== null && token.portrait !== null) {
        portraits[token.id] = { url: token.imageUrl, ...token.portrait };
      }
    }
    return portraits;
  }
}
