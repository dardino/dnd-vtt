import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { srdCatalogSchema } from '@dnd-vtt/shared';
import { loadSrdCatalog, availableSrdVersions } from '../src/srd/load.js';
import { closeTestApp, createTestApp, type TestApp } from './helpers.js';

const VERSION = 'srd-5.2.0';

describe('catalogo SRD 5.2', () => {
  const catalog = loadSrdCatalog(VERSION);

  it('valida l intero catalogo con lo schema condiviso', () => {
    expect(srdCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it('espone una sola versione ed è quella corrente', () => {
    expect(availableSrdVersions()).toEqual([VERSION]);
  });

  it('ha i conteggi attesi e coerenti con gli array', () => {
    expect(catalog.classes).toHaveLength(12);
    expect(catalog.species).toHaveLength(9);
    expect(catalog.backgrounds).toHaveLength(4);
    expect(catalog.feats).toHaveLength(17);
    expect(catalog.spells).toHaveLength(339);
    expect(catalog.items).toHaveLength(195);
    expect(catalog.monsters).toHaveLength(331);
    expect(catalog.meta.counts).toMatchObject({
      classes: catalog.classes.length,
      species: catalog.species.length,
      backgrounds: catalog.backgrounds.length,
      feats: catalog.feats.length,
      spells: catalog.spells.length,
      items: catalog.items.length,
      monsters: catalog.monsters.length,
    });
  });

  it('non ha id duplicati', () => {
    for (const collection of ['classes', 'species', 'backgrounds', 'feats', 'spells', 'items', 'monsters'] as const) {
      const ids = catalog[collection].map((entry) => entry.id);
      expect(new Set(ids).size, collection).toBe(ids.length);
    }
  });

  it('ha classi con dado vita, TS, competenze e progressione coerenti', () => {
    for (const characterClass of catalog.classes) {
      expect([6, 8, 10, 12]).toContain(characterClass.hitDie);
      expect(characterClass.savingThrows).toHaveLength(2);
      expect(characterClass.weaponMasteryCount).toHaveLength(20);
      expect(characterClass.asiLevels.every((level) => level >= 1 && level <= 20)).toBe(true);
      expect(
        characterClass.features.every((feature) => feature.level >= 1 && feature.level <= 20),
      ).toBe(true);
      expect(characterClass.subclasses).toHaveLength(1);
      if (characterClass.spellcasting !== undefined) {
        expect(characterClass.spellcasting.cantripsKnown).toHaveLength(20);
        expect(characterClass.spellcasting.preparedSpells).toHaveLength(20);
        expect(characterClass.spellcasting.slots).toHaveLength(20);
        expect(characterClass.spellcasting.slots.every((row) => row.length === 9)).toBe(true);
      }
    }
  });

  it('ha i valori SRD attesi per le classi principali', () => {
    const barbarian = catalog.classes.find((entry) => entry.id === 'barbarian');
    const fighter = catalog.classes.find((entry) => entry.id === 'fighter');
    const wizard = catalog.classes.find((entry) => entry.id === 'wizard');
    const warlock = catalog.classes.find((entry) => entry.id === 'warlock');

    expect(barbarian?.hitDie).toBe(12);
    expect(fighter?.startingGold).toBe(155);
    expect(fighter?.startingEquipment).toHaveLength(3);
    expect(wizard?.spellcasting?.slots[0]).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(wizard?.spellcasting?.cantripsKnown[0]).toBe(3);
    expect(warlock?.spellcasting?.pactSlots?.[4]).toEqual({ level: 3, count: 2 });
    expect(wizard?.subclasses[0]?.id).toBe('evoker');
  });

  it('collega background, talenti, incantesimi e classi senza riferimenti rotti', () => {
    const classIds = new Set(catalog.classes.map((entry) => entry.id));
    const featIds = new Set(catalog.feats.map((entry) => entry.id));

    for (const background of catalog.backgrounds) {
      expect(featIds.has(background.featId), background.id).toBe(true);
    }
    for (const spell of catalog.spells) {
      expect(spell.classes.length, spell.id).toBeGreaterThan(0);
      for (const classId of spell.classes) {
        expect(classIds.has(classId), `${spell.id} -> ${classId}`).toBe(true);
      }
    }
    for (const characterClass of catalog.classes) {
      for (const subclass of characterClass.subclasses) {
        expect(subclass.classId).toBe(characterClass.id);
        expect(subclass.features.every((feature) => feature.level >= 3)).toBe(true);
      }
    }
  });

  it('ha oggetti coerenti con il tipo di dato e valori finiti', () => {
    for (const item of catalog.items) {
      expect(Number.isFinite(item.valueGp), item.id).toBe(true);
      expect(Number.isFinite(item.weightLb), item.id).toBe(true);
      if (item.category === 'weapon') {
        expect(item.data.category).toBe('weapon');
      }
      if (item.category === 'armor') {
        expect(item.data.category).toBe('armor');
      }
    }
    const longsword = catalog.items.find((entry) => entry.id === 'longsword');
    expect(longsword?.valueGp).toBe(15);
    expect(longsword?.data).toMatchObject({ category: 'weapon', damage: { dice: '1d8', type: 'slashing' } });
    const chainMail = catalog.items.find((entry) => entry.id === 'chain-mail');
    expect(chainMail?.data).toMatchObject({ category: 'armor', armorCategory: 'heavy', baseAc: 16 });
  });

  it('ha mostri con caratteristiche, difese e azioni valide', () => {
    for (const monster of catalog.monsters) {
      expect(
        Object.values(monster.abilities).every((score) => score >= 1 && score <= 30),
        monster.id,
      ).toBe(true);
      expect(monster.hp.max).toBeGreaterThan(0);
      expect(monster.ac).toBeGreaterThanOrEqual(0);
      expect(monster.damageResistances.every((entry) => typeof entry === 'string')).toBe(true);
      expect(monster.conditionImmunities.every((entry) => typeof entry === 'string')).toBe(true);
    }
    const aboleth = catalog.monsters.find((entry) => entry.id === 'aboleth');
    expect(aboleth?.cr).toBe('10');
    expect(aboleth?.abilities.str).toBe(21);
    expect(aboleth?.legendary?.max).toBe(3);
  });
});

describe('API SRD', () => {
  let app: FastifyInstance;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('serve i metadati della versione', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/srd/meta' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('immutable');
    const body = response.json();
    expect(body.version).toBe(VERSION);
    expect(body.versions).toEqual([VERSION]);
    expect(body.license.key).toBe('CC-BY-4.0');
    expect(body.counts.classes).toBe(12);
  });

  it('serve le classi complete', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/srd/${VERSION}/classes` });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(12);
    expect(body.find((entry: { id: string }) => entry.id === 'fighter').hitDie).toBe(10);
  });

  it('filtra gli incantesimi per livello e classe', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/srd/${VERSION}/spells?level=0&class=wizard`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((spell: { level: number; classes: string[] }) =>
      spell.level === 0 && spell.classes.includes('wizard'))).toBe(true);
  });

  it('filtra oggetti e mostri', async () => {
    const items = await app.inject({ method: 'GET', url: `/api/v1/srd/${VERSION}/items?category=armor` });
    expect(items.statusCode).toBe(200);
    expect(items.json().every((item: { category: string }) => item.category === 'armor')).toBe(true);

    const monsters = await app.inject({ method: 'GET', url: `/api/v1/srd/${VERSION}/monsters?cr=10` });
    expect(monsters.statusCode).toBe(200);
    expect(monsters.json().every((monster: { cr: string }) => monster.cr === '10')).toBe(true);
  });

  it('risponde 404 per una versione sconosciuta', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/srd/srd-5.1.0/classes' });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('srd_version_unknown');
  });

  it('rifiuta un livello incantesimo non valido', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/srd/${VERSION}/spells?level=12` });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('bad_request');
  });
});
