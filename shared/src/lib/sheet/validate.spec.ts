import { describe, expect, it } from 'vitest';
import type { PcBuild } from '../../schemas/build.js';
import { validatePcBuild } from './validate.js';
import {
  baseFighterBuild,
  baseWizardBuild,
  testCatalog,
} from './__fixtures__/catalog.js';

const level4Fighter = (overrides: Partial<PcBuild> = {}): PcBuild => baseFighterBuild({
  level: 4,
  subclassId: 'champion',
  asiChoices: [
    {
      level: 4,
      type: 'asi',
      increases: [{ source: 'asi', ability: 'str', amount: 2 }],
    },
  ],
  hpRolls: [7, 8, 6],
  ...overrides,
});

const codes = (build: PcBuild): string[] =>
  validatePcBuild(build, testCatalog).errors.map((error) => error.code);

describe('validatePcBuild', () => {
  it('accetta un combattente di livello 1 completo', () => {
    const result = validatePcBuild(baseFighterBuild(), testCatalog);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.expectedHpMax).toBe(12);
    expect(result.totalAbilityScores).toEqual({
      str: 17,
      dex: 14,
      con: 15,
      int: 8,
      wis: 12,
      cha: 8,
    });
  });

  it('accetta un combattente di livello 4 con ASI, sottoclasse e tiri di HP', () => {
    const result = validatePcBuild(level4Fighter(), testCatalog);

    expect(result.errors).toEqual([]);
    expect(result.expectedHpMax).toBe(39);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'budget_not_scaled' }));
  });

  it('accetta un mago con trucchetti e incantesimi preparati', () => {
    const result = validatePcBuild(baseWizardBuild(), testCatalog);
    expect(result.errors).toEqual([]);
  });

  it('rifiuta una classe inesistente', () => {
    expect(codes(baseFighterBuild({ classId: 'paladin' }))).toContain('class_unknown');
  });

  it('rifiuta una versione delle regole diversa dal catalogo', () => {
    expect(codes(baseFighterBuild({ rulesVersion: 'srd-5.1.0' }))).toContain('rules_version_mismatch');
  });

  it('impone la sottoclasse al livello corretto', () => {
    expect(codes(baseFighterBuild({ level: 4, hpRolls: [7, 8, 6] }))).toContain('subclass_required');
    expect(codes(baseFighterBuild({ level: 1, subclassId: 'champion' }))).toContain('subclass_too_early');
  });

  it('verifica il budget del point buy', () => {
    const build = baseFighterBuild({
      abilityGeneration: {
        method: 'pointBuy',
        base: { str: 15, dex: 14, con: 14, int: 9, wis: 12, cha: 8 },
      },
    });
    expect(codes(build)).toContain('point_buy_budget');
  });

  it('verifica lo standard array', () => {
    const build = baseFighterBuild({
      abilityGeneration: { method: 'standardArray', base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 } },
    });
    expect(codes(build)).toContain('standard_array_mismatch');
  });

  it('verifica che i tiri 4d6kh3 corrispondano ai punteggi assegnati', () => {
    const build = baseFighterBuild({
      abilityGeneration: {
        method: 'rolled',
        base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
        rolls: [15, 14, 14, 12, 10, 8],
      },
    });
    expect(codes(build)).toContain('rolled_assignment_mismatch');
  });

  it('verifica il pattern degli aumenti del background', () => {
    const build = baseFighterBuild({
      backgroundIncreases: [
        { source: 'background', ability: 'str', amount: 2 },
        { source: 'background', ability: 'con', amount: 2 },
      ],
    });
    expect(codes(build)).toContain('background_pattern');
  });

  it('richiede gli ASI previsti dalla classe', () => {
    const build = level4Fighter({ asiChoices: [] });
    expect(codes(build)).toContain('asi_missing');
  });

  it('accetta un talento al posto dell ASI con il suo aumento', () => {
    const build = level4Fighter({
      asiChoices: [
        {
          level: 4,
          type: 'feat',
          featId: 'ability-score-improvement',
          increases: [{ source: 'feat', ability: 'str', amount: 2 }],
        },
      ],
    });
    expect(validatePcBuild(build, testCatalog).errors).toEqual([]);
  });

  it('rifiuta un talento sotto il livello minimo', () => {
    const build = baseFighterBuild({ feats: [{ id: 'ability-score-improvement' }] });
    expect(codes(build)).toContain('feat_level');
  });

  it('verifica il numero di competenze di classe', () => {
    const build = baseFighterBuild({
      proficiencies: { ...baseFighterBuild().proficiencies, classSkills: ['athletics'] },
    });
    expect(codes(build)).toContain('class_skill_count');
  });

  it('richiede che l expertise sia su una competenza posseduta', () => {
    const build = baseFighterBuild({
      proficiencies: { ...baseFighterBuild().proficiencies, expertise: ['stealth'] },
    });
    expect(codes(build)).toContain('expertise_invalid');
  });

  it('blocca la spesa oltre il budget', () => {
    const build = baseFighterBuild({
      equipment: [
        { itemId: 'longsword', quantity: 1 },
        { itemId: 'chain-mail', quantity: 2 },
        { itemId: 'shield', quantity: 1 },
      ],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    });
    expect(codes(build)).toContain('budget_exceeded');
  });

  it('verifica il numero di trucchetti e incantesimi', () => {
    expect(
      codes(baseWizardBuild({ spells: { cantrips: [], known: [], prepared: ['magic-missile'], spellbook: [] } })),
    ).toContain('cantrip_count');
    expect(
      codes(baseWizardBuild({ spells: { cantrips: ['fire-bolt'], known: [], prepared: ['magic-missile'], spellbook: [] } })),
    ).toContain('spell_count');
  });

  it('rifiuta un incantesimo di livello troppo alto', () => {
    const build = baseWizardBuild({
      spells: {
        cantrips: ['fire-bolt'],
        known: [],
        prepared: ['magic-missile', 'misty-step'],
        spellbook: ['magic-missile', 'misty-step'],
      },
    });
    expect(codes(build)).toContain('spell_too_high');
  });

  it('rifiuta un incantesimo di un altra classe', () => {
    const build = baseWizardBuild({
      spells: {
        cantrips: ['fire-bolt'],
        known: [],
        prepared: ['magic-missile', 'healing-word'],
        spellbook: ['magic-missile', 'healing-word'],
      },
    });
    expect(codes(build)).toContain('spell_not_for_class');
  });

  it('verifica i tiri di dado vita', () => {
    expect(codes(level4Fighter({ hpRolls: [7] }))).toContain('hp_rolls_count');
    expect(codes(level4Fighter({ hpRolls: [7, 8, 11] }))).toContain('hp_roll_invalid');
  });

  it('verifica il numero di maestrie delle armi', () => {
    expect(codes(baseFighterBuild({ weaponMasteries: [] }))).toContain('weapon_mastery_count');
  });

  it('impedisce di superare il massimo di 20 con gli ASI', () => {
    const build = baseFighterBuild({
      level: 6,
      subclassId: 'champion',
      asiChoices: [
        { level: 4, type: 'asi', increases: [{ source: 'asi', ability: 'str', amount: 2 }] },
        { level: 6, type: 'asi', increases: [{ source: 'asi', ability: 'str', amount: 2 }] },
      ],
      hpRolls: [7, 8, 6, 9, 5],
    });
    expect(codes(build)).toContain('ability_cap');
  });

  it('associa ogni errore allo step del wizard', () => {
    const result = validatePcBuild(baseFighterBuild({ classId: 'paladin' }), testCatalog);
    expect(result.errors[0]?.step).toBe('identity');
  });
});
