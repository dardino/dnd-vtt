import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import {
  averageHpGain,
  emptyCurrency,
  gpToCopper,
  recommendEquipment,
  remainingCurrency,
  validatePcBuild,
  type Ability,
  type AsiChoice,
  type BuildValidation,
  type Currency,
  type PcBuild,
  type SrdBackground,
  type SrdCatalog,
  type SrdClass,
  type SrdSpecies,
  skills as allSkills,
} from '@dnd-vtt/shared';
import { SrdCatalogService, SRD_VERSION } from '../../core/srd-catalog.service';

export const WIZARD_STEPS = [
  'Identità',
  'Caratteristiche',
  'Competenze',
  'Equipaggiamento',
  'Magia',
  'Dettagli',
  'Riepilogo',
] as const;

const LANGUAGE_POOL = [
  'Comune',
  'Elfico',
  'Nanico',
  'Orchesco',
  'Draconico',
  'Gnomesco',
  'Halfling',
  'Infernale',
  'Celestiale',
  'Silvano',
];

const emptyBuild = (): PcBuild => ({
  rulesVersion: SRD_VERSION,
  level: 1,
  classId: '',
  speciesId: '',
  backgroundId: '',
  abilityGeneration: {
    method: 'pointBuy',
    base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
  },
  backgroundIncreases: [],
  feats: [],
  proficiencies: {
    classSkills: [],
    speciesSkills: [],
    expertise: [],
    tools: [],
    languages: [],
  },
  asiChoices: [],
  weaponMasteries: [],
  equipment: [],
  currency: emptyCurrency(),
  budgetGp: 0,
  spells: { cantrips: [], known: [], prepared: [], spellbook: [] },
  hpRolls: [],
});

export interface CharacterWizardState {
  step: number;
  name: string;
  alignment: string;
  notes: string;
  build: PcBuild;
  preview: BuildValidation | null;
  checking: boolean;
  checkError: string | null;
}

const withoutSubclass = (build: PcBuild): PcBuild => {
  const copy = { ...build };
  delete copy.subclassId;
  return copy;
};

const scoresOf = (build: PcBuild): Record<Ability, number> => {
  const scores = { ...build.abilityGeneration.base };
  for (const increase of build.backgroundIncreases) {
    scores[increase.ability] += increase.amount;
  }
  return scores;
};

const defaultAsiIncreases = (
  characterClass: SrdClass,
  scores: Record<Ability, number>,
): NonNullable<AsiChoice['increases']> => {
  const primary = characterClass.primaryAbilities[0] ?? 'str';
  if (scores[primary] <= 18) {
    return [{ source: 'asi', ability: primary, amount: 2 }];
  }
  const lowest = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[])
    .filter((ability) => ability !== primary)
    .sort((left, right) => scores[left] - scores[right])[0] ?? 'con';
  return [
    { source: 'asi', ability: primary, amount: 1 },
    { source: 'asi', ability: lowest, amount: 1 },
  ];
};

const withAsiDefaults = (characterClass: SrdClass, level: number, build: PcBuild): AsiChoice[] => {
  const required = characterClass.asiLevels.filter((asiLevel) => asiLevel <= level);
  const scores = scoresOf(build);
  return required.map((asiLevel) => {
    const existing = build.asiChoices.find((choice) => choice.level === asiLevel);
    if (existing !== undefined) {
      for (const increase of existing.increases ?? []) {
        scores[increase.ability] += increase.amount;
      }
      return existing;
    }
    const increases = defaultAsiIncreases(characterClass, scores);
    for (const increase of increases) {
      scores[increase.ability] += increase.amount;
    }
    return { level: asiLevel, type: 'asi' as const, increases };
  });
};

const maxSpellLevelOf = (characterClass: SrdClass, level: number): number => {
  const casting = characterClass.spellcasting;
  if (casting === undefined) {
    return 0;
  }
  if (casting.progression === 'pact') {
    return casting.pactSlots?.[level - 1]?.level ?? 0;
  }
  return (casting.slots[level - 1] ?? [])
    .reduce((highest, count, index) => (count > 0 ? index + 1 : highest), 0);
};

const defaultSpells = (
  characterClass: SrdClass,
  level: number,
  catalog: SrdCatalog,
): PcBuild['spells'] => {
  const casting = characterClass.spellcasting;
  if (casting === undefined) {
    return { cantrips: [], known: [], prepared: [], spellbook: [] };
  }
  const available = catalog.spells.filter((spell) => spell.classes.includes(characterClass.id));
  const cantripTarget = casting.cantripsKnown[level - 1] ?? 0;
  const preparedTarget = casting.preparedSpells[level - 1] ?? 0;
  const maxLevel = maxSpellLevelOf(characterClass, level);
  const cantrips = available
    .filter((spell) => spell.level === 0)
    .slice(0, cantripTarget)
    .map((spell) => spell.id);
  const main = available
    .filter((spell) => spell.level >= 1 && spell.level <= maxLevel)
    .slice(0, preparedTarget)
    .map((spell) => spell.id);
  const preparedCaster = ['cleric', 'druid', 'paladin', 'wizard'].includes(characterClass.id);
  return {
    cantrips,
    known: preparedCaster ? [] : main,
    prepared: preparedCaster ? main : [],
    spellbook: characterClass.id === 'wizard' ? main : [],
  };
};

const withClassDefaults = (
  characterClass: SrdClass,
  build: PcBuild,
  catalog: SrdCatalog,
): PcBuild => {
  const level = build.level;
  const weaponIds = catalog.items
    .filter((item) => item.category === 'weapon')
    .map((item) => item.id);
  const masteryCount = characterClass.weaponMasteryCount[level - 1] ?? 0;
  const pool = characterClass.skillChoices.from.length > 0
    ? characterClass.skillChoices.from
    : allSkills;
  const classSkills = pool.slice(0, characterClass.skillChoices.count);
  const next: PcBuild = {
    ...build,
    classId: characterClass.id,
    budgetGp: characterClass.startingGold,
    currency: remainingCurrency(characterClass.startingGold, 0),
    equipment: [],
    hpRolls: Array.from({ length: level - 1 }, () => averageHpGain(characterClass.hitDie)),
    proficiencies: {
      ...build.proficiencies,
      classSkills: [...classSkills],
      tools: [],
    },
    weaponMasteries: weaponIds.slice(0, masteryCount),
    asiChoices: withAsiDefaults(characterClass, level, build),
    spells: defaultSpells(characterClass, level, catalog),
  };
  if (level >= characterClass.subclassLevel) {
    const subclass = characterClass.subclasses[0];
    if (subclass !== undefined) {
      return { ...next, subclassId: subclass.id };
    }
  }
  return withoutSubclass(next);
};

const spentOf = (build: PcBuild, catalog: SrdCatalog): number =>
  build.equipment.reduce((total, entry) => {
    const item = catalog.items.find((candidate) => candidate.id === entry.itemId);
    return total + gpToCopper(item?.valueGp ?? 0) * entry.quantity;
  }, 0);

export const CharacterWizardStore = signalStore(
  { providedIn: 'root' },
  withState<CharacterWizardState>({
    step: 0,
    name: '',
    alignment: '',
    notes: '',
    build: emptyBuild(),
    preview: null,
    checking: false,
    checkError: null,
  }),
  withMethods((store, catalogService = inject(SrdCatalogService), http = inject(HttpClient)) => {
    const catalog = (): SrdCatalog | null => catalogService.catalog();
    const updateBuild = (patch: Partial<PcBuild>): void => {
      patchState(store, { build: { ...store.build(), ...patch }, preview: null });
    };
    const characterClass = (): SrdClass | undefined =>
      catalog()?.classes.find((entry) => entry.id === store.build().classId);
    const background = (): SrdBackground | undefined =>
      catalog()?.backgrounds.find((entry) => entry.id === store.build().backgroundId);
    const species = (): SrdSpecies | undefined =>
      catalog()?.species.find((entry) => entry.id === store.build().speciesId);

    const applyBackground = (value: SrdBackground): void => {
      const [first, second] = value.abilityScoreOptions;
      const increases = first === undefined
        ? []
        : second === undefined
          ? [{ source: 'background' as const, ability: first, amount: 2 }]
          : [
            { source: 'background' as const, ability: first, amount: 2 },
            { source: 'background' as const, ability: second, amount: 1 },
          ];
      patchState(store, {
        build: {
          ...store.build(),
          backgroundId: value.id,
          backgroundIncreases: increases,
          feats: [{ id: value.featId }],
          currency: store.build().currency,
        },
        preview: null,
      });
    };

    return {
      async loadCatalog(): Promise<void> {
        await catalogService.load();
      },

      setStep(step: number): void {
        patchState(store, { step: Math.max(0, Math.min(WIZARD_STEPS.length - 1, step)) });
      },

      restoreDraft(draft: Pick<CharacterWizardState, 'step' | 'name' | 'alignment' | 'notes' | 'build'>): void {
        patchState(store, { ...draft, preview: null, checkError: null });
      },

      next(): void {
        patchState(store, { step: Math.min(WIZARD_STEPS.length - 1, store.step() + 1) });
      },

      previous(): void {
        patchState(store, { step: Math.max(0, store.step() - 1) });
      },

      setName(name: string): void {
        patchState(store, { name });
      },

      setAlignment(alignment: string): void {
        patchState(store, { alignment });
      },

      setNotes(notes: string): void {
        patchState(store, { notes });
      },

      selectClass(classId: string): void {
        const data = catalog();
        const info = data?.classes.find((entry) => entry.id === classId);
        if (data === null || info === undefined) {
          return;
        }
        patchState(store, {
          build: withClassDefaults(info, store.build(), data),
          preview: null,
        });
      },

      selectSpecies(speciesId: string): void {
        const data = catalog();
        const info = data?.species.find((entry) => entry.id === speciesId);
        if (data === null || info === undefined) {
          return;
        }
        const choices = info.skillChoices;
        const speciesPool = choices === undefined
          ? []
          : choices.from.length > 0 ? choices.from : allSkills;
        const speciesSkills = choices === undefined ? [] : speciesPool.slice(0, choices.count);
        const languages = LANGUAGE_POOL.slice(1, 1 + info.languageChoices);
        patchState(store, {
          build: {
            ...store.build(),
            speciesId,
            proficiencies: {
              ...store.build().proficiencies,
              speciesSkills: [...speciesSkills],
              languages,
            },
          },
          preview: null,
        });
      },

      selectBackground(backgroundId: string): void {
        const data = catalog();
        const info = data?.backgrounds.find((entry) => entry.id === backgroundId);
        if (info !== undefined) {
          applyBackground(info);
        }
      },

      setSubclass(subclassId: string): void {
        const info = characterClass();
        if (info === undefined) {
          return;
        }
        if (subclassId === '') {
          updateBuild(withoutSubclass(store.build()));
          return;
        }
        updateBuild({ subclassId });
      },

      setLevel(level: number): void {
        const info = characterClass();
        const data = catalog();
        if (info === undefined || data === null) {
          return;
        }
        const bounded = Math.max(1, Math.min(20, level));
        let next: PcBuild = {
          ...store.build(),
          level: bounded,
          hpRolls: Array.from({ length: bounded - 1 }, () => averageHpGain(info.hitDie)),
          asiChoices: withAsiDefaults(info, bounded, store.build()),
          spells: defaultSpells(info, bounded, data),
          weaponMasteries: data.items
            .filter((item) => item.category === 'weapon')
            .slice(0, info.weaponMasteryCount[bounded - 1] ?? 0)
            .map((item) => item.id),
        };
        if (bounded < info.subclassLevel) {
          next = withoutSubclass(next);
        } else if (next.subclassId === undefined && info.subclasses[0] !== undefined) {
          next = { ...next, subclassId: info.subclasses[0].id };
        }
        patchState(store, { build: next, preview: null });
      },

      setAbilityMethod(method: PcBuild['abilityGeneration']['method']): void {
        const base = method === 'standardArray'
          ? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
          : store.build().abilityGeneration.base;
        updateBuild({
          abilityGeneration: {
            ...store.build().abilityGeneration,
            method,
            base,
          },
        });
      },

      setAbilityScore(ability: Ability, value: number): void {
        const method = store.build().abilityGeneration.method;
        const min = method === 'pointBuy' ? 8 : 3;
        const max = method === 'pointBuy' ? 15 : 20;
        const bounded = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
        updateBuild({
          abilityGeneration: {
            ...store.build().abilityGeneration,
            base: { ...store.build().abilityGeneration.base, [ability]: bounded },
          },
        });
      },

      setBackgroundIncrease(index: number, ability: Ability): void {
        const increases = store.build().backgroundIncreases.map((increase, position) =>
          position === index ? { ...increase, ability } : increase);
        updateBuild({ backgroundIncreases: increases });
      },

      setBackgroundPattern(pattern: '2-1' | '1-1-1'): void {
        const info = background();
        if (info === undefined) {
          return;
        }
        const [first, second, third] = info.abilityScoreOptions;
        if (first === undefined || second === undefined) {
          return;
        }
        const increases = pattern === '2-1'
          ? [
            { source: 'background' as const, ability: first, amount: 2 },
            { source: 'background' as const, ability: second, amount: 1 },
          ]
          : [
            { source: 'background' as const, ability: first, amount: 1 },
            { source: 'background' as const, ability: second, amount: 1 },
            ...(third === undefined
              ? []
              : [{ source: 'background' as const, ability: third, amount: 1 }]),
          ];
        updateBuild({ backgroundIncreases: increases });
      },

      toggleClassSkill(skill: PcBuild['proficiencies']['classSkills'][number]): void {
        const info = characterClass();
        if (info === undefined) {
          return;
        }
        const current = store.build().proficiencies.classSkills;
        const next = current.includes(skill)
          ? current.filter((entry) => entry !== skill)
          : current.length < info.skillChoices.count
            ? [...current, skill]
            : current;
        updateBuild({
          proficiencies: { ...store.build().proficiencies, classSkills: next },
        });
      },

      toggleSpeciesSkill(skill: PcBuild['proficiencies']['speciesSkills'][number]): void {
        const info = species();
        const expected = info?.skillChoices?.count ?? 0;
        const current = store.build().proficiencies.speciesSkills;
        const next = current.includes(skill)
          ? current.filter((entry) => entry !== skill)
          : current.length < expected
            ? [...current, skill]
            : current;
        updateBuild({
          proficiencies: { ...store.build().proficiencies, speciesSkills: next },
        });
      },

      toggleExpertise(skill: PcBuild['proficiencies']['expertise'][number]): void {
        const current = store.build().proficiencies.expertise;
        const next = current.includes(skill)
          ? current.filter((entry) => entry !== skill)
          : [...current, skill];
        updateBuild({
          proficiencies: { ...store.build().proficiencies, expertise: next },
        });
      },

      setLanguages(value: string): void {
        const languages = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
        updateBuild({
          proficiencies: { ...store.build().proficiencies, languages },
        });
      },

      toggleWeaponMastery(itemId: string): void {
        const info = characterClass();
        if (info === undefined) {
          return;
        }
        const expected = info.weaponMasteryCount[store.build().level - 1] ?? 0;
        const current = store.build().weaponMasteries;
        const next = current.includes(itemId)
          ? current.filter((entry) => entry !== itemId)
          : current.length < expected
            ? [...current, itemId]
            : current;
        updateBuild({ weaponMasteries: next });
      },

      setAsiAbility(level: number, ability: Ability): void {
        const choices = store.build().asiChoices.map((choice) =>
          choice.level === level
            ? { ...choice, type: 'asi' as const, increases: [{ source: 'asi' as const, ability, amount: 2 }] }
            : choice);
        updateBuild({ asiChoices: choices });
      },

      setBudget(value: number): void {
        const budget = Math.max(0, value);
        const data = catalog();
        const spentCopper = data === null ? 0 : spentOf(store.build(), data);
        updateBuild({
          budgetGp: budget,
          currency: remainingCurrency(budget, spentCopper),
        });
      },

      setGold(value: number): void {
        updateBuild({
          currency: remainingCurrency(Math.max(0, value), 0),
        });
      },

      autoEquip(abilities: Record<Ability, number>): void {
        const data = catalog();
        const info = characterClass();
        if (data === null || info === undefined) {
          return;
        }
        const budget = store.build().budgetGp;
        const equipment = recommendEquipment({
          characterClass: info,
          items: data.items,
          abilities,
          budgetGp: budget,
        });
        const spentCopper = spentOf({ ...store.build(), equipment }, data);
        updateBuild({
          equipment,
          currency: remainingCurrency(budget, spentCopper),
        });
      },

      addItem(itemId: string): void {
        const data = catalog();
        const item = data?.items.find((entry) => entry.id === itemId);
        if (data === null || item === undefined) {
          return;
        }
        const current = store.build().equipment;
        const existing = current.find((entry) => entry.itemId === itemId);
        const equipment = existing === undefined
          ? [...current, { itemId, quantity: 1 }]
          : current.map((entry) => entry.itemId === itemId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry);
        const spentCopper = spentOf({ ...store.build(), equipment }, data);
        updateBuild({
          equipment,
          currency: remainingCurrency(store.build().budgetGp, spentCopper),
        });
      },

      removeItem(itemId: string): void {
        const data = catalog();
        const equipment = store.build().equipment.filter((entry) => entry.itemId !== itemId);
        const spentCopper = data === null ? 0 : spentOf({ ...store.build(), equipment }, data);
        updateBuild({
          equipment,
          currency: remainingCurrency(store.build().budgetGp, spentCopper),
        });
      },

      setCurrency(currency: Currency): void {
        updateBuild({ currency });
      },

      toggleCantrip(spellId: string): void {
        const info = characterClass();
        if (info?.spellcasting === undefined) {
          return;
        }
        const expected = info.spellcasting.cantripsKnown[store.build().level - 1] ?? 0;
        const current = store.build().spells.cantrips;
        const next = current.includes(spellId)
          ? current.filter((entry) => entry !== spellId)
          : current.length < expected
            ? [...current, spellId]
            : current;
        updateBuild({ spells: { ...store.build().spells, cantrips: next } });
      },

      toggleSpell(spellId: string): void {
        const info = characterClass();
        const data = catalog();
        if (info?.spellcasting === undefined || data === null) {
          return;
        }
        const preparedCaster = ['cleric', 'druid', 'paladin', 'wizard'].includes(info.id);
        const expected = info.spellcasting.preparedSpells[store.build().level - 1] ?? 0;
        const current = preparedCaster ? store.build().spells.prepared : store.build().spells.known;
        const next = current.includes(spellId)
          ? current.filter((entry) => entry !== spellId)
          : current.length < expected
            ? [...current, spellId]
            : current;
        const spells = preparedCaster
          ? {
            ...store.build().spells,
            prepared: next,
            spellbook: info.id === 'wizard' ? next : store.build().spells.spellbook,
          }
          : { ...store.build().spells, known: next };
        updateBuild({ spells });
      },

      async checkBuild(): Promise<void> {
        patchState(store, { checking: true, checkError: null });
        try {
          const preview = await firstValueFrom(
            http.post<BuildValidation>('/api/v1/actors/preview', store.build()),
          );
          patchState(store, { preview, checking: false });
        } catch (error) {
          patchState(store, {
            checking: false,
            checkError: error instanceof Error ? error.message : 'Verifica non riuscita',
          });
        }
      },

      validateLocally(): BuildValidation | null {
        const data = catalog();
        return data === null ? null : validatePcBuild(store.build(), data);
      },
    };
  }),
);
