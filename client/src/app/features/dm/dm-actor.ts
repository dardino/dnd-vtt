import type { Actor } from '@dnd-vtt/shared';

/** Sottotitolo compatto dell'attore usato da slot e liste della console DM. */
export const actorSubtitle = (actor: Actor): string => {
  if (actor.statblock.kind === 'pc') {
    return `${actor.statblock.class.id} · livello ${actor.statblock.class.level}`;
  }
  if (actor.statblock.kind === 'monster') {
    return `${actor.statblock.creatureType} · CR ${actor.statblock.cr}`;
  }
  return `NPC · ${actor.statblock.creatureType}`;
};

/** Rapporto PF corrente/massimo normalizzato tra 0 e 1 per le barre degli slot. */
export const hpRatio = (actor: Actor): number => {
  if (actor.hp === null || actor.hp.max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, actor.hp.current / actor.hp.max));
};
