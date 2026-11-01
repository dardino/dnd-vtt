import { expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { MonsterStatblock, PcBuild } from '@dnd-vtt/shared';
import { v7 as uuidv7 } from 'uuid';
import { loadSrdCatalog } from '../src/srd/load.js';

export interface CampaignFixtureOptions {
  name?: string;
  description?: string;
  advancementMode?: 'milestone' | 'xp';
  fogDefault?: 'hidden' | 'revealed';
}

export interface SceneFixtureOptions {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  fogBase?: 'hidden' | 'revealed';
}

export interface DisplayFixtureOptions {
  label?: string;
}

export interface MonsterFixtureOptions {
  name?: string;
  statblock?: MonsterStatblock;
}

export interface SendActionOptions {
  id?: string;
  clientId?: string;
  expectStatus?: number;
}

export interface ActionBody {
  id: string;
  stateVersion: number;
  inverse?: unknown;
  label?: string;
  [key: string]: unknown;
}

export interface ActionResult<T = ActionBody> {
  statusCode: number;
  body: T;
}

export interface CreatePcOptions {
  name?: string;
  level?: number;
  build?: PcBuild;
}

export interface PcFixture {
  id: string;
  hp: { current: number; max: number; temp: number };
}

export const createCampaign = async (
  app: FastifyInstance,
  options: CampaignFixtureOptions = {},
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    payload: {
      name: options.name ?? 'La miniera perduta',
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.advancementMode === undefined ? {} : { advancementMode: options.advancementMode }),
      ...(options.fogDefault === undefined ? {} : { fogDefault: options.fogDefault }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

export const createScene = async (
  app: FastifyInstance,
  campaignId: string,
  options: SceneFixtureOptions = {},
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/scenes`,
    payload: {
      name: options.name ?? 'Ingresso',
      widthPx: options.widthPx ?? 1920,
      heightPx: options.heightPx ?? 1080,
      ...(options.fogBase === undefined ? {} : { fogBase: options.fogBase }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

export const createDisplay = async (
  app: FastifyInstance,
  campaignId: string,
  options: DisplayFixtureOptions = {},
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/displays`,
    payload: options.label === undefined ? {} : { label: options.label },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ code: string }>().code;
};

export const defaultMonsterStatblock = (): MonsterStatblock => ({
  kind: 'monster',
  size: 'medium',
  abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 8 },
  hp: { current: 7, max: 7, temp: 0 },
  speed: { walk: 30 },
  senses: {},
  languages: ['common'],
  conditions: [],
  creatureType: 'goblinoid',
  cr: '1/4',
  tags: [],
  ac: 13,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  traits: [],
  actions: [],
  reactions: [],
});

export const createMonster = async (
  app: FastifyInstance,
  campaignId: string,
  options: MonsterFixtureOptions = {},
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/actors',
    payload: {
      campaignId,
      kind: 'monster',
      name: options.name ?? 'Goblin di prova',
      statblock: options.statblock ?? defaultMonsterStatblock(),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
};

export const sendAction = async (
  app: FastifyInstance,
  campaignId: string,
  sceneId: string,
  action: object,
  options: SendActionOptions = {},
): Promise<ActionResult> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/actions`,
    payload: {
      id: options.id ?? uuidv7(),
      clientId: options.clientId ?? 'test',
      sceneId,
      action,
    },
  });
  if (options.expectStatus !== undefined) {
    expect(response.statusCode).toBe(options.expectStatus);
  }
  return { statusCode: response.statusCode, body: response.json<ActionBody>() };
};

export const fighterBuild = (level = 4): PcBuild => {
  const catalog = loadSrdCatalog('srd-5.2.0');
  const fighter = catalog.classes.find((entry) => entry.id === 'fighter');
  if (fighter === undefined) {
    throw new Error('fighter mancante');
  }
  const masteries = catalog.items
    .filter((item) => item.category === 'weapon')
    .slice(0, fighter.weaponMasteryCount[level - 1] ?? 0)
    .map((item) => item.id);
  return {
    rulesVersion: catalog.meta.version,
    level,
    classId: 'fighter',
    subclassId: level >= 3 ? 'champion' : undefined,
    speciesId: 'dwarf',
    backgroundId: 'soldier',
    abilityGeneration: {
      method: 'pointBuy',
      base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
    },
    backgroundIncreases: [
      { source: 'background', ability: 'str', amount: 2 },
      { source: 'background', ability: 'con', amount: 1 },
    ],
    feats: [{ id: 'savage-attacker' }],
    proficiencies: {
      classSkills: ['athletics', 'perception'],
      speciesSkills: [],
      expertise: [],
      tools: [],
      languages: ['elvish', 'dwarvish'],
    },
    asiChoices: level >= 4
      ? [{ level: 4, type: 'asi', increases: [{ source: 'asi', ability: 'str', amount: 2 }] }]
      : [],
    weaponMasteries: masteries,
    equipment: [
      { itemId: 'longsword', quantity: 1 },
      { itemId: 'chain-mail', quantity: 1 },
      { itemId: 'shield', quantity: 1 },
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
    budgetGp: 155,
    spells: { cantrips: [], known: [], prepared: [], spellbook: [] },
    hpRolls: Array.from({ length: level - 1 }, (_, index) => 7 + (index % 2)),
  };
};

export const createPc = async (
  app: FastifyInstance,
  campaignId: string,
  options: CreatePcOptions = {},
): Promise<PcFixture> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/actors`,
    payload: {
      name: options.name ?? 'Eroe di prova',
      build: options.build ?? fighterBuild(options.level ?? 4),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<PcFixture>();
};
