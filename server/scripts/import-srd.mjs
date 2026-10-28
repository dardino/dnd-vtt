/* eslint-disable no-undef */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { srdCatalogSchema } from '@dnd-vtt/shared';

const VERSION = 'srd-5.2.0';
const DOCUMENT = 'srd-2024';
const API = 'https://api.open5e.com/v2/';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'srd', 'data', VERSION);

const SKILL_NAMES = {
  acrobatics: 'acrobatics',
  animalhandling: 'animalHandling',
  arcana: 'arcana',
  athletics: 'athletics',
  deception: 'deception',
  history: 'history',
  insight: 'insight',
  intimidation: 'intimidation',
  investigation: 'investigation',
  medicine: 'medicine',
  nature: 'nature',
  perception: 'perception',
  performance: 'performance',
  persuasion: 'persuasion',
  religion: 'religion',
  sleightofhand: 'sleightOfHand',
  stealth: 'stealth',
  survival: 'survival',
};

const ABILITY_NAMES = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

const CLASS_TRAITS = {
  barbarian: {
    primaryAbilities: ['str'],
    skillChoices: { count: 2, from: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    armorTraining: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
    toolProficiencies: [],
    startingGold: 75,
  },
  bard: {
    primaryAbilities: ['cha'],
    skillChoices: { count: 3, from: [] },
    armorTraining: ['light'],
    weaponProficiencies: ['simple'],
    toolProficiencies: [],
    toolChoices: { count: 3, kind: 'musicalInstrument' },
    startingGold: 90,
  },
  cleric: {
    primaryAbilities: ['wis'],
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    armorTraining: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple'],
    toolProficiencies: [],
    startingGold: 110,
  },
  druid: {
    primaryAbilities: ['wis'],
    skillChoices: {
      count: 2,
      from: ['animalHandling', 'arcana', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
    },
    armorTraining: ['light', 'shield'],
    weaponProficiencies: ['simple'],
    toolProficiencies: ['herbalismKit'],
    startingGold: 50,
  },
  fighter: {
    primaryAbilities: ['str', 'dex'],
    skillChoices: {
      count: 2,
      from: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'persuasion', 'survival'],
    },
    armorTraining: ['light', 'medium', 'heavy', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
    toolProficiencies: [],
    startingGold: 155,
  },
  monk: {
    primaryAbilities: ['dex', 'wis'],
    skillChoices: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    armorTraining: [],
    weaponProficiencies: ['simple'],
    toolProficiencies: [],
    toolChoices: { count: 1, kind: 'tool' },
    startingGold: 50,
  },
  paladin: {
    primaryAbilities: ['str', 'cha'],
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    armorTraining: ['light', 'medium', 'heavy', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
    toolProficiencies: [],
    startingGold: 150,
  },
  ranger: {
    primaryAbilities: ['dex', 'wis'],
    skillChoices: {
      count: 3,
      from: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
    },
    armorTraining: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
    toolProficiencies: [],
    startingGold: 150,
  },
  rogue: {
    primaryAbilities: ['dex'],
    skillChoices: {
      count: 4,
      from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleightOfHand', 'stealth'],
    },
    armorTraining: ['light'],
    weaponProficiencies: ['simple', 'martial'],
    toolProficiencies: ['thievesTools'],
    startingGold: 100,
  },
  sorcerer: {
    primaryAbilities: ['cha'],
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    armorTraining: [],
    weaponProficiencies: ['simple'],
    toolProficiencies: [],
    startingGold: 50,
  },
  warlock: {
    primaryAbilities: ['cha'],
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    armorTraining: ['light'],
    weaponProficiencies: ['simple'],
    toolProficiencies: [],
    startingGold: 100,
  },
  wizard: {
    primaryAbilities: ['int'],
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'] },
    armorTraining: [],
    weaponProficiencies: ['simple'],
    toolProficiencies: [],
    startingGold: 55,
  },
};

const SPELLCASTING_ABILITY = {
  bard: 'cha',
  cleric: 'wis',
  druid: 'wis',
  paladin: 'cha',
  ranger: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  wizard: 'int',
};

const ITEM_CATEGORY = {
  weapon: 'weapon',
  armor: 'armor',
  tools: 'tool',
  'equipment-pack': 'pack',
  'adventuring-gear': 'gear',
  ammunition: 'ammunition',
  mount: 'mount',
  'land-vehicle': 'vehicle',
  'waterborne-vehicle': 'vehicle',
  'spellcasting-focus': 'focus',
};

const MUNDANE_CATEGORIES = new Set(Object.keys(ITEM_CATEGORY));

const fetchJson = async (path) => {
  const response = await fetch(`${API}${path}`, {
    headers: { 'user-agent': 'dnd-vtt-srd-import/0.1', accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Open5e ${path} ha risposto ${response.status}`);
  }
  return response.json();
};

const fetchAll = async (path) => {
  const separator = path.includes('?') ? '&' : '?';
  let next = `${path}${separator}document__key=${DOCUMENT}&limit=100`;
  const results = [];
  while (next !== null) {
    const page = await fetchJson(next.startsWith('http') ? next.replace(API, '') : next);
    results.push(...page.results);
    next = page.next;
  }
  return results;
};

const stripKey = (key) => key.replace(/^srd-2024_/, '').replace(/^srd_/, '');

const slug = (value) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const skillKey = (name) => SKILL_NAMES[name.toLowerCase().replace(/[^a-z]/g, '')];

const parseSkills = (text) => text
  .split(/\s+and\s+|,\s*/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map(skillKey)
  .filter((skill) => skill !== undefined);

const rechargeOf = (description) => {
  if (/short rest/i.test(description)) {
    return 'short';
  }
  if (/long rest/i.test(description)) {
    return 'long';
  }
  return 'none';
};

const tableValues = (feature, transform = Number) => {
  const values = Array.from({ length: 20 }, () => 0);
  for (const row of feature.data_for_class_table) {
    if (row.level >= 1 && row.level <= 20) {
      values[row.level - 1] = transform(row.column_value);
    }
  }
  return values;
};

const spellSlotTable = (classData) => {
  const slots = Array.from({ length: 20 }, () => Array.from({ length: 9 }, () => 0));
  const slotFeatures = classData.features.filter((feature) => feature.feature_type === 'SPELL_SLOTS');
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  for (const feature of slotFeatures) {
    const index = ordinals.indexOf(feature.name);
    if (index < 0) {
      continue;
    }
    const values = tableValues(feature);
    values.forEach((value, levelIndex) => {
      const row = slots[levelIndex];
      if (row !== undefined) {
        row[index] = value;
      }
    });
  }
  return slots;
};

const tableByName = (classData, name) => classData.features.find(
  (feature) => feature.feature_type === 'CLASS_TABLE_DATA' && feature.name === name,
);

const goldOf = (text) => {
  const gold = /(\d+)\s*GP/i.exec(text);
  return gold === null ? 0 : Number(gold[1]);
};

const parseStartingEquipment = (description) => {
  const row = /\|Starting Equipment\|([^\n]*)/i.exec(description)?.[1] ?? description;
  const options = [...row.matchAll(/\(([A-Z])\)\s*(.*?)(?=;\s*(?:or\s*)?\([A-Z]\)|$)/gi)]
    .map((match) => ({
      option: match[1] ?? 'A',
      description: (match[2] ?? '').trim().replace(/[.;|]+$/, ''),
      gold: goldOf(match[2] ?? ''),
    }))
    .filter((option) => option.description.length > 0);
  return options.length > 0
    ? options
    : [{ option: 'A', description: row.trim(), gold: goldOf(row) }];
};

const uniqueById = (rows) => {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, row);
    }
  }
  return [...map.values()];
};

const classFeature = (feature, level, classId) => ({
  id: `${classId}:${stripKey(feature.key)}:${level}`,
  name: feature.name,
  level,
  description: feature.desc ?? '',
  recharge: rechargeOf(feature.desc ?? ''),
});

const mapClass = (classData, subclasses) => {
  const id = stripKey(classData.key);
  const traits = CLASS_TRAITS[id];
  if (traits === undefined) {
    throw new Error(`classe senza tratti curati: ${id}`);
  }
  const hitDie = Number(/D(\d+)/i.exec(classData.hit_dice ?? 'D8')?.[1] ?? 8);
  const asiFeature = classData.features.find((feature) => feature.name === 'Ability Score Improvement');
  const subclassFeature = classData.features.find((feature) => feature.name.includes('Subclass'));
  const subclassLevel = subclassFeature?.gained_at?.[0]?.level ?? 3;
  const masteryTable = tableByName(classData, 'Weapon Mastery');
  const cantripsTable = tableByName(classData, 'Cantrips');
  const preparedTable = tableByName(classData, 'Prepared Spells');
  const slotLevelTable = tableByName(classData, 'Slot Level');
  const pactSlotsTable = tableByName(classData, 'Spell Slots');

  const features = classData.features
    .filter((feature) => feature.feature_type === 'CLASS_LEVEL_FEATURE')
    .filter((feature) => !/Spell List$/i.test(feature.name) && !/Core .* Traits/i.test(feature.name))
    .flatMap((feature) => feature.gained_at
      .filter((gained) => gained.level >= 1 && gained.level <= 20)
      .map((gained) => classFeature(feature, gained.level, id)))
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));

  const subclassCatalog = subclasses
    .filter((subclass) => subclass.subclass_of?.key === classData.key)
    .map((subclass) => {
      const subclassId = stripKey(subclass.key);
      return {
        id: subclassId,
        name: subclass.name,
        classId: id,
        features: subclass.features
          .filter((feature) => feature.feature_type === 'CLASS_LEVEL_FEATURE')
          .flatMap((feature) => feature.gained_at
            .filter((gained) => gained.level >= 1 && gained.level <= 20)
            .map((gained) => classFeature(feature, gained.level, subclassId)))
          .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name)),
      };
    });

  const spellcasting = classData.caster_type === 'NONE'
    ? undefined
    : {
      ability: SPELLCASTING_ABILITY[id],
      progression: classData.caster_type.toLowerCase(),
      cantripsKnown: cantripsTable === undefined ? Array.from({ length: 20 }, () => 0) : tableValues(cantripsTable),
      preparedSpells: preparedTable === undefined ? Array.from({ length: 20 }, () => 0) : tableValues(preparedTable),
      slots: classData.caster_type === 'PACT' ? Array.from({ length: 20 }, () => Array.from({ length: 9 }, () => 0)) : spellSlotTable(classData),
      ...(classData.caster_type === 'PACT'
        ? {
          pactSlots: Array.from({ length: 20 }, (_, levelIndex) => {
            const slotLevels = slotLevelTable === undefined
              ? []
              : tableValues(slotLevelTable, (value) => Number.parseInt(value, 10));
            const slotCounts = pactSlotsTable === undefined ? [] : tableValues(pactSlotsTable);
            return {
              level: slotLevels[levelIndex] ?? 0,
              count: slotCounts[levelIndex] ?? 0,
            };
          }),
        }
        : {}),
    };

  if (spellcasting !== undefined && spellcasting.ability === undefined) {
    throw new Error(`classe incantatrice senza abilità: ${id}`);
  }

  return {
    id,
    name: classData.name,
    hitDie,
    primaryAbilities: traits.primaryAbilities,
    savingThrows: (classData.saving_throws ?? []).map((save) => ABILITY_NAMES[save.name.toLowerCase()]),
    skillChoices: traits.skillChoices,
    toolProficiencies: traits.toolProficiencies,
    ...(traits.toolChoices === undefined ? {} : { toolChoices: traits.toolChoices }),
    armorTraining: traits.armorTraining,
    weaponProficiencies: traits.weaponProficiencies,
    weaponMasteryCount: masteryTable === undefined ? Array.from({ length: 20 }, () => 0) : tableValues(masteryTable),
    startingGold: traits.startingGold,
    startingEquipment: parseStartingEquipment(
      classData.features.find((feature) => feature.feature_type === 'CORE_TRAITS_TABLE')?.desc ?? '',
    ),
    subclassLevel,
    asiLevels: [...new Set((asiFeature?.gained_at ?? []).map((gained) => gained.level))].sort((a, b) => a - b),
    features,
    subclasses: subclassCatalog,
    ...(spellcasting === undefined ? {} : { spellcasting }),
  };
};

const parseSize = (description) => {
  const sizes = [];
  if (/medium/i.test(description)) {
    sizes.push('medium');
  }
  if (/small/i.test(description)) {
    sizes.push('small');
  }
  if (/large/i.test(description)) {
    sizes.push('large');
  }
  return sizes.length > 0 ? sizes : ['medium'];
};

const mapSpecies = (species) => {
  const id = stripKey(species.key);
  const sizeTrait = species.traits.find((trait) => trait.type === 'SIZE');
  const speedTrait = species.traits.find((trait) => trait.type === 'SPEED');
  const sizes = parseSize(sizeTrait?.desc ?? 'Medium');
  const speed = Number(/(\d+)\s*feet/i.exec(speedTrait?.desc ?? '30 feet')?.[1] ?? 30);
  const darkvisionMatch = species.traits
    .map((trait) => /Darkvision with a range of (\d+) feet/i.exec(trait.desc ?? ''))
    .find((match) => match !== null);
  const skillChoices = id === 'human'
    ? { count: 1, from: [] }
    : id === 'elf'
      ? { count: 1, from: ['insight', 'perception', 'survival'] }
      : undefined;

  return {
    id,
    name: species.name,
    size: sizes[0],
    sizes,
    speed,
    ...(darkvisionMatch === null || darkvisionMatch === undefined
      ? {}
      : { darkvision: Number(darkvisionMatch[1]) }),
    ...(id === 'dwarf' ? { hpPerLevelBonus: 1 } : {}),
    ...(id === 'goliath' ? { powerfulBuild: true } : {}),
    languages: ['common'],
    languageChoices: 2,
    skillProficiencies: [],
    ...(skillChoices === undefined ? {} : { skillChoices }),
    traits: species.traits.map((trait) => ({
      name: trait.name,
      description: trait.desc ?? '',
      recharge: 'none',
    })),
  };
};

const mapBackground = (background) => {
  const benefit = (type) => background.benefits.find((entry) => entry.type === type);
  const abilities = (benefit('ability_score')?.desc ?? '')
    .split(/,\s*/)
    .map((name) => ABILITY_NAMES[name.trim().toLowerCase()])
    .filter((ability) => ability !== undefined);
  const featText = benefit('feat')?.desc ?? '';
  const featAnchor = benefit('feat')?.crossreferences?.to?.[0]?.anchor;
  const equipment = benefit('equipment')?.desc ?? '';
  const optionB = /\(B\)\s*([\d]+)\s*GP/i.exec(equipment);

  return {
    id: stripKey(background.key),
    name: background.name,
    abilityScoreOptions: abilities,
    abilityScorePatterns: ['2-1', '1-1-1'],
    featId: slug(featAnchor ?? featText.split('(')[0]?.trim() ?? ''),
    skillProficiencies: parseSkills(benefit('skill_proficiency')?.desc ?? ''),
    ...(benefit('tool_proficiency') === undefined
      ? {}
      : { toolProficiency: slug(benefit('tool_proficiency').desc) }),
    startingGold: optionB === null ? 0 : Number(optionB[1]),
    startingEquipment: parseStartingEquipment(equipment.replace(/^\*Choose A or B:\*\s*/i, '')),
  };
};

const mapFeat = (feat) => {
  const description = feat.benefits?.map((benefit) => benefit.desc).join('\n\n') ?? feat.desc ?? '';
  const category = feat.type === 'Origin'
    ? 'origin'
    : feat.type === 'Fighting Style'
      ? 'fightingStyle'
      : feat.type === 'Epic Boon'
        ? 'epicBoon'
        : 'general';
  const minLevelMatch = /Level (\d+)\+/.exec(feat.prerequisite ?? '');
  const increaseMatch = /increase [^.]*? by (\d+)/is.exec(description);
  const maxMatch = /(?:maximum of|above) (\d+)/is.exec(description);

  return {
    id: stripKey(feat.key),
    name: feat.name,
    category,
    ...(feat.prerequisite ? { prerequisite: feat.prerequisite } : {}),
    ...(minLevelMatch === null ? {} : { minLevel: Number(minLevelMatch[1]) }),
    repeatable: /more than once/i.test(description) || feat.name === 'Ability Score Improvement',
    ...(increaseMatch === null || maxMatch === null
      ? {}
      : { abilityIncrease: { amount: Number(increaseMatch[1]), max: Number(maxMatch[1]) } }),
    description,
  };
};

const mapSpell = (spell) => ({
  id: stripKey(spell.key),
  name: spell.name,
  level: spell.level,
  school: spell.school?.name ?? 'Unknown',
  classes: (spell.classes ?? []).map((entry) => stripKey(entry.key)),
  castingTime: spell.casting_time ?? 'action',
  range: spell.range_text ?? 'self',
  components: {
    verbal: Boolean(spell.verbal),
    somatic: Boolean(spell.somatic),
    material: Boolean(spell.material),
    ...(spell.material_specified ? { materialText: spell.material_specified } : {}),
  },
  duration: spell.duration ?? 'instantaneous',
  concentration: Boolean(spell.concentration),
  ritual: Boolean(spell.ritual),
  description: spell.desc ?? '',
  ...(spell.higher_level ? { higherLevel: spell.higher_level } : {}),
});

const mapWeaponData = (weapon) => {
  const properties = (weapon.properties ?? []).map((entry) => entry.property?.name).filter(Boolean);
  const mastery = (weapon.properties ?? [])
    .find((entry) => entry.property?.type === 'Mastery')?.property?.name;
  const versatile = (weapon.properties ?? [])
    .find((entry) => entry.property?.name === 'Versatile')?.detail;
  const range = weapon.range > 0
    ? { normal: weapon.range, ...(weapon.long_range > 0 ? { long: weapon.long_range } : {}) }
    : undefined;
  return {
    category: 'weapon',
    damage: {
      dice: weapon.damage_dice || '1',
      type: (weapon.damage_type?.name ?? 'bludgeoning').toLowerCase(),
    },
    properties,
    ...(mastery === undefined ? {} : { mastery }),
    ...(range === undefined ? {} : { range }),
    ...(versatile === undefined ? {} : { versatile }),
    simple: Boolean(weapon.is_simple),
    martial: Boolean(weapon.is_martial),
  };
};

const mapArmorData = (armor, name) => {
  const shield = name === 'Shield';
  return {
    category: 'armor',
    armorCategory: shield ? 'shield' : armor.category,
    baseAc: armor.ac_base,
    ...(armor.ac_cap_dexmod === null || armor.ac_cap_dexmod === undefined ? {} : { dexCap: armor.ac_cap_dexmod }),
    ...(armor.strength_score_required === null || armor.strength_score_required === undefined
      ? {}
      : { strength: armor.strength_score_required }),
    ...(armor.grants_stealth_disadvantage ? { stealthDisadvantage: true } : {}),
    shield,
  };
};

const mapItem = (item) => {
  const rawCategory = item.category?.key;
  let category = ITEM_CATEGORY[rawCategory];
  let data;
  if (item.weapon !== null && item.weapon !== undefined) {
    data = mapWeaponData(item.weapon);
    category = 'weapon';
  } else if (item.armor !== null && item.armor !== undefined) {
    data = mapArmorData(item.armor, item.name);
    category = 'armor';
  } else if (rawCategory === 'weapon' || rawCategory === 'armor') {
    data = { category: 'gear' };
    category = 'gear';
  } else {
    data = { category: category ?? 'gear' };
  }
  if (category === undefined) {
    category = 'gear';
  }
  return {
    id: stripKey(item.key),
    name: item.name,
    type: item.category?.name ?? 'Gear',
    category,
    valueGp: Number(item.cost ?? 0),
    weightLb: Number(item.weight ?? 0),
    description: item.desc ?? '',
    data,
  };
};

const attackOf = (attacks) => {
  const attack = attacks?.[0];
  if (attack === undefined) {
    return undefined;
  }
  const bonus = attack.damage_bonus ?? 0;
  const damage = `${attack.damage_die_count ?? 0}d${String(attack.damage_die_type ?? 'D6').replace(/D/i, '')}${bonus === 0 ? '' : bonus > 0 ? `+${bonus}` : String(bonus)}`;
  return {
    toHit: attack.to_hit_mod ?? 0,
    ...(attack.reach ? { reach: attack.reach } : {}),
    ...(attack.range ? { range: `${attack.range}${attack.long_range ? `/${attack.long_range}` : ''} ft.` } : {}),
    damage,
  };
};

const mapAction = (action) => ({
  name: action.name,
  description: action.desc ?? '',
  ...(action.attacks?.length > 0 ? { attack: attackOf(action.attacks) } : {}),
  recharge: rechargeOf(action.desc ?? ''),
});

const namesOf = (values) => (values ?? []).map((value) => (typeof value === 'string' ? value : value.name));

const mapMonster = (monster) => {
  const senses = {};
  const ranges = {
    darkvision: monster.darkvision_range,
    blindsight: monster.blindsight_range,
    tremorsense: monster.tremorsense_range,
    truesight: monster.truesight_range,
  };
  for (const [key, value] of Object.entries(ranges)) {
    if (value !== null && value !== undefined && value > 0) {
      senses[key] = value;
    }
  }
  const abilities = Object.fromEntries(
    Object.entries(monster.ability_scores ?? {}).map(([key, value]) => [
      ABILITY_NAMES[key],
      Math.max(1, Number(value) || 0),
    ]),
  );
  const savingThrows = {};
  for (const [key, value] of Object.entries(monster.saving_throws ?? {})) {
    const ability = ABILITY_NAMES[key];
    const score = monster.ability_scores?.[key] ?? 10;
    const modifier = Math.floor((score - 10) / 2);
    if (ability !== undefined && value !== modifier) {
      savingThrows[ability] = value;
    }
  }
  const skills = Object.fromEntries(
    Object.entries(monster.skill_bonuses ?? {})
      .map(([key, value]) => [SKILL_NAMES[key.replace(/[^a-z]/g, '')], value])
      .filter(([key]) => key !== undefined),
  );
  const actions = (monster.actions ?? []).filter((action) => action.action_type === 'ACTION');
  const legendary = (monster.actions ?? []).filter((action) => action.action_type === 'LEGENDARY_ACTION');
  const reactions = (monster.actions ?? []).filter((action) => action.action_type === 'REACTION');
  const resistances = monster.resistances_and_immunities ?? {};

  return {
    id: stripKey(monster.key),
    name: monster.name,
    creatureType: monster.type?.name ?? 'Unknown',
    size: monster.size?.key ?? 'medium',
    cr: String(monster.challenge_rating ?? '0'),
    ac: monster.armor_class ?? 10,
    hp: { max: monster.hit_points ?? 1, formula: monster.hit_dice ?? '' },
    speed: {
      walk: monster.speed?.walk ?? 0,
      ...(monster.speed?.fly ? { fly: monster.speed.fly } : {}),
      ...(monster.speed?.swim ? { swim: monster.speed.swim } : {}),
      ...(monster.speed?.climb ? { climb: monster.speed.climb } : {}),
      ...(monster.speed?.burrow ? { burrow: monster.speed.burrow } : {}),
      ...(monster.speed?.hover ? { hover: true } : {}),
    },
    senses,
    languages: (monster.languages?.as_string ?? '')
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    abilities,
    ...(Object.keys(savingThrows).length === 0 ? {} : { savingThrows }),
    ...(Object.keys(skills).length === 0 ? {} : { skills }),
    damageResistances: namesOf(resistances.damage_resistances),
    damageImmunities: namesOf(resistances.damage_immunities),
    damageVulnerabilities: namesOf(resistances.damage_vulnerabilities),
    conditionImmunities: namesOf(resistances.condition_immunities),
    traits: (monster.traits ?? []).map(mapAction),
    actions: actions.map(mapAction),
    reactions: reactions.map(mapAction),
    ...(legendary.length === 0
      ? {}
      : { legendary: { max: 3, actions: legendary.map(mapAction) } }),
  };
};

const main = async () => {
  const [classRows, speciesRows, backgroundRows, featRows, spellRows, itemRows, monsterRows]
    = await Promise.all([
      fetchAll('classes/'),
      fetchAll('species/'),
      fetchAll('backgrounds/'),
      fetchAll('feats/'),
      fetchAll('spells/'),
      fetchAll('items/'),
      fetchAll('creatures/'),
    ]);

  const currentClasses = classRows.filter((row) => row.key.startsWith(`${DOCUMENT}_`));
  const baseClasses = currentClasses.filter((row) => row.subclass_of === null || row.subclass_of === undefined);
  const subclassRows = currentClasses.filter((row) => row.subclass_of !== null && row.subclass_of !== undefined);
  const onlyCurrent = (row) => row.key.startsWith(`${DOCUMENT}_`);
  const classes = uniqueById(baseClasses.map((row) => mapClass(row, subclassRows)));
  const species = uniqueById(speciesRows.filter(onlyCurrent).map(mapSpecies));
  const backgrounds = uniqueById(backgroundRows.filter(onlyCurrent).map(mapBackground));
  const feats = uniqueById(featRows.filter(onlyCurrent).map(mapFeat));
  const spells = uniqueById(spellRows.filter(onlyCurrent).map(mapSpell));
  const items = uniqueById(itemRows
    .filter(onlyCurrent)
    .filter((item) => MUNDANE_CATEGORIES.has(item.category?.key))
    .map(mapItem));
  const monsters = uniqueById(monsterRows.filter(onlyCurrent).map(mapMonster));

  const catalog = {
    meta: {
      version: VERSION,
      name: 'System Reference Document 5.2',
      license: {
        key: 'CC-BY-4.0',
        name: 'Creative Commons Attribution 4.0 International',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
      source: {
        name: 'System Reference Document 5.2',
        url: 'https://dnd.wizards.com/resources/systems-reference-document',
        importedFrom: 'Open5e',
        importedAt: new Date().toISOString(),
      },
      counts: {
        classes: classes.length,
        species: species.length,
        backgrounds: backgrounds.length,
        feats: feats.length,
        spells: spells.length,
        items: items.length,
        monsters: monsters.length,
      },
    },
    classes,
    species,
    backgrounds,
    feats,
    spells,
    items,
    monsters,
  };

  const parsed = srdCatalogSchema.safeParse(catalog);
  if (!parsed.success) {
    console.error(JSON.stringify(parsed.error.issues.slice(0, 20), null, 2));
    throw new Error(`catalogo non valido: ${parsed.error.issues.length} problemi`);
  }

  await mkdir(OUT, { recursive: true });
  const collections = ['classes', 'species', 'backgrounds', 'feats', 'spells', 'items', 'monsters'];
  for (const collection of collections) {
    await writeFile(join(OUT, `${collection}.json`), `${JSON.stringify(catalog[collection], null, 2)}\n`, 'utf8');
  }
  await writeFile(join(OUT, 'meta.json'), `${JSON.stringify(catalog.meta, null, 2)}\n`, 'utf8');

  console.warn(
    `SRD ${VERSION}: ${classes.length} classi, ${species.length} specie, ${backgrounds.length} background, `
    + `${feats.length} talenti, ${spells.length} incantesimi, ${items.length} oggetti, ${monsters.length} mostri`,
  );
};

await main();
