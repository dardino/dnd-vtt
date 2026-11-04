import { v7 as uuidv7 } from 'uuid';

/**
 * Voce mappa nel formato v1 congelato: niente schemaVersion, layers, thumb o
 * composite; muri, luci, spawn e partenze vivono ancora nei campi top-level.
 * Restano solo i metadati che una riga `maps` espone accanto al documento.
 */
export const legacyBundleMap = (
  campaignId: string,
  imageAssetId: string,
): Record<string, unknown> => {
  const now = new Date().toISOString();
  return {
    id: uuidv7(),
    campaignId,
    version: 3,
    createdAt: now,
    updatedAt: now,
    name: 'Mappa legacy',
    imageAssetId,
    backgroundTransform: { x: 12, y: -8, scale: 1.25 },
    backgroundColor: 'rgba(20, 30, 40, 1)',
    widthPx: 1400,
    heightPx: 1000,
    grid: {
      type: 'square',
      cellSizePx: 70,
      offsetX: 0,
      offsetY: 0,
      feetPerCell: 5,
      diagonalRule: '5-5-5',
      hexOffset: 'odd-r',
    },
    terrain: {
      ambientLight: 'dim',
      visionLimitFeet: 60,
      visionEnabled: true,
      walls: [
        { id: 'legacy-wall', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
      ],
      lights: [
        {
          id: 'legacy-light',
          x: 3,
          y: 4,
          brightFeet: 20,
          dimFeet: 40,
          color: '#ffcc80',
        },
      ],
    },
    spawns: [
      {
        id: 'legacy-spawn',
        kind: 'monster',
        x: 2,
        y: 3,
        source: { type: 'srd', monsterId: 'goblin' },
        size: 1,
        hidden: false,
        quantity: 1,
      },
    ],
    playerStarts: [{ id: 'legacy-start', x: 1, y: 1, label: 'Ingresso' }],
    fogBase: 'revealed',
    showDoorIcons: false,
    notes: 'Nota legacy',
  };
};
