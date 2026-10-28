import { describe, expect, it } from 'vitest';
import { validatePcBuild, type PcBuild } from '@dnd-vtt/shared';
import { loadSrdCatalog } from '../src/srd/load.js';

const catalog = loadSrdCatalog('srd-5.2.0');

const level5Fighter = (): PcBuild => {
  const fighter = catalog.classes.find((entry) => entry.id === 'fighter');
  if (fighter === undefined) {
    throw new Error('fighter mancante');
  }
  const masteries = catalog.items
    .filter((item) => item.category === 'weapon')
    .slice(0, fighter.weaponMasteryCount[4] ?? 0)
    .map((item) => item.id);

  return {
    rulesVersion: catalog.meta.version,
    level: 5,
    classId: 'fighter',
    subclassId: 'champion',
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
    asiChoices: [
      {
        level: 4,
        type: 'asi',
        increases: [{ source: 'asi', ability: 'str', amount: 2 }],
      },
    ],
    weaponMasteries: masteries,
    equipment: [
      { itemId: 'longsword', quantity: 1 },
      { itemId: 'chain-mail', quantity: 1 },
      { itemId: 'shield', quantity: 1 },
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
    budgetGp: 155,
    spells: { cantrips: [], known: [], prepared: [], spellbook: [] },
    hpRolls: [7, 8, 6, 9],
  };
};

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
    const result = validatePcBuild(level5Fighter(), catalog);

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

    const build = level5Fighter();
    const result = validatePcBuild({ ...build, weaponMasteries: [] }, catalog);
    expect(result.errors.some((error) => error.code === 'weapon_mastery_count')).toBe(true);
  });

  it('accetta il talento Ability Score Improvement al posto dell ASI', () => {
    const build = level5Fighter();
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
    const build = level5Fighter();
    const result = validatePcBuild({ ...build, feats: [{ id: 'savage-attacker' }, { id: 'savage-attacker' }] }, catalog);
    expect(result.errors.some((error) => error.code === 'feat_duplicate')).toBe(true);
  });
});
