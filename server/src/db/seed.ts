import type { MapDocument } from '@dnd-vtt/shared';
import sharp from 'sharp';
import type { AppEnv } from '../config/env.js';
import { storeAsset } from '../assets/service.js';
import type { DatabaseHandle } from './client.js';
import { insertCampaign } from './campaigns.repository.js';
import { insertMap } from './maps.repository.js';
import { createSceneFromMap } from '../maps/service.js';
import { campaigns } from './schema.js';
import { defaultTerrain, wallEdgeSchema, type WallEdge } from '@dnd-vtt/shared';

const edge = (x: number, y: number, dir: 'h' | 'v', kind: WallEdge['kind'] = 'wall', door?: WallEdge['door']): WallEdge =>
  wallEdgeSchema.parse({ id: `edge-${dir}-${x}-${y}`, x, y, dir, kind, ...(door === undefined ? {} : { door }) });

const demoWalls = (): WallEdge[] => {
  const walls: WallEdge[] = [];
  for (let x = 1; x <= 16; x += 1) {
    if (x !== 4) {
      walls.push(edge(x, 1, 'h'));
    }
    walls.push(edge(x, 9, 'h'));
  }
  walls.push(edge(4, 1, 'h', 'window'));
  for (let y = 1; y <= 8; y += 1) {
    walls.push(edge(1, y, 'v'));
    walls.push(edge(17, y, 'v'));
  }
  for (let y = 1; y <= 3; y += 1) {
    walls.push(edge(11, y, 'v'));
  }
  walls.push(edge(11, 4, 'v', 'door', 'closed'));
  for (let y = 5; y <= 8; y += 1) {
    walls.push(edge(11, y, 'v'));
  }
  return walls;
};

const demoPng = async (): Promise<Buffer> => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1260" height="840">
      <rect width="1260" height="840" fill="#171717"/>
      <rect x="70" y="70" width="700" height="560" fill="#3d382f"/>
      <rect x="770" y="70" width="420" height="560" fill="#343a3f"/>
      <rect x="70" y="70" width="700" height="560" fill="none" stroke="#8b8172" stroke-width="10"/>
      <rect x="770" y="70" width="420" height="560" fill="none" stroke="#69757d" stroke-width="10"/>
      <path d="M770 70 L770 630" stroke="#69757d" stroke-width="10"/>
      <path d="M770 280 L770 350" stroke="#c9a227" stroke-width="12"/>
      <circle cx="280" cy="280" r="22" fill="#ffcc80" opacity="0.85"/>
      <circle cx="950" cy="490" r="18" fill="#ffcc80" opacity="0.8"/>
      <text x="120" y="120" fill="#c9c0ae" font-family="Georgia, serif" font-size="28">Sala d'ingresso</text>
      <text x="820" y="120" fill="#c0ccd4" font-family="Georgia, serif" font-size="28">Cripta</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

export interface SeedResult {
  campaignId: string;
  mapId: string;
  sceneId: string;
}

export const seedDemo = async (env: AppEnv, handle: DatabaseHandle): Promise<SeedResult | null> => {
  const existing = handle.db.select().from(campaigns).limit(1).get();
  if (existing !== undefined) {
    return null;
  }
  const campaign = insertCampaign(handle.db, {
    name: 'Campagna di prova',
    description: 'Dungeon dimostrativo con muri, porte, luci e un goblin.',
    fogDefault: 'hidden',
    advancementMode: 'milestone',
  });
  const asset = await storeAsset(env, handle.db, await demoPng());
  const document: MapDocument = {
    name: 'Dungeon di prova',
    imageAssetId: asset.id,
    widthPx: 1260,
    heightPx: 840,
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
      ...defaultTerrain,
      ambientLight: 'dark',
      visionLimitFeet: 90,
      visionEnabled: true,
      walls: demoWalls(),
      lights: [
        {
          id: 'torch-entry',
          x: 3,
          y: 3,
          brightFeet: 20,
          dimFeet: 40,
          color: '#ffcc80',
          enabled: true,
          shape: 'circle',
          angle: 60,
        },
        {
          id: 'torch-crypt',
          x: 13,
          y: 5,
          brightFeet: 20,
          dimFeet: 40,
          color: '#ffcc80',
          enabled: true,
          shape: 'circle',
          angle: 60,
        },
      ],
    },
    spawns: [
      {
        id: 'goblin-1',
        kind: 'monster',
        x: 13,
        y: 6,
        source: { type: 'srd', monsterId: 'goblin-warrior' },
        label: 'Goblin',
        size: 1,
        hidden: false,
        quantity: 1,
      },
    ],
    playerStarts: [
      { id: 'start-1', x: 2, y: 6, label: 'PG 1' },
      { id: 'start-2', x: 3, y: 6, label: 'PG 2' },
      { id: 'start-3', x: 4, y: 6, label: 'PG 3' },
      { id: 'start-4', x: 5, y: 6, label: 'PG 4' },
    ],
    startView: { x: 630, y: 420, zoom: 1 },
    fogBase: 'hidden',
    showDoorIcons: true,
    notes: 'Mappa dimostrativa: la porta a est separa la cripta dalla sala.',
  };
  const map = insertMap(handle.db, campaign.id, document);
  const scene = createSceneFromMap(handle.db, campaign.id, {
    mapId: map.id,
    name: 'Ingresso',
    fogBase: 'hidden',
    playerAssignments: [],
  });
  return { campaignId: campaign.id, mapId: map.id, sceneId: scene.sceneId };
};
