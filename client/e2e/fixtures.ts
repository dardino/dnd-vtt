import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { MonsterStatblock, SceneSnapshot } from '@dnd-vtt/shared';

export const CAMPAIGN_NAME = 'E2E Campagna';
export const STAGE_CAMPAIGN_NAME = 'E2E Regia';

/**
 * Nome campagna predefinito per lo spec corrente. Ogni file usa una campagna
 * propria così i worker Playwright non si contendono scena attiva e token.
 * `phase-2` resta sulla campagna "vergine" perché verifica il primo avvio.
 */
const specCampaignName = (): string => {
  const file = test.info().file.replaceAll('\\', '/');
  const spec = /e2e\/([^/]+)\.spec\.ts$/.exec(file)?.[1] ?? 'shared';
  return spec === 'phase-2' ? CAMPAIGN_NAME : `${CAMPAIGN_NAME} · ${spec}`;
};

/** Cache per worker: evita una GET di elenco prima di ogni openCampaign. */
const knownCampaigns = new Map<string, string>();

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export interface CampaignFixtureOptions {
  name?: string;
  description?: string;
}

export interface OpenCampaignOptions {
  name?: string;
  createIfMissing?: boolean;
}

export interface SceneFixtureOptions {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  fogBase?: 'hidden' | 'revealed';
  imageAssetId?: string;
}

export interface AssetFixtureOptions {
  name?: string;
  buffer?: Buffer;
}

export interface GoblinFixtureOptions {
  name?: string;
  languages?: string[];
  actions?: MonsterStatblock['actions'];
}

export interface ActorFixture {
  id: string;
}

export interface StageFixtureOptions {
  width?: number;
  height?: number;
}

export interface StageFixture {
  campaignId: string;
  sceneId: string;
  tokenId: string;
  actorId: string;
}

export const createCampaign = async (
  request: APIRequestContext,
  options: CampaignFixtureOptions = {},
): Promise<string> => {
  const name = options.name ?? CAMPAIGN_NAME;
  const created = await request.post('/api/v1/campaigns', {
    data: {
      name,
      description: options.description ?? 'Fixture E2E',
      advancementMode: 'milestone',
    },
  });
  const id = (await created.json() as { id: string }).id;
  knownCampaigns.set(name, id);
  return id;
};

export const uploadPng = async (
  request: APIRequestContext,
  options: AssetFixtureOptions = {},
): Promise<string> => {
  const response = await request.post('/api/v1/assets', {
    multipart: {
      file: {
        name: options.name ?? 'asset.png',
        mimeType: 'image/png',
        buffer: options.buffer ?? PNG_1X1,
      },
    },
  });
  return (await response.json() as { id: string }).id;
};

/**
 * Restituisce l'id della campagna E2E, creandola se non esiste ancora.
 */
export const campaignId = async (
  request: APIRequestContext,
  options: CampaignFixtureOptions = {},
): Promise<string> => {
  const name = options.name ?? specCampaignName();
  const cached = knownCampaigns.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const list = await request.get('/api/v1/campaigns?limit=200');
  const items = (await list.json() as { items: { id: string; name: string }[] }).items;
  const existing = items.find((item) => item.name === name);
  if (existing !== undefined) {
    knownCampaigns.set(name, existing.id);
    return existing.id;
  }
  return createCampaign(request, {
    name,
    ...(options.description === undefined ? {} : { description: options.description }),
  });
};

/**
 * Apre la console DM sulla campagna E2E, gestendo sia la scelta sia la creazione.
 * Con `createIfMissing: false` si limita a scegliere una campagna già esistente.
 */
export const openCampaign = async (
  page: Page,
  options: OpenCampaignOptions = {},
): Promise<void> => {
  const name = options.name ?? specCampaignName();
  const createIfMissing = options.createIfMissing ?? true;
  let id = knownCampaigns.get(name);
  if (id === undefined) {
    const list = await page.request.get('/api/v1/campaigns?limit=200');
    if (list.ok()) {
      const items = (await list.json() as { items: { id: string; name: string }[] }).items;
      const existing = items.find((item) => item.name === name);
      if (existing !== undefined) {
        id = existing.id;
        knownCampaigns.set(name, id);
      }
    }
  }
  if (id === undefined && createIfMissing) {
    id = await createCampaign(page.request, { name });
  }
  if (id === undefined) {
    throw new Error(`Campagna E2E non trovata: ${name}`);
  }
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['dnd-vtt.lastCampaignId', id] as const,
  );
  await page.goto('/dm');
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
};

export const createScene = async (
  request: APIRequestContext,
  id: string,
  options: SceneFixtureOptions = {},
): Promise<string> => {
  const created = await request.post(`/api/v1/campaigns/${id}/scenes`, {
    data: {
      name: options.name ?? 'Arena',
      widthPx: options.widthPx ?? 1024,
      heightPx: options.heightPx ?? 768,
      ...(options.fogBase === undefined ? {} : { fogBase: options.fogBase }),
      ...(options.imageAssetId === undefined ? {} : { imageAssetId: options.imageAssetId }),
    },
  });
  return (await created.json() as { id: string }).id;
};

/**
 * Restituisce la scena attiva con il nome richiesto, creandola se non esiste.
 * Riusare una scena con nome diverso renderebbe i test dipendenti l'uno dall'altro.
 */
export const ensureScene = async (
  request: APIRequestContext,
  id: string,
  options: SceneFixtureOptions = {},
): Promise<string> => {
  const name = options.name ?? 'Arena';
  const campaign = await request.get(`/api/v1/campaigns/${id}`);
  const activeSceneId = (await campaign.json() as { activeSceneId: string | null }).activeSceneId;
  const scenesResponse = await request.get(`/api/v1/campaigns/${id}/scenes?limit=200`);
  const scenes = (await scenesResponse.json() as { items: { id: string; name: string }[] }).items;
  const active = scenes.find((scene) => scene.id === activeSceneId);
  if (active !== undefined && active.name === name) {
    return active.id;
  }
  const existing = scenes.find((scene) => scene.name === name);
  if (existing !== undefined) {
    await request.patch(`/api/v1/campaigns/${id}`, { data: { activeSceneId: existing.id } });
    return existing.id;
  }
  const sceneId = await createScene(request, id, { ...options, name });
  await request.patch(`/api/v1/campaigns/${id}`, { data: { activeSceneId: sceneId } });
  return sceneId;
};

/**
 * Crea un goblin di prova nella campagna indicata.
 */
export const createGoblin = async (
  request: APIRequestContext,
  id: string,
  options: GoblinFixtureOptions = {},
): Promise<ActorFixture> => {
  const response = await request.post('/api/v1/actors', {
    data: {
      campaignId: id,
      kind: 'monster',
      name: options.name ?? 'Goblin E2E',
      statblock: {
        kind: 'monster',
        size: 'medium',
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        hp: { current: 7, max: 7, temp: 0 },
        speed: { walk: 30 },
        senses: { darkvision: 60 },
        languages: options.languages ?? ['common', 'goblin'],
        conditions: [],
        creatureType: 'goblinoid',
        cr: '1/4',
        tags: [],
        ac: 15,
        damageResistances: [],
        damageImmunities: [],
        damageVulnerabilities: [],
        conditionImmunities: [],
        traits: [],
        actions: options.actions ?? [],
        reactions: [],
      },
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<ActorFixture>;
};

/**
 * Crea la scena "Palco" con mappa, goblin con ritratto e token per i test di regia.
 */
export const createStageFixture = async (
  request: APIRequestContext,
  options: StageFixtureOptions = {},
): Promise<StageFixture> => {
  const id = await createCampaign(request, {
    name: STAGE_CAMPAIGN_NAME,
    description: 'Doppio schermo',
  });
  const mapAssetId = await uploadPng(request, { name: 'mappa.png' });
  const sceneId = await createScene(request, id, {
    name: 'Palco',
    widthPx: options.width ?? 1000,
    heightPx: options.height ?? 800,
    fogBase: 'revealed',
    imageAssetId: mapAssetId,
  });
  const goblin = await createGoblin(request, id, {
    name: 'Goblin Palco',
    languages: ['common'],
    actions: [{
      name: 'Scimitarra',
      description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
      recharge: 'none',
    }],
  });
  const portraitAssetId = await uploadPng(request, { name: 'ritratto.png' });
  await request.patch(`/api/v1/actors/${goblin.id}`, {
    data: {
      imageAssetId: portraitAssetId,
      portrait: { focusX: 0.5, focusY: 0.4, zoom: 1.2 },
    },
  });
  const tokenId = crypto.randomUUID();
  await request.post(`/api/v1/campaigns/${id}/actions`, {
    data: {
      id: crypto.randomUUID(),
      clientId: 'phase7',
      sceneId,
      action: {
        type: 'token.add',
        token: {
          id: tokenId,
          actorId: goblin.id,
          label: 'Goblin Palco',
          x: 2,
          y: 2,
          size: 1,
          rotation: 0,
          elevation: 0,
          hp: { current: 7, max: 7, temp: 0 },
          conditions: [],
          visible: true,
        },
      },
    },
  });
  return { campaignId: id, sceneId, tokenId, actorId: goblin.id };
};

export const sceneSnapshot = async (
  request: APIRequestContext,
  sceneId: string,
): Promise<SceneSnapshot> => {
  const response = await request.get(`/api/v1/scenes/${sceneId}`);
  return response.json() as Promise<SceneSnapshot>;
};
