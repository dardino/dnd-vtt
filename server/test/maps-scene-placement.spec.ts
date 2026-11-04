import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  defaultTerrain,
  isFootprintPlaceable,
  mapDocumentSchema,
  type Map,
  type MapDocument,
  type MapElement,
  type MapSpawn,
  type SceneSnapshot,
  type TokenState,
  type WallSegment,
} from '@dnd-vtt/shared';
import { closeTestApp, createTestApp } from './helpers.js';
import { createCampaign, createMonster, createPc, sendAction } from './factories.js';

const wall = (
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  extra: Partial<WallSegment> = {},
): WallSegment => ({
  id,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  ...extra,
});

/** Muri della scena reale: il muro diagonale attraversa l'interno di (11,4). */
const fixtureWalls = (): WallSegment[] => [
  wall('wall-h', 7, 5, 11, 5),
  wall('wall-diag', 11, 5, 12, 4),
  wall('door-open', 13, 3, 12, 4, { kind: 'door', door: 'open' }),
  wall('door-closed', 15, 3, 16, 4, { kind: 'door', door: 'closed' }),
];

const terrainOf = (walls: readonly WallSegment[]) => ({
  ...defaultTerrain,
  walls: [...walls],
});

const spawn = (
  id: string,
  x: number,
  y: number,
  source: MapSpawn['source'],
  quantity = 1,
): MapElement => ({
  id,
  type: 'spawn',
  kind: 'monster',
  x,
  y,
  source,
  size: 1,
  hidden: false,
  quantity,
});

const start = (id: string, x: number, y: number): MapElement => ({
  id,
  type: 'start',
  x,
  y,
  label: 'Ingresso',
});

const token = (x: number, y: number): TokenState => ({
  id: 'token-invalid',
  label: 'Goblin',
  x,
  y,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
  visible: true,
});

const documentOf = (map: Map): MapDocument => {
  const document: Record<string, unknown> = { ...map };
  for (const key of [
    'id',
    'campaignId',
    'version',
    'createdAt',
    'updatedAt',
    'imageAssetId',
    'thumbAssetId',
    'compositeAssetId',
  ]) {
    delete document[key];
  }
  return mapDocumentSchema.parse(document);
};

interface CreateMapOptions {
  widthPx?: number;
  heightPx?: number;
}

const createMap = async (
  app: FastifyInstance,
  campaignId: string,
  options: CreateMapOptions = {},
): Promise<Map> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/maps`,
    payload: {
      name: 'Mappa placement',
      widthPx: options.widthPx ?? 1280,
      heightPx: options.heightPx ?? 720,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Map>();
};

const saveMap = async (
  app: FastifyInstance,
  map: Map,
  document: MapDocument,
): Promise<Map> => {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/v1/maps/${map.id}`,
    payload: { version: map.version, document },
  });
  expect(response.statusCode).toBe(200);
  return response.json<Map>();
};

const withWalls = (document: MapDocument, walls: readonly WallSegment[]): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [
      background,
      graphics,
      { ...constraints, items: [...walls] },
      elements,
    ],
  };
};

const withElements = (document: MapDocument, items: MapElement[]): MapDocument => {
  const [background, graphics, constraints, elements] = document.layers;
  return {
    ...document,
    layers: [
      background,
      graphics,
      constraints,
      { ...elements, items },
    ],
  };
};

const createSceneFromMap = async (
  app: FastifyInstance,
  campaignId: string,
  mapId: string,
  playerAssignments: Array<{ actorId: string; startId: string }> = [],
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/scenes/from-map`,
    payload: { mapId, playerAssignments },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ sceneId: string }>().sceneId;
};

const fetchScene = async (app: FastifyInstance, sceneId: string): Promise<SceneSnapshot> => {
  const response = await app.inject({ method: 'GET', url: `/api/v1/scenes/${sceneId}` });
  expect(response.statusCode).toBe(200);
  return response.json<SceneSnapshot>();
};

const tokensOf = (snapshot: SceneSnapshot): TokenState[] => snapshot.state.tokens;

const cellsOf = (snapshot: SceneSnapshot): Array<{ x: number; y: number }> =>
  tokensOf(snapshot).map((entry) => ({ x: entry.x, y: entry.y }));

describe('createSceneFromMap placement', () => {
  it('ricolloca uno spawn in cella invalida alla prima cella valida (10,3)', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const actorId = await createMonster(testApp.app, campaignId);
    const map = await createMap(testApp.app, campaignId);
    const saved = await saveMap(
      testApp.app,
      map,
      withElements(
        withWalls(documentOf(map), fixtureWalls()),
        [spawn('spawn-1', 11, 4, { type: 'actor', actorId })],
      ),
    );

    const sceneId = await createSceneFromMap(testApp.app, campaignId, saved.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(tokensOf(snapshot)).toHaveLength(1);
    expect(tokensOf(snapshot)[0]).toMatchObject({ actorId, x: 10, y: 3 });
    await closeTestApp(testApp);
  });

  it('ricolloca una partenza giocatore in cella invalida', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const pc = await createPc(testApp.app, campaignId);
    const map = await createMap(testApp.app, campaignId);
    const saved = await saveMap(
      testApp.app,
      map,
      withElements(
        withWalls(documentOf(map), fixtureWalls()),
        [start('start-1', 11, 4)],
      ),
    );

    const sceneId = await createSceneFromMap(testApp.app, campaignId, saved.id, [
      { actorId: pc.id, startId: 'start-1' },
    ]);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(tokensOf(snapshot)).toHaveLength(1);
    expect(tokensOf(snapshot)[0]).toMatchObject({ actorId: pc.id, x: 10, y: 3, owner: 'players' });
    await closeTestApp(testApp);
  });

  it('con quantità maggiore di 1 ricolloca ogni token in celle valide e distinte', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const actorId = await createMonster(testApp.app, campaignId);
    const map = await createMap(testApp.app, campaignId);
    const saved = await saveMap(
      testApp.app,
      map,
      withElements(
        withWalls(documentOf(map), fixtureWalls()),
        [spawn('spawn-1', 11, 4, { type: 'actor', actorId }, 2)],
      ),
    );

    const sceneId = await createSceneFromMap(testApp.app, campaignId, saved.id);
    const snapshot = await fetchScene(testApp.app, sceneId);

    const cells = cellsOf(snapshot);
    expect(cells).toHaveLength(2);
    expect(new Set(cells.map((cell) => `${cell.x},${cell.y}`)).size).toBe(2);
    expect(cells).toContainEqual({ x: 10, y: 3 });

    const terrain = terrainOf(fixtureWalls());
    for (const cell of cells) {
      expect(isFootprintPlaceable(cell, 1, terrain), `cella ${cell.x},${cell.y}`).toBe(true);
    }
    await closeTestApp(testApp);
  });

  it('salta spawn e partenze quando non esiste alcuna cella valida', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const actorId = await createMonster(testApp.app, campaignId);
    const pc = await createPc(testApp.app, campaignId);
    const map = await createMap(testApp.app, campaignId, { widthPx: 70, heightPx: 70 });
    const blocked: WallSegment[] = [wall('wall-1', 0.5, 0, 0.5, 1)];
    const saved = await saveMap(
      testApp.app,
      map,
      withElements(
        withWalls(documentOf(map), blocked),
        [
          spawn('spawn-1', 0, 0, { type: 'actor', actorId }),
          start('start-1', 0, 0),
        ],
      ),
    );

    const sceneId = await createSceneFromMap(testApp.app, campaignId, saved.id, [
      { actorId: pc.id, startId: 'start-1' },
    ]);
    const snapshot = await fetchScene(testApp.app, sceneId);

    expect(tokensOf(snapshot)).toEqual([]);
    await closeTestApp(testApp);
  });
});

describe('token.add placement', () => {
  it('rifiuta con 409 un token in footprint invalido senza modificare la scena', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);
    const saved = await saveMap(
      testApp.app,
      map,
      withWalls(documentOf(map), fixtureWalls()),
    );
    const sceneId = await createSceneFromMap(testApp.app, campaignId, saved.id);
    const before = await fetchScene(testApp.app, sceneId);

    const result = await sendAction(
      testApp.app,
      campaignId,
      sceneId,
      { type: 'token.add', token: token(11, 4) },
      { clientId: 'test', expectStatus: 409 },
    );
    expect(result.statusCode).toBe(409);

    const after = await fetchScene(testApp.app, sceneId);
    expect(tokensOf(after)).toEqual([]);
    expect(after.stateVersion).toBe(before.stateVersion);
    await closeTestApp(testApp);
  });

  it('accetta un token in cella valida', async () => {
    const testApp = await createTestApp();
    const campaignId = await createCampaign(testApp.app);
    const map = await createMap(testApp.app, campaignId);
    const saved = await saveMap(
      testApp.app,
      map,
      withWalls(documentOf(map), fixtureWalls()),
    );
    const sceneId = await createSceneFromMap(testApp.app, campaignId, saved.id);

    await sendAction(
      testApp.app,
      campaignId,
      sceneId,
      { type: 'token.add', token: token(10, 3) },
      { clientId: 'test', expectStatus: 200 },
    );

    const after = await fetchScene(testApp.app, sceneId);
    expect(tokensOf(after)).toHaveLength(1);
    expect(tokensOf(after)[0]).toMatchObject({ x: 10, y: 3 });
    await closeTestApp(testApp);
  });
});
