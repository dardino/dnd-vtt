import type {
  AbilityIncrease,
  PcStatblock,
  ResolvedFeature,
  SpellSlotPool,
} from '../../schemas/sheet.js';
import type { SrdCatalog, SrdClass, SrdFeat } from '../../schemas/srd.js';
import { abilityModifier } from './abilities.js';
import { hpMaxFor } from './hp.js';
import { averageHpGain } from './progression.js';

export interface PcLevelUpInput {
  hpMethod: 'average' | 'roll';
  hpRoll?: number | undefined;
  subclassId?: string | undefined;
  abilityIncreases?: AbilityIncrease[] | undefined;
  featId?: string | undefined;
}

export interface PcLevelUpPreview {
  level: number;
  hpMax: number;
  hpGain: number;
  features: ResolvedFeature[];
  slots: SpellSlotPool[];
  pactSlots?: { level: number; max: number };
  abilityIncreases: AbilityIncrease[];
}

export interface PcLevelUpResult {
  statblock: PcStatblock;
  preview: PcLevelUpPreview;
}

const feature = (
  id: string,
  name: string,
  level: number,
  description: string,
  recharge: ResolvedFeature['recharge'],
  source: ResolvedFeature['source'],
): ResolvedFeature => ({ id, name, level, description, recharge, source });

const characterClassOf = (catalog: SrdCatalog, statblock: PcStatblock): SrdClass => {
  const characterClass = catalog.classes.find((entry) => entry.id === statblock.class.id);
  if (characterClass === undefined) {
    throw new Error(`classe inesistente: ${statblock.class.id}`);
  }
  return characterClass;
};

const speciesBonus = (catalog: SrdCatalog, statblock: PcStatblock): number =>
  catalog.species.find((entry) => entry.id === statblock.species.id)?.hpPerLevelBonus ?? 0;

const classFeatures = (
  characterClass: SrdClass,
  subclassId: string | undefined,
  level: number,
): ResolvedFeature[] => {
  const features = characterClass.features
    .filter((entry) => entry.level <= level)
    .map((entry) => feature(entry.id, entry.name, entry.level, entry.description, entry.recharge, 'class'));
  const subclass = characterClass.subclasses.find((entry) => entry.id === subclassId);
  const subclassFeatures = (subclass?.features ?? [])
    .filter((entry) => entry.level <= level)
    .map((entry) => feature(entry.id, entry.name, entry.level, entry.description, entry.recharge, 'subclass'));
  return [...features, ...subclassFeatures];
};

const mergeFeatures = (
  current: readonly ResolvedFeature[],
  newClassFeatures: readonly ResolvedFeature[],
): ResolvedFeature[] => {
  const base = current.filter((entry) => entry.source !== 'class' && entry.source !== 'subclass');
  return [...base, ...newClassFeatures];
};

const newSpellSlots = (
  characterClass: SrdClass,
  current: readonly SpellSlotPool[],
  level: number,
): SpellSlotPool[] => {
  const row = characterClass.spellcasting?.slots[level - 1] ?? [];
  return row.flatMap((max, index) => {
    if (max <= 0) {
      return [];
    }
    const previous = current.find((slot) => slot.level === index + 1);
    return [{ level: index + 1, max, used: Math.min(previous?.used ?? 0, max) }];
  });
};

const newPactSlots = (
  characterClass: SrdClass,
  current: PcStatblock['spells']['pactSlots'],
  level: number,
): PcStatblock['spells']['pactSlots'] => {
  const pact = characterClass.spellcasting?.pactSlots?.[level - 1];
  if (pact === undefined || pact.count === 0) {
    return undefined;
  }
  return { level: pact.level, max: pact.count, used: Math.min(current?.used ?? 0, pact.count) };
};

const validateAbilityIncreases = (
  statblock: PcStatblock,
  increases: readonly AbilityIncrease[],
): void => {
  const total = increases.reduce((sum, increase) => sum + increase.amount, 0);
  if (total !== 2) {
    throw new Error('un aumento di caratteristica deve distribuire 2 punti');
  }
  for (const increase of increases) {
    if (increase.source !== 'asi') {
      throw new Error('gli aumenti di livello devono avere fonte asi');
    }
    if (statblock.abilities[increase.ability] + increase.amount > 20) {
      throw new Error(`il punteggio di ${increase.ability} supera 20`);
    }
  }
};

/**
 * Calcola lo statblock del livello successivo senza mutare l'originale.
 * Le scelte di classe restano esplicite; il server riusa questa funzione
 * per anteprima e applicazione, così la preview non può divergere (D57/D58).
 */
export const levelUpPcStatblock = (
  statblock: PcStatblock,
  catalog: SrdCatalog,
  input: PcLevelUpInput,
): PcLevelUpResult => {
  if (statblock.kind !== 'pc') {
    throw new Error('solo i personaggi salgono di livello');
  }
  if (statblock.class.level >= 20) {
    throw new Error('il personaggio è già al livello 20');
  }
  const characterClass = characterClassOf(catalog, statblock);
  const level = statblock.class.level + 1;
  const subclassId = input.subclassId ?? statblock.class.subclassId;
  if (characterClass.subclassLevel <= level && subclassId === undefined) {
    throw new Error('serve una sottoclasse per questo livello');
  }
  if (input.subclassId !== undefined
    && !characterClass.subclasses.some((entry) => entry.id === input.subclassId)) {
    throw new Error('sottoclasse non valida per la classe');
  }

  const isAsiLevel = characterClass.asiLevels.includes(level);
  const increases = input.abilityIncreases ?? [];
  if (isAsiLevel) {
    if (input.featId === undefined && increases.length === 0) {
      throw new Error('scegli un aumento di caratteristica o un talento');
    }
    if (input.featId !== undefined && increases.length > 0) {
      throw new Error('aumento di caratteristica e talento sono alternativi');
    }
    if (increases.length > 0) {
      validateAbilityIncreases(statblock, increases);
    }
  } else if (increases.length > 0 || input.featId !== undefined) {
    throw new Error('questo livello non concede ASI o talenti');
  }

  const feat: SrdFeat | undefined = input.featId === undefined
    ? undefined
    : catalog.feats.find((entry) => entry.id === input.featId);
  if (input.featId !== undefined && feat === undefined) {
    throw new Error('talento inesistente');
  }
  if (feat !== undefined && (feat.minLevel ?? 1) > level) {
    throw new Error('talento non disponibile a questo livello');
  }

  const abilities = { ...statblock.abilities };
  for (const increase of increases) {
    abilities[increase.ability] += increase.amount;
  }
  const die = characterClass.hitDie;
  const hpRoll = input.hpMethod === 'roll'
    ? input.hpRoll
    : averageHpGain(die);
  if (hpRoll === undefined || !Number.isInteger(hpRoll) || hpRoll < 1 || hpRoll > die) {
    throw new Error(`il tiro di punti ferita deve essere fra 1 e ${die}`);
  }
  const hpRolls = [...statblock.hpRolls, hpRoll];
  const hpMax = hpMaxFor({
    hitDie: die,
    hpRolls,
    conModifier: abilityModifier(abilities.con),
    speciesBonus: speciesBonus(catalog, statblock),
  });
  const hpGain = hpMax - statblock.hp.max;
  const hpCurrent = statblock.hp.current <= 0
    ? 0
    : Math.min(hpMax, Math.max(0, statblock.hp.current + hpGain));
  const slots = newSpellSlots(characterClass, statblock.spells.slots, level);
  const pactSlots = newPactSlots(characterClass, statblock.spells.pactSlots, level);
  const features = mergeFeatures(
    statblock.snapshot.features,
    classFeatures(characterClass, subclassId, level),
  );
  if (feat !== undefined) {
    features.push(feature(feat.id, feat.name, level, feat.description, 'none', 'feat'));
  }
  const next: PcStatblock = {
    ...statblock,
    abilities,
    hp: { current: hpCurrent, max: hpMax, temp: statblock.hp.temp },
    class: {
      id: statblock.class.id,
      level,
      ...(subclassId === undefined ? {} : { subclassId }),
    },
    abilityIncreases: [...statblock.abilityIncreases, ...increases],
    feats: feat === undefined ? statblock.feats : [...statblock.feats, { id: feat.id }],
    spells: {
      ...statblock.spells,
      slots,
      ...(pactSlots === undefined ? {} : { pactSlots }),
    },
    hitDice: { ...statblock.hitDice, total: level },
    hpRolls,
    snapshot: {
      ...statblock.snapshot,
      features,
    },
  };
  const preview: PcLevelUpPreview = {
    level,
    hpMax,
    hpGain,
    features: features.filter((entry) => entry.source === 'class' || entry.source === 'subclass'),
    slots,
    ...(pactSlots === undefined ? {} : { pactSlots: { level: pactSlots.level, max: pactSlots.max } }),
    abilityIncreases: increases,
  };
  return { statblock: next, preview };
};
