import type { Ability, Skill } from '../../schemas/common.js';
import { abilities, currencyToCopper, formatGp, gpToCopper, skills as allSkills } from '../../schemas/common.js';
import type {
  AsiChoice,
  BuildError,
  BuildStep,
  BuildValidation,
  BuildWarning,
  PcBuild,
} from '../../schemas/build.js';
import type { SrdCatalog, SrdClass, SrdFeat, SrdItem, SrdSpell } from '../../schemas/srd.js';
import { POINT_BUY_BUDGET, STANDARD_ARRAY, pointBuyCost } from './abilities.js';
import { pcAbilityScores, pcHpMax } from './hp.js';
import { isPreparedCaster, maxSpellLevel } from './progression.js';

const WIZARD = 'wizard';

interface Context {
  build: PcBuild;
  catalog: SrdCatalog;
  characterClass: SrdClass;
  errors: BuildError[];
  warnings: BuildWarning[];
  featById: Map<string, SrdFeat>;
  itemById: Map<string, SrdItem>;
  spellById: Map<string, SrdSpell>;
}

const addError = (
  context: Context,
  step: BuildStep,
  code: string,
  message: string,
  field?: string,
): void => {
  context.errors.push(field === undefined ? { step, code, message } : { step, code, message, field });
};

const addWarning = (context: Context, step: BuildStep, code: string, message: string): void => {
  context.warnings.push({ step, code, message });
};

const indexById = <T extends { id: string }>(values: readonly T[]): Map<string, T> =>
  new Map(values.map((value) => [value.id, value]));

const isDistinct = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const validateIdentity = (context: Context): void => {
  const { build, catalog, characterClass } = context;
  if (build.rulesVersion !== catalog.meta.version) {
    addError(
      context,
      'identity',
      'rules_version_mismatch',
      `La build usa ${build.rulesVersion}, il catalogo corrente è ${catalog.meta.version}`,
      'rulesVersion',
    );
  }
  if (!catalog.species.some((species) => species.id === build.speciesId)) {
    addError(context, 'identity', 'species_unknown', 'Specie inesistente', 'speciesId');
  }
  if (!catalog.backgrounds.some((background) => background.id === build.backgroundId)) {
    addError(context, 'identity', 'background_unknown', 'Background inesistente', 'backgroundId');
  }

  const subclassRequired = build.level >= characterClass.subclassLevel;
  if (subclassRequired && build.subclassId === undefined) {
    addError(
      context,
      'identity',
      'subclass_required',
      `La sottoclasse è obbligatoria dal livello ${characterClass.subclassLevel}`,
      'subclassId',
    );
  }
  if (!subclassRequired && build.subclassId !== undefined) {
    addError(
      context,
      'identity',
      'subclass_too_early',
      `La sottoclasse non è disponibile prima del livello ${characterClass.subclassLevel}`,
      'subclassId',
    );
  }
  if (
    build.subclassId !== undefined
    && !characterClass.subclasses.some((subclass) => subclass.id === build.subclassId)
  ) {
    addError(context, 'identity', 'subclass_unknown', 'Sottoclasse non valida per la classe', 'subclassId');
  }
};

const validateBaseScores = (context: Context): void => {
  const { build } = context;
  const base = build.abilityGeneration.base;
  const values = abilities.map((ability) => base[ability]);

  switch (build.abilityGeneration.method) {
    case 'pointBuy': {
      const invalid = values.filter((value) => value < 8 || value > 15);
      if (invalid.length > 0) {
        addError(
          context,
          'abilities',
          'point_buy_range',
          'Il point buy ammette punteggi tra 8 e 15',
          'abilityGeneration.base',
        );
        return;
      }
      const cost = values.reduce((total, value) => total + pointBuyCost(value), 0);
      if (cost !== POINT_BUY_BUDGET) {
        addError(
          context,
          'abilities',
          'point_buy_budget',
          `Il point buy richiede ${POINT_BUY_BUDGET} punti, spesi ${cost}`,
          'abilityGeneration.base',
        );
      }
      break;
    }
    case 'standardArray': {
      const expected = [...STANDARD_ARRAY].sort((a, b) => a - b);
      const actual = [...values].sort((a, b) => a - b);
      if (expected.join(',') !== actual.join(',')) {
        addError(
          context,
          'abilities',
          'standard_array_mismatch',
          'I punteggi devono essere una permutazione dello standard array',
          'abilityGeneration.base',
        );
      }
      break;
    }
    case 'rolled': {
      const rolls = build.abilityGeneration.rolls;
      if (rolls === undefined) {
        addError(
          context,
          'abilities',
          'rolls_missing',
          'Manca il risultato dei tiri 4d6kh3',
          'abilityGeneration.rolls',
        );
        return;
      }
      const sortedRolls = [...rolls].sort((a, b) => a - b);
      const sortedValues = [...values].sort((a, b) => a - b);
      if (sortedRolls.join(',') !== sortedValues.join(',')) {
        addError(
          context,
          'abilities',
          'rolled_assignment_mismatch',
          'I punteggi assegnati non corrispondono ai tiri registrati',
          'abilityGeneration.base',
        );
      }
      break;
    }
    case 'manual':
      break;
  }
};

const validateBackgroundIncreases = (context: Context): void => {
  const { build, catalog } = context;
  const background = catalog.backgrounds.find((candidate) => candidate.id === build.backgroundId);
  if (background === undefined) {
    return;
  }
  const increases = build.backgroundIncreases;
  if (increases.some((increase) => increase.source !== 'background')) {
    addError(context, 'abilities', 'background_source', 'Gli aumenti del background hanno fonte background');
  }
  const allowed = new Set(background.abilityScoreOptions);
  if (increases.some((increase) => !allowed.has(increase.ability))) {
    addError(
      context,
      'abilities',
      'background_ability_not_allowed',
      'Il background non concede aumenti su quella caratteristica',
      'backgroundIncreases',
    );
  }
  const amounts = increases.map((increase) => increase.amount).sort((a, b) => b - a);
  const twoPlusOne = amounts.length === 2 && amounts[0] === 2 && amounts[1] === 1;
  const threeOnes = amounts.length === 3 && amounts.every((amount) => amount === 1);
  if (!twoPlusOne && !threeOnes) {
    addError(
      context,
      'abilities',
      'background_pattern',
      'Gli aumenti del background sono +2/+1 oppure +1/+1/+1',
      'backgroundIncreases',
    );
  }
  if (!isDistinct(increases.map((increase) => increase.ability))) {
    addError(
      context,
      'abilities',
      'background_duplicate',
      'Ogni aumento del background va su una caratteristica diversa',
      'backgroundIncreases',
    );
  }
};

const validateAsi = (context: Context): void => {
  const { build, characterClass } = context;
  const requiredLevels = characterClass.asiLevels.filter((level) => level <= build.level);
  const byLevel = new Map<number, AsiChoice[]>();
  for (const choice of build.asiChoices) {
    byLevel.set(choice.level, [...(byLevel.get(choice.level) ?? []), choice]);
  }

  for (const level of requiredLevels) {
    const choices = byLevel.get(level) ?? [];
    if (choices.length !== 1) {
      addError(
        context,
        'abilities',
        'asi_missing',
        `Il livello ${level} richiede esattamente una scelta tra ASI e talento`,
        `asiChoices.${level}`,
      );
    }
  }
  for (const level of byLevel.keys()) {
    if (!requiredLevels.includes(level)) {
      addError(
        context,
        'abilities',
        'asi_level_invalid',
        `La classe non prevede un ASI al livello ${level}`,
        `asiChoices.${level}`,
      );
    }
  }

  for (const choice of build.asiChoices) {
    if (choice.type === 'asi') {
      const increases = choice.increases ?? [];
      const amounts = increases.map((increase) => increase.amount).sort((a, b) => b - a);
      const valid = (amounts.length === 1 && amounts[0] === 2)
        || (amounts.length === 2 && amounts[0] === 1 && amounts[1] === 1);
      if (!valid || !isDistinct(increases.map((increase) => increase.ability))) {
        addError(
          context,
          'abilities',
          'asi_invalid',
          'Un ASI aumenta una caratteristica di 2 oppure due caratteristiche di 1',
          `asiChoices.${choice.level}`,
        );
      }
      if (increases.some((increase) => increase.source !== 'asi')) {
        addError(context, 'abilities', 'asi_source', 'Gli aumenti ASI hanno fonte asi');
      }
    } else {
      if (choice.featId === undefined) {
        addError(context, 'abilities', 'asi_feat_missing', 'Manca il talento scelto', `asiChoices.${choice.level}`);
        continue;
      }
      const feat = context.featById.get(choice.featId);
      if (feat === undefined) {
        addError(context, 'abilities', 'feat_unknown', `Talento inesistente: ${choice.featId}`, 'featId');
        continue;
      }
      if (feat.minLevel !== undefined && feat.minLevel > choice.level) {
        addError(
          context,
          'abilities',
          'feat_level',
          `Il talento ${feat.name} richiede il livello ${feat.minLevel}`,
          'featId',
        );
      }
      if (feat.abilityIncrease !== undefined) {
        const increases = choice.increases ?? [];
        const total = increases.reduce((sum, increase) => sum + increase.amount, 0);
        if (total !== feat.abilityIncrease.amount) {
          addError(
            context,
            'abilities',
            'feat_increase_amount',
            `Il talento ${feat.name} richiede ${feat.abilityIncrease.amount} punti di caratteristica`,
            `asiChoices.${choice.level}`,
          );
        }
        if (increases.some((increase) => increase.source !== 'feat')) {
          addError(context, 'abilities', 'feat_source', 'Gli aumenti del talento hanno fonte feat');
        }
      } else if ((choice.increases ?? []).length > 0) {
        addError(
          context,
          'abilities',
          'feat_increase_not_allowed',
          `Il talento ${feat.name} non aumenta caratteristiche`,
          `asiChoices.${choice.level}`,
        );
      }
    }
  }
};

const validateFeatList = (context: Context): void => {
  const { build } = context;
  const seen = new Set<string>();
  for (const featChoice of build.feats) {
    const feat = context.featById.get(featChoice.id);
    if (feat === undefined) {
      addError(context, 'proficiencies', 'feat_unknown', `Talento inesistente: ${featChoice.id}`, 'feats');
      continue;
    }
    if (feat.minLevel !== undefined && feat.minLevel > build.level) {
      addError(
        context,
        'proficiencies',
        'feat_level',
        `Il talento ${feat.name} richiede il livello ${feat.minLevel}`,
        'feats',
      );
    }
    if (seen.has(feat.id) && !feat.repeatable) {
      addError(context, 'proficiencies', 'feat_duplicate', `Talento ripetuto: ${feat.name}`, 'feats');
    }
    seen.add(feat.id);
  }
};

const validateProficiencies = (context: Context): void => {
  const { build, characterClass, catalog } = context;
  const species = catalog.species.find((candidate) => candidate.id === build.speciesId);
  const background = catalog.backgrounds.find((candidate) => candidate.id === build.backgroundId);

  const classChoices = build.proficiencies.classSkills;
  if (classChoices.length !== characterClass.skillChoices.count) {
    addError(
      context,
      'proficiencies',
      'class_skill_count',
      `La classe richiede ${characterClass.skillChoices.count} competenze, scelte ${classChoices.length}`,
      'proficiencies.classSkills',
    );
  }
  if (!isDistinct(classChoices)) {
    addError(context, 'proficiencies', 'class_skill_duplicate', 'Competenza di classe ripetuta');
  }
  if (
    characterClass.skillChoices.from.length > 0
    && classChoices.some((skill) => !characterClass.skillChoices.from.includes(skill))
  ) {
    addError(
      context,
      'proficiencies',
      'class_skill_not_allowed',
      'Una delle competenze scelte non è nella lista della classe',
      'proficiencies.classSkills',
    );
  }

  const speciesChoices = build.proficiencies.speciesSkills;
  const expectedSpecies = species?.skillChoices?.count ?? 0;
  if (speciesChoices.length !== expectedSpecies) {
    addError(
      context,
      'proficiencies',
      'species_skill_count',
      `La specie richiede ${expectedSpecies} competenze, scelte ${speciesChoices.length}`,
      'proficiencies.speciesSkills',
    );
  }
  if (
    species?.skillChoices !== undefined
    && species.skillChoices.from.length > 0
    && speciesChoices.some((skill) => !species.skillChoices?.from.includes(skill))
  ) {
    addError(
      context,
      'proficiencies',
      'species_skill_not_allowed',
      'Una delle competenze scelte non è nella lista della specie',
      'proficiencies.speciesSkills',
    );
  }

  const granted = new Set<Skill>([
    ...(background?.skillProficiencies ?? []),
    ...(species?.skillProficiencies ?? []),
    ...classChoices,
    ...speciesChoices,
  ]);
  const expertise = build.proficiencies.expertise;
  if (!isDistinct(expertise) || expertise.some((skill) => !granted.has(skill))) {
    addError(
      context,
      'proficiencies',
      'expertise_invalid',
      "L'expertise richiede una competenza già posseduta e non può ripetersi",
      'proficiencies.expertise',
    );
  }

  const chosenTools = build.proficiencies.tools;
  if (!isDistinct(chosenTools)) {
    addError(context, 'proficiencies', 'tool_duplicate', 'Attrezzo ripetuto', 'proficiencies.tools');
  }
  if (characterClass.toolChoices !== undefined) {
    const prefix = `${characterClass.toolChoices.kind}:`;
    const matching = chosenTools.filter((tool) => tool.startsWith(prefix)).length;
    if (matching < characterClass.toolChoices.count) {
      addError(
        context,
        'proficiencies',
        'tool_choice_count',
        `Servono ${characterClass.toolChoices.count} scelte di tipo ${characterClass.toolChoices.kind}`,
        'proficiencies.tools',
      );
    }
  }

  const languages = build.proficiencies.languages;
  const expectedLanguages = species?.languageChoices ?? 0;
  if (languages.length !== expectedLanguages || !isDistinct(languages)) {
    addError(
      context,
      'proficiencies',
      'language_count',
      `Servono ${expectedLanguages} lingue aggiuntive, tutte diverse`,
      'proficiencies.languages',
    );
  }
};

const validateEquipment = (context: Context): void => {
  const { build, characterClass } = context;
  let spentCopper = 0;
  const seen = new Set<string>();
  for (const entry of build.equipment) {
    const item = context.itemById.get(entry.itemId);
    if (item === undefined) {
      addError(context, 'equipment', 'item_unknown', `Oggetto inesistente: ${entry.itemId}`, 'equipment');
      continue;
    }
    if (seen.has(item.id)) {
      addError(context, 'equipment', 'item_duplicate', `Oggetto ripetuto: ${item.name}`, 'equipment');
    }
    seen.add(item.id);
    spentCopper += gpToCopper(item.valueGp) * entry.quantity;
    if (item.category === 'weapon' && item.data.category === 'weapon') {
      const proficient = item.data.simple
        ? characterClass.weaponProficiencies.includes('simple')
        : characterClass.weaponProficiencies.includes('martial');
      if (!proficient) {
        addWarning(
          context,
          'equipment',
          'weapon_not_proficient',
          `Nessuna competenza per ${item.name}: l'attacco non aggiunge il bonus di competenza`,
        );
      }
    }
    if (item.data.category === 'armor') {
      const proficient = characterClass.armorTraining.includes(item.data.armorCategory);
      if (!proficient) {
        addWarning(
          context,
          'equipment',
          'armor_not_proficient',
          `Nessuna competenza per ${item.name}`,
        );
      }
    }
  }

  if (build.level > 1 && gpToCopper(build.budgetGp) === gpToCopper(characterClass.startingGold)) {
    addWarning(
      context,
      'equipment',
      'budget_not_scaled',
      'Il budget non scala con il livello: il DM deve aumentarlo esplicitamente',
    );
  }

  const budgetCopper = gpToCopper(build.budgetGp);
  if (spentCopper > budgetCopper) {
    addError(
      context,
      'equipment',
      'budget_exceeded',
      `La spesa (${formatGp(spentCopper)} mo) supera il budget (${formatGp(budgetCopper)} mo)`,
      'equipment',
    );
  }
  const remainingCopper = budgetCopper - spentCopper;
  const declaredCopper = currencyToCopper(build.currency);
  if (declaredCopper > remainingCopper) {
    addError(
      context,
      'equipment',
      'currency_exceeds_budget',
      'Le monete dichiarate superano il budget rimasto',
      'currency',
    );
  } else if (remainingCopper - declaredCopper > 0) {
    addWarning(
      context,
      'equipment',
      'budget_unspent',
      `Restano ${formatGp(remainingCopper - declaredCopper)} mo non assegnate`,
    );
  }
};

const spellIsForClass = (spell: SrdSpell, classId: string): boolean => spell.classes.includes(classId);

const validateSpells = (context: Context): void => {
  const { build, characterClass } = context;
  const spellcasting = characterClass.spellcasting;
  const { cantrips, known, prepared, spellbook } = build.spells;

  if (spellcasting === undefined) {
    if (cantrips.length + known.length + prepared.length + spellbook.length > 0) {
      addError(
        context,
        'spells',
        'class_not_caster',
        'La classe non lancia incantesimi',
        'spells',
      );
    }
    return;
  }

  const chosenLists = [cantrips, known, prepared, spellbook];
  if (chosenLists.some((list) => !isDistinct(list))) {
    addError(context, 'spells', 'spell_duplicate', 'Incantesimo ripetuto tra le scelte', 'spells');
  }
  if (!isDistinct([...cantrips, ...known])) {
    addError(context, 'spells', 'spell_duplicate', 'Incantesimo ripetuto tra le scelte', 'spells');
  }

  const cantripTarget = spellcasting.cantripsKnown[build.level - 1] ?? 0;
  if (cantrips.length !== cantripTarget) {
    addError(
      context,
      'spells',
      'cantrip_count',
      `Servono ${cantripTarget} trucchetti, scelti ${cantrips.length}`,
      'spells.cantrips',
    );
  }

  const preparedTarget = spellcasting.preparedSpells[build.level - 1] ?? 0;
  const isWizard = build.classId === WIZARD;
  const mainList = isPreparedCaster(build.classId) ? prepared : known;
  const otherList = isPreparedCaster(build.classId) ? known : prepared;
  if (mainList.length !== preparedTarget) {
    addError(
      context,
      'spells',
      'spell_count',
      `Servono ${preparedTarget} incantesimi, scelti ${mainList.length}`,
      'spells',
    );
  }
  if (otherList.length > 0) {
    addError(
      context,
      'spells',
      'spell_list_wrong',
      'Questa classe usa una sola lista tra conosciuti e preparati',
      'spells',
    );
  }
  if (!isWizard && spellbook.length > 0) {
    addError(
      context,
      'spells',
      'spellbook_not_allowed',
      'Solo il mago usa un libro degli incantesimi',
      'spells.spellbook',
    );
  }
  if (isWizard) {
    if (prepared.some((id) => !spellbook.includes(id))) {
      addError(
        context,
        'spells',
        'wizard_prepared_missing',
        'Ogni incantesimo preparato del mago deve essere nel libro',
        'spells.prepared',
      );
    }
    if (spellbook.length < prepared.length) {
      addError(
        context,
        'spells',
        'wizard_spellbook_size',
        'Il libro degli incantesimi è più piccolo degli incantesimi preparati',
        'spells.spellbook',
      );
    }
  }

  const levels = spellcasting.progression === 'pact'
    ? (spellcasting.pactSlots?.[build.level - 1]?.level ?? 0)
    : maxSpellLevel(
      (spellcasting.slots[build.level - 1] ?? []).map((max, index) => ({ level: index + 1, max })),
    );

  const checkSpell = (id: string, expectedLevel: number | undefined, step: BuildStep, field: string): void => {
    const spell = context.spellById.get(id);
    if (spell === undefined) {
      addError(context, step, 'spell_unknown', `Incantesimo inesistente: ${id}`, field);
      return;
    }
    if (!spellIsForClass(spell, build.classId)) {
      addError(context, step, 'spell_not_for_class', `${spell.name} non è nella lista della classe`, field);
    }
    if (expectedLevel !== undefined && spell.level !== expectedLevel) {
      addError(
        context,
        step,
        'spell_level_invalid',
        `${spell.name} non è un incantesimo di livello ${expectedLevel}`,
        field,
      );
    }
    if (expectedLevel === undefined && spell.level > levels) {
      addError(
        context,
        step,
        'spell_too_high',
        `${spell.name} è di livello ${spell.level}, il massimo disponibile è ${levels}`,
        field,
      );
    }
  };

  for (const id of cantrips) {
    checkSpell(id, 0, 'spells', 'spells.cantrips');
  }
  for (const id of mainList) {
    checkSpell(id, undefined, 'spells', 'spells');
  }
  if (isWizard) {
    for (const id of spellbook) {
      checkSpell(id, undefined, 'spells', 'spells.spellbook');
    }
  }
};

const abilityCapFor = (build: PcBuild, featById: Map<string, SrdFeat>, ability: Ability): number => {
  let cap = 20;
  for (const choice of build.asiChoices) {
    if (choice.type !== 'feat' || choice.featId === undefined) {
      continue;
    }
    const feat = featById.get(choice.featId);
    if (feat?.abilityIncrease !== undefined && choice.increases?.some((increase) => increase.ability === ability)) {
      cap = Math.max(cap, feat.abilityIncrease.max);
    }
  }
  return cap;
};

const totalScores = (context: Context): Record<Ability, number> =>
  pcAbilityScores(context.build);

const validateAbilityCaps = (context: Context): void => {
  const scores = totalScores(context);
  for (const ability of abilities) {
    const cap = abilityCapFor(context.build, context.featById, ability);
    if ((scores[ability] ?? 0) > cap) {
      addError(
        context,
        'abilities',
        'ability_cap',
        `La caratteristica ${ability.toUpperCase()} supera il massimo di ${cap}`,
        'abilityGeneration.base',
      );
    }
  }
};

const expectedHp = (context: Context): number =>
  pcHpMax(context.build, context.catalog);

const validateHitPoints = (context: Context): void => {
  const { build, characterClass } = context;
  const expectedRolls = build.level - 1;
  if (build.hpRolls.length !== expectedRolls) {
    addError(
      context,
      'details',
      'hp_rolls_count',
      `Servono ${expectedRolls} tiri di dado vita, trovati ${build.hpRolls.length}`,
      'hpRolls',
    );
  }
  if (build.hpRolls.some((roll) => roll < 1 || roll > characterClass.hitDie)) {
    addError(
      context,
      'details',
      'hp_roll_invalid',
      `Ogni tiro di dado vita deve stare tra 1 e ${characterClass.hitDie}`,
      'hpRolls',
    );
  }
};

const validateWeaponMasteries = (context: Context): void => {
  const { build, characterClass } = context;
  const expected = characterClass.weaponMasteryCount[build.level - 1] ?? 0;
  if (build.weaponMasteries.length !== expected) {
    addError(
      context,
      'proficiencies',
      'weapon_mastery_count',
      `Servono ${expected} maestrie delle armi, scelte ${build.weaponMasteries.length}`,
      'weaponMasteries',
    );
  }
  if (!isDistinct(build.weaponMasteries)) {
    addError(context, 'proficiencies', 'weapon_mastery_duplicate', 'Maestria ripetuta', 'weaponMasteries');
  }
};

export const validatePcBuild = (build: PcBuild, catalog: SrdCatalog): BuildValidation => {
  const characterClass = catalog.classes.find((candidate) => candidate.id === build.classId);
  if (characterClass === undefined) {
    return {
      ok: false,
      errors: [
        {
          step: 'identity',
          code: 'class_unknown',
          message: `Classe inesistente: ${build.classId}`,
          field: 'classId',
        },
      ],
      warnings: [],
    };
  }

  const context: Context = {
    build,
    catalog,
    characterClass,
    errors: [],
    warnings: [],
    featById: indexById(catalog.feats),
    itemById: indexById(catalog.items),
    spellById: indexById(catalog.spells),
  };

  validateIdentity(context);
  validateBaseScores(context);
  validateBackgroundIncreases(context);
  validateAsi(context);
  validateFeatList(context);
  validateProficiencies(context);
  validateAbilityCaps(context);
  validateEquipment(context);
  validateSpells(context);
  validateHitPoints(context);
  validateWeaponMasteries(context);

  const hpMax = expectedHp(context);
  return {
    ok: context.errors.length === 0,
    errors: context.errors,
    warnings: context.warnings,
    ...(hpMax === undefined ? {} : { expectedHpMax: hpMax }),
    totalAbilityScores: totalScores(context),
  };
};

export { allSkills as allSkillNames };
