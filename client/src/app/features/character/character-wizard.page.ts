import { Component, computed, effect, inject, input, signal, type OnInit } from '@angular/core';
import {
  POINT_BUY_BUDGET,
  abilityModifier,
  formatGp,
  formatModifier,
  gpToCopper,
  pointBuyCost,
  skills as ALL_SKILLS,
  validatePcBuild,
  type Ability,
  type BuildStep,
  type BuildValidation,
  type PcBuild,
  type Skill,
  type SrdItem,
  type SrdSpell,
} from '@dnd-vtt/shared';
import { SrdCatalogService } from '../../core/srd-catalog.service';
import {
  CharacterWizardStore,
  WIZARD_STEPS,
} from './character-wizard.store';

interface StoredDraft {
  version: 1;
  savedAt: string;
  step: number;
  name: string;
  alignment: string;
  notes: string;
  build: PcBuild;
}

const STEP_ORDER: readonly BuildStep[] = [
  'identity',
  'abilities',
  'proficiencies',
  'equipment',
  'spells',
  'details',
  'summary',
];

@Component({
  selector: 'app-character-wizard',
  templateUrl: './character-wizard.page.html',
  styleUrl: './character-wizard.page.scss',
})
export class CharacterWizardPage implements OnInit {
  public readonly campaignId = input('demo');
  public readonly store = inject(CharacterWizardStore);
  public readonly catalogService = inject(SrdCatalogService);

  public readonly steps = WIZARD_STEPS;
  public readonly stepOrder = STEP_ORDER;
  public readonly allSkills = ALL_SKILLS;
  public readonly abilities: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  public readonly abilityLabels: Record<Ability, string> = {
    str: 'Forza',
    dex: 'Destrezza',
    con: 'Costituzione',
    int: 'Intelligenza',
    wis: 'Saggezza',
    cha: 'Carisma',
  };

  public readonly search = signal('');
  public readonly savedAt = signal<string | null>(null);
  private restored = false;

  public readonly catalog = this.catalogService.catalog;
  public readonly loading = this.catalogService.loading;
  public readonly loadError = this.catalogService.error;

  public readonly characterClass = computed(() => {
    const catalog = this.catalog();
    return catalog?.classes.find((entry) => entry.id === this.store.build().classId);
  });

  public readonly species = computed(() => {
    const catalog = this.catalog();
    return catalog?.species.find((entry) => entry.id === this.store.build().speciesId);
  });

  public readonly background = computed(() => {
    const catalog = this.catalog();
    return catalog?.backgrounds.find((entry) => entry.id === this.store.build().backgroundId);
  });

  public readonly validation = computed<BuildValidation | null>(() => {
    const catalog = this.catalog();
    return catalog === null ? null : validatePcBuild(this.store.build(), catalog);
  });

  public readonly finalScores = computed<Record<Ability, number>>(() => {
    const build = this.store.build();
    const increases = [
      ...build.backgroundIncreases,
      ...build.asiChoices.flatMap((choice) => choice.increases ?? []),
    ];
    return Object.fromEntries(this.abilities.map((ability) => {
      const bonus = increases
        .filter((increase) => increase.ability === ability)
        .reduce((sum, increase) => sum + increase.amount, 0);
      return [ability, build.abilityGeneration.base[ability] + bonus];
    })) as Record<Ability, number>;
  });

  public readonly pointBuyRemaining = computed(() => {
    const build = this.store.build();
    if (build.abilityGeneration.method !== 'pointBuy') {
      return null;
    }
    const spent = this.abilities.reduce((total, ability) => {
      const score = build.abilityGeneration.base[ability];
      return total + (score >= 8 && score <= 15 ? pointBuyCost(score) : 0);
    }, 0);
    return POINT_BUY_BUDGET - spent;
  });

  public readonly classSkillOptions = computed<readonly Skill[]>(() => {
    const info = this.characterClass();
    if (info === undefined) {
      return [];
    }
    return info.skillChoices.from.length > 0 ? info.skillChoices.from : ALL_SKILLS;
  });

  public readonly speciesSkillOptions = computed<readonly Skill[]>(() => {
    const info = this.species();
    if (info?.skillChoices === undefined) {
      return [];
    }
    return info.skillChoices.from.length > 0 ? info.skillChoices.from : ALL_SKILLS;
  });

  public readonly grantedSkills = computed<ReadonlySet<Skill>>(() => new Set<Skill>([
    ...(this.background()?.skillProficiencies ?? []),
    ...(this.species()?.skillProficiencies ?? []),
    ...this.store.build().proficiencies.classSkills,
    ...this.store.build().proficiencies.speciesSkills,
  ]));

  public readonly weaponItems = computed<readonly SrdItem[]>(() =>
    (this.catalog()?.items ?? []).filter((item) => item.category === 'weapon'));

  public readonly masteryTarget = computed(() => {
    const info = this.characterClass();
    return info === undefined ? 0 : info.weaponMasteryCount[this.store.build().level - 1] ?? 0;
  });

  public readonly cantripTarget = computed(() => {
    const info = this.characterClass();
    const casting = info?.spellcasting;
    return casting === undefined ? 0 : casting.cantripsKnown[this.store.build().level - 1] ?? 0;
  });

  public readonly spellTarget = computed(() => {
    const info = this.characterClass();
    const casting = info?.spellcasting;
    return casting === undefined ? 0 : casting.preparedSpells[this.store.build().level - 1] ?? 0;
  });

  public readonly maxSpellLevel = computed(() => {
    const info = this.characterClass();
    const level = this.store.build().level;
    const casting = info?.spellcasting;
    if (casting === undefined) {
      return 0;
    }
    if (casting.progression === 'pact') {
      return casting.pactSlots?.[level - 1]?.level ?? 0;
    }
    return (casting.slots[level - 1] ?? []).reduce(
      (highest, count, index) => (count > 0 ? index + 1 : highest),
      0,
    );
  });

  public readonly preparedCaster = computed(() =>
    ['cleric', 'druid', 'paladin', 'wizard'].includes(this.store.build().classId));

  public readonly cantripOptions = computed<readonly SrdSpell[]>(() =>
    this.classSpells().filter((spell) => spell.level === 0));

  public readonly leveledSpellOptions = computed<readonly SrdSpell[]>(() => {
    const maxLevel = this.maxSpellLevel();
    return this.classSpells().filter((spell) => spell.level >= 1 && spell.level <= maxLevel);
  });

  public readonly spentCopper = computed(() => {
    const catalog = this.catalog();
    if (catalog === null) {
      return 0;
    }
    return this.store.build().equipment.reduce((total, entry) => {
      const item = catalog.items.find((candidate) => candidate.id === entry.itemId);
      return total + gpToCopper(item?.valueGp ?? 0) * entry.quantity;
    }, 0);
  });

  public readonly spent = computed(() => formatGp(this.spentCopper()));

  public readonly remainingGold = computed(() =>
    formatGp(gpToCopper(this.store.build().budgetGp) - this.spentCopper()));

  public readonly shopItems = computed<readonly SrdItem[]>(() => {
    const query = this.search().trim().toLowerCase();
    return (this.catalog()?.items ?? [])
      .filter((item) => query === '' || item.name.toLowerCase().includes(query))
      .slice(0, 60);
  });

  public readonly itemById = computed<ReadonlyMap<string, SrdItem>>(() =>
    new Map((this.catalog()?.items ?? []).map((item) => [item.id, item])));

  public readonly hasClassAndBackground = computed(() =>
    this.store.build().classId !== '' && this.store.build().backgroundId !== '');

  public readonly canFinish = computed(() =>
    (this.validation()?.ok ?? false) && this.store.name().trim().length > 0);

  public constructor() {
    effect(() => {
      if (!this.restored) {
        return;
      }
      const draft: StoredDraft = {
        version: 1,
        savedAt: new Date().toISOString(),
        step: this.store.step(),
        name: this.store.name(),
        alignment: this.store.alignment(),
        notes: this.store.notes(),
        build: this.store.build(),
      };
      try {
        localStorage.setItem(this.draftKey(), JSON.stringify(draft));
        this.savedAt.set(draft.savedAt);
      } catch {
        // nessuna bozza persistita: il wizard resta utilizzabile
      }
    });
  }

  public ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.store.loadCatalog();
    this.restore();
    this.restored = true;
  }

  public modifier(score: number): string {
    return formatModifier(abilityModifier(score));
  }

  public asText(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  public asNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  public asAbility(event: Event): Ability {
    const value = this.asText(event);
    return this.abilities.includes(value as Ability) ? value as Ability : 'str';
  }

  public asPattern(event: Event): '2-1' | '1-1-1' {
    return this.asText(event) === '1-1-1' ? '1-1-1' : '2-1';
  }

  public asAbilityMethod(event: Event): 'pointBuy' | 'standardArray' | 'rolled' | 'manual' {
    const value = this.asText(event);
    return value === 'standardArray' || value === 'rolled' || value === 'manual' ? value : 'pointBuy';
  }

  public stepErrors(step: BuildStep): BuildValidation['errors'] {
    return (this.validation()?.errors ?? []).filter((error) => error.step === step);
  }

  public stepIndex(step: BuildStep): number {
    return STEP_ORDER.indexOf(step);
  }

  public stepLabel(step: BuildStep): string {
    return WIZARD_STEPS[STEP_ORDER.indexOf(step)] ?? step;
  }

  public errorCount(index: number): number {
    const step = STEP_ORDER[index];
    return step === undefined ? 0 : this.stepErrors(step).length;
  }

  public isClassSkill(skill: Skill): boolean {
    return this.store.build().proficiencies.classSkills.includes(skill);
  }

  public isSpeciesSkill(skill: Skill): boolean {
    return this.store.build().proficiencies.speciesSkills.includes(skill);
  }

  public isExpertise(skill: Skill): boolean {
    return this.store.build().proficiencies.expertise.includes(skill);
  }

  public isMastery(itemId: string): boolean {
    return this.store.build().weaponMasteries.includes(itemId);
  }

  public isCantrip(spellId: string): boolean {
    return this.store.build().spells.cantrips.includes(spellId);
  }

  public isPrepared(spellId: string): boolean {
    const spells = this.store.build().spells;
    return this.preparedCaster()
      ? spells.prepared.includes(spellId)
      : spells.known.includes(spellId);
  }

  public itemName(itemId: string): string {
    return this.itemById().get(itemId)?.name ?? itemId;
  }

  public itemValue(itemId: string): number {
    return this.itemById().get(itemId)?.valueGp ?? 0;
  }

  public saveDraft(): void {
    this.restored = true;
    const draft: StoredDraft = {
      version: 1,
      savedAt: new Date().toISOString(),
      step: this.store.step(),
      name: this.store.name(),
      alignment: this.store.alignment(),
      notes: this.store.notes(),
      build: this.store.build(),
    };
    localStorage.setItem(this.draftKey(), JSON.stringify(draft));
    this.savedAt.set(draft.savedAt);
  }

  public async verifyOnServer(): Promise<void> {
    await this.store.checkBuild();
  }

  private classSpells(): readonly SrdSpell[] {
    const classId = this.store.build().classId;
    return (this.catalog()?.spells ?? []).filter((spell) => spell.classes.includes(classId));
  }

  private draftKey(): string {
    return `dnd-vtt.wizard.${this.campaignId()}.v1`;
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(this.draftKey());
      if (raw === null) {
        return;
      }
      const draft = JSON.parse(raw) as Partial<StoredDraft>;
      if (draft.version !== 1 || draft.build === undefined) {
        return;
      }
      this.store.restoreDraft({
        step: draft.step ?? 0,
        name: draft.name ?? '',
        alignment: draft.alignment ?? '',
        notes: draft.notes ?? '',
        build: draft.build,
      });
      this.savedAt.set(draft.savedAt ?? null);
    } catch {
      // bozza illeggibile: si riparte da zero
    }
  }
}
