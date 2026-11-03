import { deriveSheet, type PublicActor } from '@dnd-vtt/shared';

export interface SheetCampaignRef {
  id: string;
  name: string;
}

/**
 * Costruisce la parte comune a `DmSheetView` e `PlayerSheetView`: derivati e
 * inventario esistono solo per i personaggi, gli altri attori hanno scheda vuota.
 */
export const sheetViewBase = <
  TActor extends PublicActor,
  TCampaign extends SheetCampaignRef | null,
>(
  actor: TActor,
  campaign: TCampaign,
) => ({
  actor,
  statblock: actor.statblock,
  derived: actor.statblock.kind === 'pc'
    ? deriveSheet({ statblock: actor.statblock, equipped: actor.statblock.snapshot.items })
    : null,
  inventory: actor.statblock.kind === 'pc' ? actor.statblock.snapshot.items : [],
  sheetVersion: actor.sheetVersion,
  campaign,
});
