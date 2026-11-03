import { describe, expect, it } from 'vitest';
import {
  dmSheetViewSchema,
  playerSheetViewSchema,
  sheetViewBaseSchema,
  type Actor,
  type PublicActor,
} from './actor.js';
import type { MonsterStatblock } from './sheet.js';

const CAMPAIGN = {
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'La miniera perduta',
};

const statblock: MonsterStatblock = {
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
};

const actor: Actor = {
  id: '018f0000-0000-7000-8000-000000000002',
  campaignId: CAMPAIGN.id,
  kind: 'monster',
  name: 'Goblin',
  statblock,
  rulesVersion: null,
  xp: 0,
  sheetVersion: 1,
  dmNotes: 'Attacca dal buio',
  imageAssetId: null,
  portrait: null,
  hp: null,
  createdAt: '2026-11-03T08:00:00.000Z',
  updatedAt: '2026-11-03T08:00:00.000Z',
};

const publicView: PublicActor = (() => {
  const { dmNotes, ...rest } = actor;
  void dmNotes;
  return rest;
})();

const base = {
  actor: publicView,
  statblock,
  derived: null,
  inventory: [],
  sheetVersion: 1,
  campaign: CAMPAIGN,
};

describe('viste scheda', () => {
  it('condivide la base e aggiunge solo i campi del ruolo', () => {
    expect(Object.keys(sheetViewBaseSchema.shape)).toEqual([
      'actor',
      'statblock',
      'derived',
      'inventory',
      'sheetVersion',
      'campaign',
    ]);
    for (const key of Object.keys(sheetViewBaseSchema.shape)) {
      expect(dmSheetViewSchema.shape).toHaveProperty(key);
      expect(playerSheetViewSchema.shape).toHaveProperty(key);
    }
    expect(dmSheetViewSchema.shape).toHaveProperty('dmNotes');
    expect(playerSheetViewSchema.shape).not.toHaveProperty('dmNotes');
    for (const key of ['playerNotes', 'editingEnabled', 'editable', 'autoApprove']) {
      expect(playerSheetViewSchema.shape).toHaveProperty(key);
      expect(dmSheetViewSchema.shape).not.toHaveProperty(key);
    }
  });

  it('valida la vista DM con attore completo e campagna nullable', () => {
    const view = dmSheetViewSchema.parse({ ...base, actor, dmNotes: actor.dmNotes });
    expect(view.actor.dmNotes).toBe('Attacca dal buio');
    expect(view.campaign).toEqual(CAMPAIGN);
    expect(dmSheetViewSchema.parse({ ...base, actor, campaign: null, dmNotes: null }).campaign)
      .toBeNull();
  });

  it('valida la vista giocatore senza dmNotes e con i campi editabili', () => {
    const view = playerSheetViewSchema.parse({
      ...base,
      playerNotes: 'Nota del giocatore',
      editingEnabled: true,
      editable: ['hp', 'playerNotes'],
      autoApprove: false,
    });
    expect(view.actor).toEqual(publicView);
    expect(view.playerNotes).toBe('Nota del giocatore');
    expect(view.editingEnabled).toBe(true);

    expect(() => playerSheetViewSchema.parse({
      ...base,
      actor,
      playerNotes: '',
      editingEnabled: true,
      editable: [],
      autoApprove: false,
    })).toThrow();
    expect(() => playerSheetViewSchema.parse({
      ...base,
      dmNotes: 'non deve passare',
      playerNotes: '',
      editingEnabled: true,
      editable: [],
      autoApprove: false,
    })).toThrow();
    expect(() => playerSheetViewSchema.parse({
      ...base,
      playerNotes: '',
      editable: [],
      autoApprove: false,
    })).toThrow();
  });
});
