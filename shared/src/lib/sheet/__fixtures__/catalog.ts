import type { PcBuild } from '../../../schemas/build.js';
import type { Skill } from '../../../schemas/common.js';
import type { PcStatblock, ResolvedItem } from '../../../schemas/sheet.js';
import type { SrdCatalog, SrdClass } from '../../../schemas/srd.js';

const emptySlots = (): number[] => [0, 0, 0, 0, 0, 0, 0, 0, 0];

const zeroSlots = (): number[][] => Array.from({ length: 20 }, emptySlots);

const fillSlots = (): number[][] => {
  const slots = zeroSlots();
  for (let level = 1; level <= 20; level += 1) {
    const row = slots[level - 1];
    if (row === undefined) {
      continue;
    }
    for (let slot = 1; slot <= 9; slot += 1) {
      const value = slot <= Math.ceil((level + 1) / 2) ? 2 : 0;
      row[slot - 1] = value;
    }
  }
  return slots;
};

const weaponMasteries = (count: number): number[] => Array.from({ length: 20 }, () => count);

const fighter: SrdClass = {
  id: 'fighter',
  name: 'Fighter',
  hitDie: 10,
  primaryAbilities: ['str', 'dex'],
  savingThrows: ['str', 'con'],
  skillChoices: {
    count: 2,
    from: ['acrobatics', 'athletics', 'perception', 'survival'],
  },
  toolProficiencies: [],
  armorTraining: ['light', 'medium', 'heavy', 'shield'],
  weaponProficiencies: ['simple', 'martial'],
  weaponMasteryCount: weaponMasteries(3),
  startingGold: 155,
  startingEquipment: [{ option: 'A', description: 'Chain Mail, Greatsword', gold: 4 }],
  subclassLevel: 3,
  asiLevels: [4, 6, 8, 12, 14, 16],
  features: [
    { id: 'fighter-second-wind', name: 'Second Wind', level: 1, description: 'Recupera punti ferita.', recharge: 'short' },
  ],
  subclasses: [
    {
      id: 'champion',
      name: 'Champion',
      classId: 'fighter',
      features: [
        { id: 'champion-improved-critical', name: 'Improved Critical', level: 3, description: 'Critico al 19.', recharge: 'none' },
      ],
    },
  ],
};

const wizard: SrdClass = {
  id: 'wizard',
  name: 'Wizard',
  hitDie: 6,
  primaryAbilities: ['int'],
  savingThrows: ['int', 'wis'],
  skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation'] },
  toolProficiencies: [],
  armorTraining: [],
  weaponProficiencies: ['simple'],
  weaponMasteryCount: weaponMasteries(0),
  startingGold: 55,
  startingEquipment: [{ option: 'A', description: 'Spellbook', gold: 5 }],
  subclassLevel: 3,
  asiLevels: [4, 8, 12, 16],
  features: [
    { id: 'wizard-spellcasting', name: 'Spellcasting', level: 1, description: 'Lancia incantesimi.', recharge: 'none' },
  ],
  subclasses: [
    {
      id: 'evoker',
      name: 'Evoker',
      classId: 'wizard',
      features: [
        { id: 'evoker-sculpt-spells', name: 'Sculpt Spells', level: 3, description: 'Modella le aree.', recharge: 'none' },
      ],
    },
  ],
  spellcasting: {
    ability: 'int',
    progression: 'full',
    cantripsKnown: Array.from({ length: 20 }, () => 1),
    preparedSpells: Array.from({ length: 20 }, () => 2),
    slots: fillSlots(),
  },
};

export const testCatalog: SrdCatalog = {
  meta: {
    version: 'srd-5.2.0',
    name: 'System Reference Document 5.2',
    license: {
      key: 'CC-BY-4.0',
      name: 'Creative Commons Attribution 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    },
    source: {
      name: 'System Reference Document 5.2',
      url: 'https://dnd.wizards.com/resources/systems-reference-document',
      importedFrom: 'Open5e',
      importedAt: '2026-10-28T00:00:00.000Z',
    },
    counts: { classes: 2, species: 2, backgrounds: 1, feats: 3, spells: 5, items: 3, monsters: 0 },
  },
  classes: [fighter, wizard],
  species: [
    {
      id: 'human',
      name: 'Human',
      size: 'medium',
      sizes: ['small', 'medium'],
      speed: 30,
      languages: ['common'],
      languageChoices: 0,
      skillProficiencies: [],
      skillChoices: { count: 1, from: ['athletics', 'insight', 'perception'] },
      traits: [],
    },
    {
      id: 'goliath',
      name: 'Goliath',
      size: 'medium',
      sizes: ['medium'],
      speed: 35,
      languages: ['common'],
      languageChoices: 0,
      skillProficiencies: [],
      powerfulBuild: true,
      traits: [],
    },
  ],
  backgrounds: [
    {
      id: 'soldier',
      name: 'Soldier',
      abilityScoreOptions: ['str', 'dex', 'con'],
      abilityScorePatterns: ['2-1', '1-1-1'],
      featId: 'alert',
      skillProficiencies: ['athletics', 'intimidation'],
      toolProficiency: 'gameSet',
      startingGold: 50,
      startingEquipment: [{ option: 'A', description: 'Spear, 20 GP', gold: 20 }],
    },
  ],
  feats: [
    {
      id: 'alert',
      name: 'Alert',
      category: 'origin',
      repeatable: false,
      description: 'Iniziativa migliore.',
    },
    {
      id: 'ability-score-improvement',
      name: 'Ability Score Improvement',
      category: 'general',
      minLevel: 4,
      repeatable: true,
      abilityIncrease: { amount: 2, max: 20 },
      description: 'Aumenta una o due caratteristiche.',
    },
    {
      id: 'skilled',
      name: 'Skilled',
      category: 'origin',
      repeatable: true,
      description: 'Tre competenze.',
    },
  ],
  spells: [
    {
      id: 'fire-bolt',
      name: 'Fire Bolt',
      level: 0,
      school: 'Evocation',
      classes: ['wizard'],
      castingTime: 'action',
      range: '120 feet',
      components: { verbal: true, somatic: true, material: false },
      duration: 'instantaneous',
      concentration: false,
      ritual: false,
      description: '1d10 fire damage.',
    },
    {
      id: 'magic-missile',
      name: 'Magic Missile',
      level: 1,
      school: 'Evocation',
      classes: ['wizard'],
      castingTime: 'action',
      range: '120 feet',
      components: { verbal: true, somatic: true, material: false },
      duration: 'instantaneous',
      concentration: false,
      ritual: false,
      description: '1d4+1 force damage per dart.',
    },
    {
      id: 'shield',
      name: 'Shield',
      level: 1,
      school: 'Abjuration',
      classes: ['wizard'],
      castingTime: 'reaction',
      range: 'self',
      components: { verbal: true, somatic: true, material: false },
      duration: '1 round',
      concentration: false,
      ritual: false,
      description: '+5 AC.',
    },
    {
      id: 'misty-step',
      name: 'Misty Step',
      level: 2,
      school: 'Conjuration',
      classes: ['wizard'],
      castingTime: 'bonus action',
      range: 'self',
      components: { verbal: true, somatic: false, material: false },
      duration: 'instantaneous',
      concentration: false,
      ritual: false,
      description: 'Teleport 30 feet.',
    },
    {
      id: 'healing-word',
      name: 'Healing Word',
      level: 1,
      school: 'Abjuration',
      classes: ['cleric'],
      castingTime: 'bonus action',
      range: '60 feet',
      components: { verbal: true, somatic: false, material: false },
      duration: 'instantaneous',
      concentration: false,
      ritual: false,
      description: 'Heal 1d4.',
    },
  ],
  items: [
    {
      id: 'longsword',
      name: 'Longsword',
      type: 'Weapon',
      category: 'weapon',
      valueGp: 15,
      weightLb: 3,
      description: 'Martial melee weapon.',
      data: {
        category: 'weapon',
        damage: { dice: '1d8', type: 'slashing' },
        properties: ['Versatile'],
        mastery: 'Sap',
        versatile: '1d10',
        simple: false,
        martial: true,
      },
    },
    {
      id: 'chain-mail',
      name: 'Chain Mail',
      type: 'Armor',
      category: 'armor',
      valueGp: 75,
      weightLb: 55,
      description: 'Heavy armor.',
      data: {
        category: 'armor',
        armorCategory: 'heavy',
        baseAc: 16,
        dexCap: 0,
        strength: 13,
        stealthDisadvantage: true,
        shield: false,
      },
    },
    {
      id: 'shield',
      name: 'Shield',
      type: 'Armor',
      category: 'armor',
      valueGp: 10,
      weightLb: 6,
      description: 'Adds +2 AC.',
      data: {
        category: 'armor',
        armorCategory: 'shield',
        baseAc: 2,
        shield: true,
      },
    },
  ],
  monsters: [],
};

export const baseFighterBuild = (overrides: Partial<PcBuild> = {}): PcBuild => ({
  rulesVersion: testCatalog.meta.version,
  level: 1,
  classId: 'fighter',
  speciesId: 'human',
  backgroundId: 'soldier',
  abilityGeneration: {
    method: 'pointBuy',
    base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
  },
  backgroundIncreases: [
    { source: 'background', ability: 'str', amount: 2 },
    { source: 'background', ability: 'con', amount: 1 },
  ],
  feats: [],
  proficiencies: {
    classSkills: ['athletics', 'perception'],
    speciesSkills: ['insight'],
    expertise: [],
    tools: [],
    languages: [],
  },
  asiChoices: [],
  weaponMasteries: ['longsword', 'greatsword', 'shortsword'],
  equipment: [
    { itemId: 'longsword', quantity: 1 },
    { itemId: 'chain-mail', quantity: 1 },
    { itemId: 'shield', quantity: 1 },
  ],
  currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
  budgetGp: 155,
  spells: { cantrips: [], known: [], prepared: [], spellbook: [] },
  hpRolls: [],
  ...overrides,
});

export const baseWizardBuild = (overrides: Partial<PcBuild> = {}): PcBuild => ({
  ...baseFighterBuild(),
  classId: 'wizard',
  abilityGeneration: {
    method: 'pointBuy',
    base: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 8 },
  },
  proficiencies: {
    classSkills: ['arcana', 'history'],
    speciesSkills: ['insight'],
    expertise: [],
    tools: [],
    languages: [],
  },
  equipment: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
  budgetGp: 55,
  weaponMasteries: [],
  spells: {
    cantrips: ['fire-bolt'],
    known: [],
    prepared: ['magic-missile', 'shield'],
    spellbook: ['magic-missile', 'shield'],
  },
  ...overrides,
});

export const resolvedItem = (id: string): ResolvedItem => {
  const item = testCatalog.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`oggetto fixture inesistente: ${id}`);
  }
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    data: item.data,
    valueGp: item.valueGp,
    weightLb: item.weightLb,
  };
};

export const fighterStatblock = (overrides: Partial<PcStatblock> = {}): PcStatblock => ({
  kind: 'pc',
  size: 'medium',
  abilities: { str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 8 },
  hp: { current: 12, max: 12, temp: 0 },
  speed: { walk: 30 },
  senses: {},
  languages: ['common'],
  conditions: [],
  rulesVersion: testCatalog.meta.version,
  class: { id: 'fighter', level: 1 },
  species: { id: 'human' },
  background: { id: 'soldier' },
  abilityGeneration: {
    method: 'pointBuy',
    base: { str: 15, dex: 14, con: 14, int: 8, wis: 12, cha: 8 },
  },
  abilityIncreases: [
    { source: 'background', ability: 'str', amount: 2 },
    { source: 'background', ability: 'con', amount: 1 },
  ],
  proficiencies: {
    saves: ['str', 'con'],
    skills: ['athletics', 'perception', 'insight'],
    expertise: [],
    tools: [],
    armor: ['light', 'medium', 'heavy', 'shield'],
    weapons: ['simple', 'martial'],
  },
  feats: [],
  weaponMasteries: [],
  resources: [],
  spells: {
    cantrips: [],
    known: [],
    prepared: [],
    alwaysPrepared: [],
    spellbook: [],
    slots: [],
  },
  hitDice: { die: 10, total: 1, used: 0 },
  hpRolls: [],
  deathSaves: { successes: 0, failures: 0 },
  currency: { cp: 0, sp: 0, ep: 0, gp: 55, pp: 0 },
  overrides: {},
  snapshot: { features: [], spells: [], items: [] },
  ...overrides,
});

export const wizardStatblock = (overrides: Partial<PcStatblock> = {}): PcStatblock => ({
  ...fighterStatblock(),
  abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
  hp: { current: 8, max: 8, temp: 0 },
  class: { id: 'wizard', level: 1 },
  proficiencies: {
    saves: ['int', 'wis'],
    skills: ['arcana', 'history', 'insight'],
    expertise: [],
    tools: [],
    armor: [],
    weapons: ['simple'],
  },
  hitDice: { die: 6, total: 1, used: 0 },
  spells: {
    ability: 'int',
    cantrips: [{ id: 'fire-bolt', source: 'class' }],
    known: [],
    prepared: [
      { id: 'magic-missile', source: 'class' },
      { id: 'shield', source: 'class' },
    ],
    alwaysPrepared: [],
    spellbook: [
      { id: 'magic-missile', source: 'class' },
      { id: 'shield', source: 'class' },
    ],
    slots: [{ level: 1, max: 2, used: 0 }],
  },
  ...overrides,
});

export const classSkills = (values: Skill[]): Skill[] => values;
