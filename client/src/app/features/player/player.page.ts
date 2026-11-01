import { Component, type OnInit, computed, inject, input, signal } from '@angular/core';
import {
  abilityModifier,
  conditionNameSchema,
  currencyToCopper,
  formatGp,
  formatModifier,
  skills as ALL_SKILLS,
  type Ability,
  type Condition,
  type ConditionName,
  type PlayerSheetView,
} from '@dnd-vtt/shared';
import { MeasurementService } from '../../core/measurement.service';
import { ABILITY_LABELS, SKILL_LABELS, formatSenses, type SensesLike } from '../../core/labels';
import { httpMessage } from '../../core/http-error';
import { PlayerService } from '../../core/player.service';

type PlayerTab = 'combat' | 'abilities' | 'spells' | 'equipment' | 'notes' | 'rolls';

@Component({
  selector: 'app-player-page',
  templateUrl: './player.page.html',
  styleUrl: './player.page.scss',
})
export class PlayerPage implements OnInit {
  public readonly token = input.required<string>();
  private readonly players = inject(PlayerService);
  public readonly units = inject(MeasurementService);

  public readonly view = signal<PlayerSheetView | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly busy = signal(false);
  public readonly tab = signal<PlayerTab>('combat');
  public readonly damage = signal(5);
  public readonly heal = signal(5);
  public readonly condition = signal<ConditionName>('prone');
  public readonly conditionNames = conditionNameSchema.options;
  public readonly notesDraft = signal('');
  public readonly notesSaved = signal(false);

  public readonly tabs: { key: PlayerTab; label: string }[] = [
    { key: 'combat', label: 'Combattimento' },
    { key: 'abilities', label: 'Abilità' },
    { key: 'spells', label: 'Magia' },
    { key: 'equipment', label: 'Oggetti' },
    { key: 'notes', label: 'Note' },
    { key: 'rolls', label: 'Tiri' },
  ];

  public readonly abilities = computed(() => {
    const view = this.view();
    if (view === null) {
      return [];
    }
    return (Object.keys(ABILITY_LABELS) as Ability[]).map((ability) => ({
      key: ability,
      label: ABILITY_LABELS[ability],
      score: view.statblock.abilities[ability],
      modifier: formatModifier(abilityModifier(view.statblock.abilities[ability])),
    }));
  });

  public readonly skills = computed(() => {
    const view = this.view();
    if (view?.derived === null || view?.derived === undefined) {
      return [];
    }
    const pc = view.statblock.kind === 'pc' ? view.statblock : null;
    return ALL_SKILLS.map((skill) => ({
      label: SKILL_LABELS[skill],
      value: view.derived?.skills[skill] ?? 0,
      proficient: pc?.proficiencies.skills.includes(skill) ?? false,
    }));
  });

  public readonly currency = computed(() => {
    const view = this.view();
    return view?.statblock.kind === 'pc'
      ? formatGp(currencyToCopper(view.statblock.currency))
      : '';
  });

  public ngOnInit(): void {
    void this.load();
  }

  public senseText(senses: SensesLike): string {
    return formatSenses(senses, (feet) => this.units.formatDistance(feet));
  }

  public setTab(tab: PlayerTab): void {
    this.tab.set(tab);
  }

  public setDamage(event: Event): void {
    this.damage.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setHeal(event: Event): void {
    this.heal.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setCondition(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if ((conditionNameSchema.options as string[]).includes(value)) {
      this.condition.set(value as ConditionName);
    }
  }

  public setNotes(event: Event): void {
    this.notesDraft.set((event.target as HTMLTextAreaElement).value);
    this.notesSaved.set(false);
  }

  public async damageHp(): Promise<void> {
    await this.changeHp(-Math.abs(this.damage()));
  }

  public async healHp(): Promise<void> {
    await this.changeHp(Math.abs(this.heal()));
  }

  public async addCondition(): Promise<void> {
    const view = this.view();
    if (view === null || view.statblock.conditions.some((entry) => entry.name === this.condition())) {
      return;
    }
    const condition: Condition = { name: this.condition() };
    await this.patch({ conditions: [...view.statblock.conditions, condition] });
  }

  public async removeCondition(condition: Condition): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    await this.patch({
      conditions: view.statblock.conditions.filter((entry) => entry.name !== condition.name),
    });
  }

  public async saveNotes(): Promise<void> {
    await this.patch({ playerNotes: this.notesDraft() });
    this.notesSaved.set(true);
  }

  private async load(): Promise<void> {
    try {
      const view = await this.players.sheet(this.token());
      this.view.set(view);
      this.notesDraft.set(view.playerNotes);
      this.error.set(null);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async changeHp(delta: number): Promise<void> {
    const view = this.view();
    if (view === null || delta === 0) {
      return;
    }
    const hp = view.statblock.hp;
    await this.patch({
      hp: { ...hp, current: Math.max(0, Math.min(hp.max, hp.current + delta)) },
    });
  }

  private async patch(patch: {
    hp?: PlayerSheetView['statblock']['hp'];
    conditions?: Condition[];
    playerNotes?: string;
  }): Promise<void> {
    const view = this.view();
    if (view === null || !view.editingEnabled) {
      return;
    }
    this.busy.set(true);
    try {
      const updated = await this.players.patch(this.token(), {
        sheetVersion: view.sheetVersion,
        patch,
      });
      this.view.set(updated);
      this.error.set(null);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  private messageFor(error: unknown): string {
    return httpMessage(error, {
      fallback: 'Scheda non disponibile.',
      byStatus: {
        403: 'La matita è spenta: il master ha bloccato le modifiche.',
        409: 'La scheda è stata aggiornata dal master: ricarica la pagina.',
        404: 'Questo link non è più valido.',
      },
    });
  }
}
