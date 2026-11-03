import { Component, type OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { FormField, form as createForm, max, min, required, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  srdMonsterToStatblock,
  type Ability,
  type ActorStatblock,
  type MonsterStatblock,
  type NpcStatblock,
  type Size,
  type SrdMonster,
} from '@dnd-vtt/shared';
import { ActorService } from '../../core/services/actor.service';
import { httpMessage } from '../../core/api/http-error';
import { ABILITY_LABELS, SIZE_LABELS } from '../../core/ui/labels';
import {
  MeasurementService,
  feetToMeters,
  metersToFeet,
  type MeasurementUnit,
} from '../../core/ui/measurement.service';
import { SrdCatalogService } from '../../core/services/srd-catalog.service';

type FeatureKind = 'traits' | 'actions' | 'reactions';
type Recharge = 'short' | 'long' | 'none';

interface FeatureDraft {
  name: string;
  description: string;
  recharge: Recharge;
}

export interface ActorWizardSenses {
  darkvision: number;
  blindsight: number;
  tremorsense: number;
  truesight: number;
}

export interface ActorWizardFormModel {
  actorKind: 'monster' | 'npc';
  name: string;
  creatureType: string;
  cr: string;
  role: string;
  size: Size;
  hpMax: number;
  ac: number;
  speed: number;
  languages: string;
  notes: string;
  abilities: Record<Ability, number>;
  senses: ActorWizardSenses;
}

const STEPS = ['Tipo', 'SRD', 'Caratteristiche', 'Sensi', 'Tratti', 'Riepilogo'] as const;

const convertDistance = (
  value: number,
  from: MeasurementUnit,
  to: MeasurementUnit,
): number => {
  if (from === to || !Number.isFinite(value)) {
    return value;
  }
  return to === 'metric' ? feetToMeters(value) : metersToFeet(value);
};

@Component({
  selector: 'app-actor-wizard',
  imports: [FormField, RouterLink],
  templateUrl: './actor-wizard.page.html',
  styleUrl: './actor-wizard.page.scss',
})
export class ActorWizardPage implements OnInit {
  public readonly campaignId = input.required<string>();
  public readonly kind = input<string>('monster');

  private readonly actors = inject(ActorService);
  private readonly router = inject(Router);
  public readonly catalogService = inject(SrdCatalogService);
  public readonly units = inject(MeasurementService);

  public readonly steps = STEPS;
  public readonly sizes = Object.keys(SIZE_LABELS) as Size[];
  public readonly sizeLabels = SIZE_LABELS;
  public readonly abilityKeys: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  public readonly abilityLabels = ABILITY_LABELS;

  public readonly featureGroups = [
    { key: 'traits' as const, label: 'Tratti' },
    { key: 'actions' as const, label: 'Azioni' },
    { key: 'reactions' as const, label: 'Reazioni' },
  ];

  public readonly step = signal(0);

  private previousUnit = this.units.unit();

  private readonly model = signal<ActorWizardFormModel>({
    actorKind: 'monster',
    name: '',
    creatureType: 'Humanoid',
    cr: '0',
    role: '',
    size: 'medium',
    hpMax: 10,
    ac: 10,
    speed: this.units.inputValue(30),
    languages: 'Comune',
    notes: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    senses: {
      darkvision: this.units.inputValue(0),
      blindsight: this.units.inputValue(0),
      tremorsense: this.units.inputValue(0),
      truesight: this.units.inputValue(0),
    },
  });

  public readonly form = createForm(this.model, (path) => {
    required(path.name, { message: 'Inserisci un nome.' });
    validate(path.name, ({ value }) => value() !== '' && value().trim() === ''
      ? { kind: 'blank', message: 'Il nome non può essere composto solo da spazi.' }
      : null);
    required(path.hpMax, { message: 'Inserisci i punti ferita massimi.' });
    min(path.hpMax, 1, { message: 'I punti ferita massimi devono essere almeno 1.' });
    required(path.ac, { message: 'Inserisci la classe armatura.' });
    min(path.ac, 0, { message: 'La classe armatura non può essere negativa.' });
    required(path.speed, { message: 'Inserisci la velocità.' });
    min(path.speed, 0, { message: 'La velocità non può essere negativa.' });
    for (const ability of this.abilityKeys) {
      min(path.abilities[ability], 1, { message: 'Le caratteristiche partono da 1.' });
      max(path.abilities[ability], 30, { message: 'Le caratteristiche arrivano al massimo a 30.' });
    }
    min(path.senses.darkvision, 0, { message: 'I sensi non possono essere negativi.' });
    min(path.senses.blindsight, 0, { message: 'I sensi non possono essere negativi.' });
    min(path.senses.tremorsense, 0, { message: 'I sensi non possono essere negativi.' });
    min(path.senses.truesight, 0, { message: 'I sensi non possono essere negativi.' });
  });

  public readonly traits = signal<FeatureDraft[]>([]);
  public readonly actions = signal<FeatureDraft[]>([]);
  public readonly reactions = signal<FeatureDraft[]>([]);
  public readonly search = signal('');
  public readonly saving = signal(false);
  public readonly saveError = signal<string | null>(null);

  public readonly importable = computed<readonly SrdMonster[]>(() => {
    const query = this.search().trim().toLowerCase();
    const monsters = this.catalogService.catalog()?.monsters ?? [];
    return monsters
      .filter((monster) => query === '' || monster.name.toLowerCase().includes(query))
      .slice(0, 40);
  });

  public readonly statblock = computed<ActorStatblock>(() => {
    const model = this.form().value();
    const hp = Math.max(1, model.hpMax);
    const senses = {
      darkvision: this.toFeet(model.senses.darkvision),
      blindsight: this.toFeet(model.senses.blindsight),
      tremorsense: this.toFeet(model.senses.tremorsense),
      truesight: this.toFeet(model.senses.truesight),
    };
    const common = {
      size: model.size,
      abilities: model.abilities,
      hp: { current: hp, max: hp, temp: 0 },
      speed: { walk: this.toFeet(model.speed) },
      senses: {
        ...(senses.darkvision > 0 ? { darkvision: senses.darkvision } : {}),
        ...(senses.blindsight > 0 ? { blindsight: senses.blindsight } : {}),
        ...(senses.tremorsense > 0 ? { tremorsense: senses.tremorsense } : {}),
        ...(senses.truesight > 0 ? { truesight: senses.truesight } : {}),
      },
      languages: model.languages.split(',').map((entry) => entry.trim()).filter(Boolean),
      conditions: [],
      creatureType: model.creatureType.trim() || 'Humanoid',
      cr: model.cr.trim() || '0',
      tags: [],
      ac: Math.max(0, model.ac),
      damageResistances: [],
      damageImmunities: [],
      damageVulnerabilities: [],
      conditionImmunities: [],
      traits: this.traits().map(featureBlock),
      actions: this.actions().map(featureBlock),
      reactions: this.reactions().map(featureBlock),
    };
    if (model.actorKind === 'npc') {
      const npc: NpcStatblock = {
        kind: 'npc',
        ...common,
        ...(model.role.trim() === '' ? {} : { role: model.role.trim() }),
      };
      return npc;
    }
    const monster: MonsterStatblock = { kind: 'monster', ...common };
    return monster;
  });

  public readonly canSave = computed(() => this.form().valid());

  public constructor() {
    // Il modello salva le distanze nell'unità scelta: al cambio unità vanno convertite.
    // La conversione metric→imperial arrotonda ai piedi (perdita accettata).
    effect(() => {
      const unit = this.units.unit();
      if (unit === this.previousUnit) {
        return;
      }
      const previous = this.previousUnit;
      this.previousUnit = unit;
      const toUnit = (value: number): number => convertDistance(value, previous, unit);
      this.form().value.update((model) => ({
        ...model,
        speed: toUnit(model.speed),
        senses: {
          darkvision: toUnit(model.senses.darkvision),
          blindsight: toUnit(model.senses.blindsight),
          tremorsense: toUnit(model.senses.tremorsense),
          truesight: toUnit(model.senses.truesight),
        },
      }));
    });
  }

  public ngOnInit(): void {
    this.form().reset({
      ...this.form().value(),
      actorKind: this.kind() === 'npc' ? 'npc' : 'monster',
    });
    void this.catalogService.load();
  }

  public next(): void {
    this.step.update((value) => Math.min(this.steps.length - 1, value + 1));
  }

  public previous(): void {
    this.step.update((value) => Math.max(0, value - 1));
  }

  public importMonster(monster: SrdMonster): void {
    const statblock = srdMonsterToStatblock(monster);
    const current = this.form().value();
    this.form().reset({
      actorKind: 'monster',
      name: monster.name,
      creatureType: statblock.creatureType,
      cr: statblock.cr,
      role: current.role,
      size: statblock.size,
      hpMax: statblock.hp.max,
      ac: statblock.ac,
      speed: this.units.inputValue(statblock.speed.walk),
      languages: statblock.languages.join(', '),
      notes: current.notes,
      abilities: { ...statblock.abilities },
      senses: {
        darkvision: this.units.inputValue(statblock.senses.darkvision ?? 0),
        blindsight: this.units.inputValue(statblock.senses.blindsight ?? 0),
        tremorsense: this.units.inputValue(statblock.senses.tremorsense ?? 0),
        truesight: this.units.inputValue(statblock.senses.truesight ?? 0),
      },
    });
    this.traits.set(statblock.traits.map(toDraft));
    this.actions.set(statblock.actions.map(toDraft));
    this.reactions.set(statblock.reactions.map(toDraft));
    this.step.set(2);
  }

  public setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  public featureList(kind: FeatureKind): FeatureDraft[] {
    return kind === 'traits' ? this.traits() : kind === 'actions' ? this.actions() : this.reactions();
  }

  public addFeature(kind: FeatureKind): void {
    this.list(kind).update((values) => [...values, { name: '', description: '', recharge: 'none' }]);
  }

  public removeFeature(kind: FeatureKind, index: number): void {
    this.list(kind).update((values) => values.filter((_, position) => position !== index));
  }

  public updateFeature(kind: FeatureKind, index: number, field: keyof FeatureDraft, event: Event): void {
    const value = field === 'recharge'
      ? (event.target as HTMLSelectElement).value as Recharge
      : (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.list(kind).update((values) => values.map((entry, position) =>
      position === index ? { ...entry, [field]: value } : entry));
  }

  public async save(): Promise<void> {
    if (!this.canSave() || this.saving()) {
      return;
    }
    const model = this.form().value();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const actor = await this.actors.createActor({
        campaignId: this.campaignId(),
        kind: model.actorKind,
        name: model.name.trim(),
        statblock: this.statblock(),
        ...(model.notes.trim() === '' ? {} : { dmNotes: model.notes }),
      });
      await this.router.navigate([
        '/dm/campaigns', this.campaignId(), 'actors', actor.id, 'sheet',
      ]);
    } catch (error) {
      this.saveError.set(httpMessage(error, {
        fallback: 'Salvataggio non riuscito. Controlla i campi e riprova.',
        byStatus: { 404: 'La campagna non esiste più.' },
      }));
    } finally {
      this.saving.set(false);
    }
  }

  private toFeet(value: number): number {
    return this.units.feetFromInput(value);
  }

  private list(kind: FeatureKind) {
    return kind === 'traits' ? this.traits : kind === 'actions' ? this.actions : this.reactions;
  }
}

const featureBlock = (draft: FeatureDraft) => ({
  name: draft.name.trim() || 'Senza nome',
  description: draft.description,
  recharge: draft.recharge,
});

const toDraft = (feature: { name: string; description: string; recharge: Recharge }): FeatureDraft => ({
  name: feature.name,
  description: feature.description,
  recharge: feature.recharge,
});
