import type { PcBuild } from '../../schemas/build.js';
import type {
  PcStatblock,
  ResolvedFeature,
  ResolvedItem,
  ResolvedSpell,
  SpellChoice,
} from '../../schemas/sheet.js';
import type { SrdCatalog, SrdClass, SrdFeat, SrdSpell } from '../../schemas/srd.js';
import { pcAbilityScores, pcHpMax } from './hp.js';

export interface BuildPcStatblockInput {
  build: PcBuild;
  catalog: SrdCatalog;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const requireClass = (catalog: SrdCatalog, classId: string): SrdClass => {
  const characterClass = catalog.classes.find((entry) => entry.id === classId);
  if (characterClass === undefined) {
    throw new Error(`classe inesistente: ${classId}`);
  }
  return characterClass;
};

const feature = (
  id: string,
  name: string,
  level: number,
  description: string,
  recharge: ResolvedFeature['recharge'],
  source: ResolvedFeature['source'],
): ResolvedFeature => ({ id, name, level, description, recharge, source });

const featureId = (prefix: string, name: string): string =>
  `${prefix}-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')}`;

const resolvedItems = (build: PcBuild, catalog: SrdCatalog): ResolvedItem[] =>
  build.equipment.flatMap((entry) => {
    const item = catalog.items.find((candidate) => candidate.id === entry.itemId);
    return item === undefined
      ? []
      : [{
        id: item.id,
        name: item.name,
        type: item.type,
        data: item.data,
        valueGp: item.valueGp,
        weightLb: item.weightLb,
      }];
  });

const spellComponents = (components: SrdSpell['components']): string => {
  const parts = [
    components.verbal ? 'V' : undefined,
    components.somatic ? 'S' : undefined,
    components.material ? 'M' : undefined,
  ].filter((part): part is string => part !== undefined);
  return `${parts.join(', ')}${components.materialText === undefined ? '' : ` (${components.materialText})`}`;
};

const resolvedSpells = (
  build: PcBuild,
  catalog: SrdCatalog,
): ResolvedSpell[] => {
  const ids = unique([
    ...build.spells.cantrips,
    ...build.spells.known,
    ...build.spells.prepared,
    ...build.spells.spellbook,
  ]);
  return ids.flatMap((id) => {
    const spell: SrdSpell | undefined = catalog.spells.find((candidate) => candidate.id === id);
    return spell === undefined
      ? []
      : [{
        id: spell.id,
        name: spell.name,
        level: spell.level,
        school: spell.school,
        castingTime: spell.castingTime,
        range: spell.range,
        components: spellComponents(spell.components),
        duration: spell.duration,
        concentration: spell.concentration,
        ritual: spell.ritual,
        description: spell.description,
      }];
  });
};

const spellChoices = (ids: readonly string[], source: SpellChoice['source'], prepared?: boolean): SpellChoice[] =>
  unique(ids).map((id) => (prepared === undefined ? { id, source } : { id, source, prepared }));

const buildFeatures = (
  build: PcBuild,
  catalog: SrdCatalog,
  characterClass: SrdClass,
): ResolvedFeature[] => {
  const result: ResolvedFeature[] = [];
  for (const entry of characterClass.features) {
    if (entry.level <= build.level) {
      result.push(feature(entry.id, entry.name, entry.level, entry.description, entry.recharge, 'class'));
    }
  }
  if (build.subclassId !== undefined) {
    const subclass = characterClass.subclasses.find((entry) => entry.id === build.subclassId);
    for (const entry of subclass?.features ?? []) {
      if (entry.level <= build.level) {
        result.push(feature(entry.id, entry.name, entry.level, entry.description, entry.recharge, 'subclass'));
      }
    }
  }
  const species = catalog.species.find((entry) => entry.id === build.speciesId);
  for (const trait of species?.traits ?? []) {
    result.push(feature(
      featureId(species?.id ?? 'species', trait.name),
      trait.name,
      1,
      trait.description,
      trait.recharge,
      'species',
    ));
  }
  const background = catalog.backgrounds.find((entry) => entry.id === build.backgroundId);
  const featIds = unique([
    ...build.feats.map((entry) => entry.id),
    ...(build.originFeatId === undefined ? [] : [build.originFeatId]),
    ...build.asiChoices.flatMap((choice) => (choice.featId === undefined ? [] : [choice.featId])),
    ...(background === undefined ? [] : [background.featId]),
  ]);
  for (const featId of featIds) {
    const feat: SrdFeat | undefined = catalog.feats.find((entry) => entry.id === featId);
    if (feat !== undefined) {
      result.push(feature(feat.id, feat.name, 1, feat.description, 'none', 'feat'));
    }
  }
  return result;
};

const spellSlots = (
  characterClass: SrdClass,
  level: number,
): PcStatblock['spells']['slots'] => {
  const row = characterClass.spellcasting?.slots[level - 1] ?? [];
  return row.flatMap((max, index) =>
    max > 0 ? [{ level: index + 1, max, used: 0 }] : []);
};

const pactSlots = (
  characterClass: SrdClass,
  level: number,
): PcStatblock['spells']['pactSlots'] => {
  const pact = characterClass.spellcasting?.pactSlots?.[level - 1];
  return pact === undefined || pact.count === 0
    ? undefined
    : { level: pact.level, max: pact.count, used: 0 };
};

/**
 * Trasforma una build valida nell'attore persistito: calcola HP e slot,
 * congela snapshot di privilegi, incantesimi e oggetti, e riporta tutte le
 * scelte meccaniche nel formato `PcStatblock` (D56/D57).
 */
export const buildPcStatblock = ({ build, catalog }: BuildPcStatblockInput): PcStatblock => {
  const characterClass = requireClass(catalog, build.classId);
  const species = catalog.species.find((entry) => entry.id === build.speciesId);
  const background = catalog.backgrounds.find((entry) => entry.id === build.backgroundId);
  if (species === undefined || background === undefined) {
    throw new Error('specie o background inesistenti');
  }
  const abilities = pcAbilityScores(build);
  const hpMax = pcHpMax(build, catalog);
  const abilityIncreases = [
    ...build.backgroundIncreases,
    ...build.asiChoices.flatMap((choice) => choice.increases ?? []),
  ];
  const featIds = unique([
    ...build.feats.map((entry) => entry.id),
    ...(build.originFeatId === undefined ? [] : [build.originFeatId]),
    ...build.asiChoices.flatMap((choice) => (choice.featId === undefined ? [] : [choice.featId])),
  ]);
  return {
    kind: 'pc',
    size: species.size,
    abilities,
    hp: { current: hpMax, max: hpMax, temp: 0 },
    speed: { walk: species.speed },
    senses: species.darkvision === undefined ? {} : { darkvision: species.darkvision },
    languages: unique(['common', ...species.languages, ...build.proficiencies.languages]),
    conditions: [],
    rulesVersion: build.rulesVersion,
    class: {
      id: build.classId,
      level: build.level,
      ...(build.subclassId === undefined ? {} : { subclassId: build.subclassId }),
    },
    species: { id: build.speciesId },
    background: { id: build.backgroundId },
    abilityGeneration: build.abilityGeneration,
    abilityIncreases,
    proficiencies: {
      saves: [...characterClass.savingThrows],
      skills: unique([
        ...build.proficiencies.classSkills,
        ...build.proficiencies.speciesSkills,
        ...background.skillProficiencies,
      ]),
      expertise: [...build.proficiencies.expertise],
      tools: unique([
        ...build.proficiencies.tools,
        ...characterClass.toolProficiencies,
        ...(background.toolProficiency === undefined ? [] : [background.toolProficiency]),
      ]),
      armor: [...characterClass.armorTraining],
      weapons: [...characterClass.weaponProficiencies],
    },
    feats: featIds.map((id) => ({ id })),
    weaponMasteries: [...build.weaponMasteries],
    resources: [],
    spells: {
      ...(characterClass.spellcasting === undefined
        ? {}
        : { ability: characterClass.spellcasting.ability }),
      cantrips: spellChoices(build.spells.cantrips, 'class'),
      known: spellChoices(build.spells.known, 'class'),
      prepared: spellChoices(build.spells.prepared, 'class', true),
      alwaysPrepared: [],
      spellbook: spellChoices(build.spells.spellbook, 'class'),
      slots: spellSlots(characterClass, build.level),
      ...(pactSlots(characterClass, build.level) === undefined
        ? {}
        : { pactSlots: pactSlots(characterClass, build.level) }),
    },
    hitDice: { die: characterClass.hitDie, total: build.level, used: 0 },
    hpRolls: [...build.hpRolls],
    deathSaves: { successes: 0, failures: 0 },
    currency: build.currency,
    overrides: build.overrides ?? {},
    snapshot: {
      features: buildFeatures(build, catalog, characterClass),
      spells: resolvedSpells(build, catalog),
      items: resolvedItems(build, catalog),
    },
  };
};
