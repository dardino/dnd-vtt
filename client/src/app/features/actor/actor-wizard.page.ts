import { HttpErrorResponse } from '@angular/common/http';
import { Component, type OnInit, computed, inject, input, signal } from '@angular/core';
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
import { ActorService } from '../../core/actor.service';
import { MeasurementService } from '../../core/measurement.service';
import { SrdCatalogService } from '../../core/srd-catalog.service';

type FeatureKind = 'traits' | 'actions' | 'reactions';
type Recharge = 'short' | 'long' | 'none';

interface FeatureDraft {
  name: string;
  description: string;
  recharge: Recharge;
}

const STEPS = ['Tipo', 'SRD', 'Caratteristiche', 'Sensi', 'Tratti', 'Riepilogo'] as const;

const SIZE_LABELS: Record<Size, string> = {
  tiny: 'Minuscola',
  small: 'Piccola',
  medium: 'Media',
  large: 'Grande',
  huge: 'Enorme',
  gargantuan: 'Mastodontica',
};

@Component({
  selector: 'app-actor-wizard',
  imports: [RouterLink],
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
  public readonly abilityLabels: Record<Ability, string> = {
    str: 'Forza',
    dex: 'Destrezza',
    con: 'Costituzione',
    int: 'Intelligenza',
    wis: 'Saggezza',
    cha: 'Carisma',
  };

  public readonly featureGroups = [
    { key: 'traits' as const, label: 'Tratti' },
    { key: 'actions' as const, label: 'Azioni' },
    { key: 'reactions' as const, label: 'Reazioni' },
  ];

  public readonly step = signal(0);
  public readonly actorKind = signal<'monster' | 'npc'>('monster');
  public readonly name = signal('');
  public readonly creatureType = signal('Humanoid');
  public readonly cr = signal('0');
  public readonly role = signal('');
  public readonly size = signal<Size>('medium');
  public readonly abilities = signal({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });

  public readonly hpMax = signal(10);
  public readonly ac = signal(10);
  public readonly speed = signal(30);
  public readonly senses = signal({ darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0 });
  public readonly languages = signal('Common');
  public readonly traits = signal<FeatureDraft[]>([]);
  public readonly actions = signal<FeatureDraft[]>([]);
  public readonly reactions = signal<FeatureDraft[]>([]);
  public readonly notes = signal('');
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
    const kind = this.actorKind();
    const abilities = this.abilities();
    const hp = Math.max(1, this.hpMax());
    const senses = this.senses();
    const common = {
      size: this.size(),
      abilities,
      hp: { current: hp, max: hp, temp: 0 },
      speed: { walk: Math.max(0, this.speed()) },
      senses: {
        ...(senses.darkvision > 0 ? { darkvision: senses.darkvision } : {}),
        ...(senses.blindsight > 0 ? { blindsight: senses.blindsight } : {}),
        ...(senses.tremorsense > 0 ? { tremorsense: senses.tremorsense } : {}),
        ...(senses.truesight > 0 ? { truesight: senses.truesight } : {}),
      },
      languages: this.languages().split(',').map((entry) => entry.trim()).filter(Boolean),
      conditions: [],
      creatureType: this.creatureType().trim() || 'Humanoid',
      cr: this.cr().trim() || '0',
      tags: [],
      ac: Math.max(0, this.ac()),
      damageResistances: [],
      damageImmunities: [],
      damageVulnerabilities: [],
      conditionImmunities: [],
      traits: this.traits().map(featureBlock),
      actions: this.actions().map(featureBlock),
      reactions: this.reactions().map(featureBlock),
    };
    if (kind === 'npc') {
      const npc: NpcStatblock = {
        kind: 'npc',
        ...common,
        ...(this.role().trim() === '' ? {} : { role: this.role().trim() }),
      };
      return npc;
    }
    const monster: MonsterStatblock = { kind: 'monster', ...common };
    return monster;
  });

  public readonly canSave = computed(() =>
    this.name().trim() !== '' && this.hpMax() > 0 && this.ac() >= 0);

  public ngOnInit(): void {
    this.actorKind.set(this.kind() === 'npc' ? 'npc' : 'monster');
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
    this.actorKind.set('monster');
    this.name.set(monster.name);
    this.creatureType.set(statblock.creatureType);
    this.cr.set(statblock.cr);
    this.size.set(statblock.size);
    this.abilities.set({ ...statblock.abilities });
    this.hpMax.set(statblock.hp.max);
    this.ac.set(statblock.ac);
    this.speed.set(statblock.speed.walk);
    this.senses.set({
      darkvision: statblock.senses.darkvision ?? 0,
      blindsight: statblock.senses.blindsight ?? 0,
      tremorsense: statblock.senses.tremorsense ?? 0,
      truesight: statblock.senses.truesight ?? 0,
    });
    this.languages.set(statblock.languages.join(', '));
    this.traits.set(statblock.traits.map(toDraft));
    this.actions.set(statblock.actions.map(toDraft));
    this.reactions.set(statblock.reactions.map(toDraft));
    this.step.set(2);
  }

  public setKind(kind: 'monster' | 'npc'): void {
    this.actorKind.set(kind);
  }

  public setText(signalValue: { set: (value: string) => void }, event: Event): void {
    signalValue.set((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value);
  }

  public setNumber(signalValue: { set: (value: number) => void }, event: Event): void {
    signalValue.set(Number((event.target as HTMLInputElement).value));
  }

  public setFeet(signalValue: { set: (value: number) => void }, event: Event): void {
    signalValue.set(this.units.feetFromInput(Number((event.target as HTMLInputElement).value)));
  }

  public setSize(event: Event): void {
    this.size.set((event.target as HTMLSelectElement).value as Size);
  }

  public featureList(kind: FeatureKind): FeatureDraft[] {
    return kind === 'traits' ? this.traits() : kind === 'actions' ? this.actions() : this.reactions();
  }

  public setAbility(ability: Ability, event: Event): void {
    this.abilities.update((values) => ({
      ...values,
      [ability]: Number((event.target as HTMLInputElement).value),
    }));
  }

  public setSense(sense: 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight', event: Event): void {
    this.senses.update((values) => ({
      ...values,
      [sense]: this.units.feetFromInput(Number((event.target as HTMLInputElement).value)),
    }));
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
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const actor = await this.actors.createActor({
        campaignId: this.campaignId(),
        kind: this.actorKind(),
        name: this.name().trim(),
        statblock: this.statblock(),
        ...(this.notes().trim() === '' ? {} : { dmNotes: this.notes() }),
      });
      await this.router.navigate([
        '/dm/campaigns', this.campaignId(), 'actors', actor.id, 'sheet',
      ]);
    } catch (error) {
      this.saveError.set(error instanceof HttpErrorResponse && error.status === 404
        ? 'La campagna non esiste più.'
        : 'Salvataggio non riuscito. Controlla i campi e riprova.');
    } finally {
      this.saving.set(false);
    }
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
