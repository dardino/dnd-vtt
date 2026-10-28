import { HttpErrorResponse } from '@angular/common/http';
import { Component, type OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  abilityModifier,
  currencyToCopper,
  formatGp,
  formatModifier,
  skills as ALL_SKILLS,
  type Ability,
  type DmSheetView,
  type PcStatblock,
  type Skill,
} from '@dnd-vtt/shared';
import { ActorService } from '../../core/actor.service';

type SheetTab = 'combat' | 'abilities' | 'spells' | 'equipment' | 'features' | 'notes';

const ABILITY_LABELS: Record<Ability, string> = {
  str: 'Forza',
  dex: 'Destrezza',
  con: 'Costituzione',
  int: 'Intelligenza',
  wis: 'Saggezza',
  cha: 'Carisma',
};

const SKILL_LABELS: Record<Skill, string> = {
  acrobatics: 'Acrobazia',
  animalHandling: 'Addestrare animali',
  arcana: 'Arcano',
  athletics: 'Atletica',
  deception: 'Inganno',
  history: 'Storia',
  insight: 'Intuizione',
  intimidation: 'Intimidazione',
  investigation: 'Indagare',
  medicine: 'Medicina',
  nature: 'Natura',
  perception: 'Percezione',
  performance: 'Intrattenere',
  persuasion: 'Persuasione',
  religion: 'Religione',
  sleightOfHand: 'Mano di prestigio',
  stealth: 'Furtività',
  survival: 'Sopravvivenza',
};

@Component({
  selector: 'app-actor-sheet',
  imports: [RouterLink],
  templateUrl: './actor-sheet.page.html',
  styleUrl: './actor-sheet.page.scss',
})
export class ActorSheetPage implements OnInit {
  public readonly campaignId = input.required<string>();
  public readonly actorId = input.required<string>();

  private readonly actorsApi = inject(ActorService);

  public readonly view = signal<DmSheetView | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly tab = signal<SheetTab>('combat');
  public readonly notesDraft = signal('');
  public readonly savingNotes = signal(false);
  public readonly notesSaved = signal(false);

  public readonly abilities = computed<{ key: Ability; label: string; score: number; modifier: number }[]>(() => {
    const statblock = this.view()?.statblock;
    if (statblock === undefined) {
      return [];
    }
    return (Object.keys(ABILITY_LABELS) as Ability[]).map((key) => ({
      key,
      label: ABILITY_LABELS[key],
      score: statblock.abilities[key],
      modifier: abilityModifier(statblock.abilities[key]),
    }));
  });

  public readonly skills = computed<{ label: string; value: number; proficient: boolean }[]>(() => {
    const current = this.view();
    const derived = current?.derived;
    if (derived === null || derived === undefined) {
      return [];
    }
    const statblock = current?.statblock.kind === 'pc' ? current.statblock : null;
    return ALL_SKILLS.map((skill) => ({
      label: SKILL_LABELS[skill],
      value: derived.skills[skill],
      proficient: statblock?.proficiencies.skills.includes(skill) ?? false,
    }));
  });

  public readonly saves = computed(() => {
    const derived = this.view()?.derived;
    if (derived === null || derived === undefined) {
      return [];
    }
    return (Object.keys(ABILITY_LABELS) as Ability[]).map((key) => ({
      label: ABILITY_LABELS[key],
      value: derived.saves[key],
    }));
  });

  public readonly currency = computed(() => {
    const statblock = this.view()?.statblock;
    return statblock?.kind === 'pc' ? formatGp(currencyToCopper(statblock.currency)) : '';
  });

  public readonly tabs = computed<{ key: SheetTab; label: string }[]>(() => {
    const current = this.view();
    const isPc = current?.statblock.kind === 'pc';
    const tabs: { key: SheetTab; label: string }[] = [
      { key: 'combat', label: 'Combattimento' },
      { key: 'abilities', label: 'Abilità' },
    ];
    if (isPc) {
      tabs.push({ key: 'spells', label: 'Incantesimi' });
      tabs.push({ key: 'equipment', label: 'Equipaggiamento' });
    }
    tabs.push({ key: 'features', label: isPc ? 'Privilegi' : 'Tratti e azioni' });
    tabs.push({ key: 'notes', label: 'Note' });
    return tabs;
  });

  public readonly pc = computed<PcStatblock | null>(() => {
    const statblock = this.view()?.statblock;
    return statblock?.kind === 'pc' ? statblock : null;
  });

  public ngOnInit(): void {
    void this.load();
  }

  public setTab(tab: SheetTab): void {
    this.tab.set(tab);
  }

  public setNotes(event: Event): void {
    this.notesDraft.set((event.target as HTMLTextAreaElement).value);
    this.notesSaved.set(false);
  }

  public async saveNotes(): Promise<void> {
    const current = this.view();
    if (current === null || this.savingNotes()) {
      return;
    }
    this.savingNotes.set(true);
    this.notesSaved.set(false);
    try {
      if (current.statblock.kind === 'pc') {
        const updated = await this.actorsApi.patchSheet(this.actorId(), {
          sheetVersion: current.sheetVersion,
          patch: { dmNotes: this.notesDraft() },
        });
        this.view.set(updated);
      } else {
        const actor = await this.actorsApi.patchActor(this.actorId(), {
          dmNotes: this.notesDraft(),
        });
        this.view.set({ ...current, actor });
      }
      this.notesSaved.set(true);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.savingNotes.set(false);
    }
  }

  public modifier(value: number): string {
    return formatModifier(abilityModifier(value));
  }

  public speedText(speed: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number }): string {
    const labels = { walk: 'camminata', fly: 'volo', swim: 'nuoto', climb: 'scalata', burrow: 'scavo' } as const;
    return (['walk', 'fly', 'swim', 'climb', 'burrow'] as const)
      .flatMap((mode) => (speed[mode] === undefined ? [] : [`${labels[mode]} ${speed[mode]} ft`]))
      .join(' · ');
  }

  private async load(): Promise<void> {
    try {
      const view = await this.actorsApi.getSheet(this.actorId());
      this.view.set(view);
      this.notesDraft.set(view.actor.dmNotes ?? '');
      this.error.set(null);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.loading.set(false);
    }
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return 'Attore non trovato.';
    }
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'La scheda è stata modificata altrove: ricarica la pagina.';
    }
    return 'Impossibile caricare la scheda.';
  }
}
