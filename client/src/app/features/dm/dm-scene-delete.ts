import type { Scene } from '@dnd-vtt/shared';

/** Motivo per cui una scena non può essere eliminata, oppure `null` se è libera. */
export const sceneDeleteBlockedReason = (
  scene: Scene,
  activeSceneId: string | null,
  onAirSceneIds: ReadonlySet<string>,
): string | null => {
  if (scene.id === activeSceneId) {
    return 'Non puoi eliminare la scena attiva.';
  }
  if (onAirSceneIds.has(scene.id)) {
    return 'La scena è in onda su uno schermo.';
  }
  return null;
};
