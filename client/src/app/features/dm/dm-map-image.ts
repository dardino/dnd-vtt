import type { Scene } from '@dnd-vtt/shared';
import type { SceneMapImage } from '../scene/scene-canvas.component';

/** Foglio senza immagine: dimensioni della scena e nessun URL da caricare. */
export const blankSceneMapImage = (scene: Scene): SceneMapImage => ({
  url: '',
  previewUrl: '',
  hash: scene.id,
  width: scene.widthPx,
  height: scene.heightPx,
  tiled: false,
});
