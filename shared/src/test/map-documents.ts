/**
 * Fixture del documento mappa v1 (pre-layers). Sono funzioni invece di costanti
 * perché ogni test deve poter lavorare su una copia indipendente.
 */

export const ASSET_ID = '11111111-1111-4111-8111-111111111111';
export const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

export const legacyCompleteMapDocument = (): Record<string, unknown> => ({
  name: 'Cripta dei goblin',
  imageAssetId: ASSET_ID,
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
      { id: 'wall-1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } },
      { id: 'door-1', kind: 'door', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, door: 'open' },
    ],
    lights: [
      {
        id: 'light-1',
        x: 3,
        y: 4,
        brightFeet: 20,
        dimFeet: 40,
        color: '#ffcc80',
        enabled: true,
        shape: 'circle',
        direction: 90,
        angle: 60,
      },
    ],
  },
  spawns: [
    {
      id: 'spawn-srd',
      kind: 'monster',
      x: 2,
      y: 3,
      source: { type: 'srd', monsterId: 'goblin' },
      label: 'Goblin',
      size: 1,
      hidden: false,
      quantity: 2,
    },
    {
      id: 'spawn-actor',
      kind: 'npc',
      x: 4,
      y: 5,
      source: { type: 'actor', actorId: ACTOR_ID },
      size: 1,
      hidden: true,
      quantity: 1,
    },
  ],
  playerStarts: [{ id: 'start-1', x: 1, y: 1, label: 'Ingresso' }],
  startView: { x: 100, y: 80, zoom: 1.5 },
  fogBase: 'revealed',
  showDoorIcons: false,
  notes: 'Nota del master',
});

export const legacyMinimalMapDocument = (): Record<string, unknown> => ({
  name: 'Mappa minima',
  imageAssetId: null,
  widthPx: 1280,
  heightPx: 720,
  grid: {},
  terrain: {},
});
