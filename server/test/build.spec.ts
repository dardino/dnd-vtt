import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { validatePcBuild, type PcBuild } from '@dnd-vtt/shared';
import { loadSrdCatalog } from '../src/srd/load.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';
import { createCampaign, fighterBuild } from './factories.js';

const catalog = loadSrdCatalog('srd-5.2.0');

const level5Wizard = (): PcBuild => {
  const wizard = catalog.classes.find((entry) => entry.id === 'wizard');
  if (wizard?.spellcasting === undefined) {
    throw new Error('wizard senza spellcasting');
  }
  const level = 5;
  const cantripTarget = wizard.spellcasting.cantripsKnown[level - 1] ?? 0;
  const preparedTarget = wizard.spellcasting.preparedSpells[level - 1] ?? 0;
  const wizardSpells = catalog.spells.filter((spell) => spell.classes.includes('wizard'));
  const cantrips = wizardSpells.filter((spell) => spell.level === 0).slice(0, cantripTarget).map((spell) => spell.id);
  const prepared = wizardSpells
    .filter((spell) => spell.level >= 1 && spell.level <= 3)
    .slice(0, preparedTarget)
    .map((spell) => spell.id);

  return {
    rulesVersion: catalog.meta.version,
    level,
    classId: 'wizard',
    subclassId: 'evoker',
    speciesId: 'human',
    backgroundId: 'sage',
    abilityGeneration: {
      method: 'pointBuy',
      base: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 8 },
    },
    backgroundIncreases: [
      { source: 'background', ability: 'int', amount: 2 },
      { source: 'background', ability: 'con', amount: 1 },
    ],
    feats: [{ id: 'magic-initiate' }],
    proficiencies: {
      classSkills: ['arcana', 'history'],
      speciesSkills: ['perception'],
      expertise: [],
      tools: [],
      languages: ['elvish', 'dwarvish'],
    },
    asiChoices: [
      { level: 4, type: 'asi', increases: [{ source: 'asi', ability: 'int', amount: 2 }] },
    ],
    weaponMasteries: [],
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
    budgetGp: 55,
    spells: { cantrips, known: [], prepared, spellbook: prepared },
    hpRolls: [4, 4, 4, 4],
  };
};

describe('build contro il catalogo SRD reale', () => {
  it('accetta un combattente nano di livello 5', () => {
    const result = validatePcBuild(fighterBuild(5), catalog);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.expectedHpMax).toBe(55);
    expect(result.totalAbilityScores).toMatchObject({ str: 19, con: 15 });
  });

  it('accetta un mago di livello 5 con incantesimi dal catalogo', () => {
    const result = validatePcBuild(level5Wizard(), catalog);

    expect(result.errors).toEqual([]);
    expect(result.expectedHpMax).toBe(32);
  });

  it('usa le maestrie delle armi della tabella di classe', () => {
    const fighter = catalog.classes.find((entry) => entry.id === 'fighter');
    expect(fighter?.weaponMasteryCount[4]).toBeGreaterThan(0);

    const build = fighterBuild(5);
    const result = validatePcBuild({ ...build, weaponMasteries: [] }, catalog);
    expect(result.errors.some((error) => error.code === 'weapon_mastery_count')).toBe(true);
  });

  it('accetta il talento Ability Score Improvement al posto dell ASI', () => {
    const build = fighterBuild(5);
    const result = validatePcBuild({
      ...build,
      asiChoices: [
        {
          level: 4,
          type: 'feat',
          featId: 'ability-score-improvement',
          increases: [{ source: 'feat', ability: 'str', amount: 2 }],
        },
      ],
    }, catalog);

    expect(result.errors).toEqual([]);
  });

  it('rifiuta un talento ripetuto quando non è ripetibile', () => {
    const build = fighterBuild(5);
    const result = validatePcBuild({ ...build, feats: [{ id: 'savage-attacker' }, { id: 'savage-attacker' }] }, catalog);
    expect(result.errors.some((error) => error.code === 'feat_duplicate')).toBe(true);
  });
});

describe('POST /api/v1/campaigns/:id/actors', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('persiste un pc di livello 5 e restituisce la scheda derivata', async () => {
    const campaignId = await createCampaign(app, { name: 'Builder' });
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actors`,
      payload: { name: 'Sir Test', build: fighterBuild(5) },
    });
    expect(created.statusCode).toBe(201);
    const actor = created.json<{ id: string; kind: string; hp: { max: number } }>();
    expect(actor.kind).toBe('pc');
    expect(actor.hp.max).toBe(55);

    const sheet = await app.inject({
      method: 'GET',
      url: `/api/v1/actors/${actor.id}/sheet`,
    });
    expect(sheet.statusCode).toBe(200);
    const view = sheet.json();
    expect(view.statblock.kind).toBe('pc');
    expect(view.statblock.class).toMatchObject({ id: 'fighter', subclassId: 'champion', level: 5 });
    expect(view.derived.ac).toBeGreaterThan(10);
    expect(view.inventory).toHaveLength(3);
    expect(view.sheetVersion).toBe(1);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/actors/${actor.id}/sheet`,
      payload: {
        sheetVersion: 1,
        patch: { hp: { current: 40, max: 55, temp: 0 } },
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().sheetVersion).toBe(2);
    expect(patched.json().statblock.hp).toEqual({ current: 40, max: 55, temp: 0 });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/actors/${actor.id}/sheet`,
      payload: {
        sheetVersion: 1,
        patch: { hp: { current: 10, max: 55, temp: 0 } },
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('sheet_conflict');
  });

  it('rifiuta una build invalida', async () => {
    const campaignId = await createCampaign(app, { name: 'Builder' });
    const build = fighterBuild(5);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actors`,
      payload: {
        name: 'Rotto',
        build: {
          ...build,
          asiChoices: [],
        },
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('invalid_build');
  });

  it('esegue i tiri 4d6kh3 dal server e li usa per la creazione', async () => {
    const campaignId = await createCampaign(app, { name: 'Builder' });
    const rolled = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actors/roll-stats`,
      payload: {},
    });
    expect(rolled.statusCode).toBe(200);
    const result = rolled.json<{ rollId: string; values: number[] }>();
    expect(result.values).toHaveLength(6);
    expect(result.values.every((value) => value >= 3 && value <= 18)).toBe(true);

    const build = fighterBuild(5);
    const values = result.values;
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actors`,
      payload: {
        name: 'Tirato',
        build: {
          ...build,
          backgroundIncreases: [
            { source: 'background', ability: 'str', amount: 1 },
            { source: 'background', ability: 'dex', amount: 1 },
            { source: 'background', ability: 'con', amount: 1 },
          ],
          asiChoices: [
            {
              level: 4,
              type: 'asi',
              increases: [{ source: 'asi', ability: 'int', amount: 2 }],
            },
          ],
          abilityGeneration: {
            method: 'rolled',
            base: {
              str: values[0] ?? 10,
              dex: values[1] ?? 10,
              con: values[2] ?? 10,
              int: values[3] ?? 10,
              wis: values[4] ?? 10,
              cha: values[5] ?? 10,
            },
            rolls: values,
            rollId: result.rollId,
          },
        },
      },
    });
    expect(created.statusCode).toBe(201);

    const unknown = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/actors`,
      payload: {
        name: 'Scaduto',
        build: {
          ...build,
          abilityGeneration: {
            method: 'rolled',
            base: { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 },
            rolls: [12, 12, 12, 12, 12, 12],
            rollId: '00000000-0000-4000-8000-000000000000',
          },
        },
      },
    });
    expect(unknown.statusCode).toBe(409);
    expect(unknown.json().error.code).toBe('roll_expired');
  });
});

describe('POST /api/v1/actors/preview', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('restituisce la validazione senza scrivere', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/actors/preview',
      payload: fighterBuild(5),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.expectedHpMax).toBe(55);
    expect(body.totalAbilityScores.str).toBe(19);
  });

  it('rifiuta un body non conforme allo schema', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/actors/preview',
      payload: { rulesVersion: 'srd-5.2.0' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('invalid_build');
  });

  it('rifiuta una versione SRD sconosciuta', async () => {
    const build = fighterBuild(5);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/actors/preview',
      payload: { ...build, rulesVersion: 'srd-5.1.0' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('srd_version_unknown');
  });
});
