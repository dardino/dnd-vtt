import {
  Component,
  type OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { applyWhen, form, max, maxLength, min, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import {
  abilityModifier,
  currencyToCopper,
  DEFAULT_ACTOR_PORTRAIT,
  formatGp,
  formatModifier,
  skills as ALL_SKILLS,
  xpForNextLevel,
  xpThresholdForLevel,
  type Ability,
  type ActorPortrait,
  type Campaign,
  type Condition,
  type DmSheetView,
  type LevelUpInput,
  type LevelUpPreview,
  type PcStatblock,
  type ResolvedItem,
  type ResourcePool,
  type SrdClass,
} from '@dnd-vtt/shared';
import { ActorService } from '../../core/actor.service';
import {
  ABILITY_LABELS,
  SKILL_LABELS,
  formatSenses,
  formatSpeeds,
  type SensesLike,
  type SpeedLike,
} from '../../core/labels';
import { httpMessage, serverMessage } from '../../core/http-error';
import { AssetService } from '../../core/asset.service';
import { CampaignService } from '../../core/campaign.service';
import { MeasurementService } from '../../core/measurement.service';
import { PlayerService } from '../../core/player.service';
import { SceneActionService } from '../../core/scene-action.service';
import { SrdCatalogService } from '../../core/srd-catalog.service';
import {
  ActorSheetCombatPanel,
  type CombatHpChange,
} from './actor-sheet-combat-panel';
import {
  ActorSheetInventoryPanel,
  type InventoryPanelItem,
} from './actor-sheet-inventory-panel';
import {
  ActorSheetLevelUpDialog,
  type LevelUpFormState,
} from './actor-sheet-level-up-dialog';
import { ActorSheetNotesPanel } from './actor-sheet-notes-panel';
import { ActorSheetPlayerLink } from './actor-sheet-player-link';
import {
  ActorSheetPortraitEditor,
  type PortraitFocus,
} from './actor-sheet-portrait-editor';
import {
  ActorSheetSpellPanel,
  type SpellPanelPactSlot,
  type SpellPanelSlot,
  type SpellPanelSpell,
} from './actor-sheet-spell-panel';

type SheetTab = 'combat' | 'abilities' | 'spells' | 'equipment' | 'features' | 'notes';

interface NotesFormModel {
  notes: string;
}

/** Stesso limite di `actorPatchSchema.dmNotes` in `@dnd-vtt/shared`. */
const NOTES_MAX_LENGTH = 20000;

@Component({
  selector: 'app-actor-sheet',
  imports: [
    RouterLink,
    ActorSheetCombatPanel,
    ActorSheetInventoryPanel,
    ActorSheetLevelUpDialog,
    ActorSheetNotesPanel,
    ActorSheetPlayerLink,
    ActorSheetPortraitEditor,
    ActorSheetSpellPanel,
  ],
  templateUrl: './actor-sheet.page.html',
  styleUrl: './actor-sheet.page.scss',
})
export class ActorSheetPage implements OnInit {
  public readonly campaignId = input.required<string>();
  public readonly actorId = input.required<string>();

  private readonly actorsApi = inject(ActorService);
  private readonly assetsApi = inject(AssetService);
  private readonly campaignsApi = inject(CampaignService);
  private readonly sceneActions = inject(SceneActionService);
  private readonly catalogService = inject(SrdCatalogService);
  private readonly players = inject(PlayerService);
  public readonly units = inject(MeasurementService);

  public readonly view = signal<DmSheetView | null>(null);
  public readonly campaign = signal<Campaign | null>(null);
  public readonly combatSceneId = signal<string | null>(null);
  public readonly tokenId = signal<string | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly tab = signal<SheetTab>('combat');
  private readonly notesModel = signal<NotesFormModel>({ notes: '' });
  public readonly notesForm = form(this.notesModel, (path) => {
    maxLength(path.notes, NOTES_MAX_LENGTH, {
      message: `Le note non possono superare ${NOTES_MAX_LENGTH} caratteri.`,
    });
  });

  /** Alias scrivibile del campo: test e metodi esistenti continuano a usare il signal. */
  public readonly notesDraft = this.notesForm.notes().value;
  public readonly nameDraft = signal('');
  public readonly editMode = signal(false);
  public readonly portraitUrl = signal<string | null>(null);
  public readonly portraitFocusX = signal(DEFAULT_ACTOR_PORTRAIT.focusX);
  public readonly portraitFocusY = signal(DEFAULT_ACTOR_PORTRAIT.focusY);
  public readonly portraitZoom = signal(DEFAULT_ACTOR_PORTRAIT.zoom);
  public readonly portraitBusy = signal(false);
  public readonly savingNotes = signal(false);
  public readonly notesSaved = signal(false);
  public readonly busy = signal(false);
  public readonly xpDraft = signal(0);
  public readonly levelUpOpen = signal(false);
  public readonly levelUpPreview = signal<LevelUpPreview | null>(null);
  public readonly levelUpError = signal<string | null>(null);
  public readonly levelUpBusy = signal(false);

  public readonly restBusy = signal(false);
  public readonly playerUrl = signal<string | null>(null);
  public readonly playerEditing = signal(true);
  public readonly playerLinkBusy = signal(false);
  public readonly playerLinkError = signal<string | null>(null);

  public constructor() {
    // Anche una modifica arrivata da `[formField]` invalida la conferma "Salvate.".
    effect(() => {
      this.notesDraft();
      this.notesSaved.set(false);
    });
  }

  public readonly abilities = computed<
    { key: Ability; label: string; score: number; modifier: number }[]
  >(() => {
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

  public readonly inventoryItems = computed<readonly InventoryPanelItem[]>(() =>
    (this.view()?.inventory ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      range: this.itemRange(item),
      valueGp: item.valueGp ?? 0,
    })));

  public readonly spellSlots = computed<readonly SpellPanelSlot[]>(() =>
    this.pc()?.spells.slots ?? []);

  public readonly pactSlots = computed<SpellPanelPactSlot | null>(() => {
    const pact = this.pc()?.spells.pactSlots;
    return pact === undefined
      ? null
      : { level: pact.level, used: pact.used, max: pact.max };
  });

  public readonly spellCards = computed<readonly SpellPanelSpell[]>(() => {
    const pc = this.pc();
    if (pc === null) {
      return [];
    }
    return pc.snapshot.spells.map((spell) => ({
      id: spell.id,
      name: spell.name,
      level: spell.level,
      meta: [
        spell.school,
        spell.castingTime,
        this.spellRangeText(spell.range),
        spell.components,
        spell.duration,
      ].join(' · '),
      description: this.formatRulesText(spell.description),
    }));
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

  public readonly onMap = computed(() => this.tokenId() !== null && this.combatSceneId() !== null);
  public readonly currentXp = computed(() => this.view()?.actor.xp ?? 0);
  public readonly nextXp = computed(() => {
    const pc = this.pc();
    return pc === null ? null : xpForNextLevel(pc.class.level, this.currentXp()) ?? null;
  });

  public readonly xpAtLevel = computed(() => {
    const pc = this.pc();
    return pc === null ? 0 : xpThresholdForLevel(pc.class.level);
  });

  public readonly canLevelUp = computed(() => {
    const pc = this.pc();
    const campaign = this.campaign();
    if (pc === null || campaign === null || pc.class.level >= 20) {
      return false;
    }
    return campaign.advancementMode === 'milestone'
      || this.currentXp() >= xpThresholdForLevel(pc.class.level + 1);
  });

  public readonly levelUpClass = computed<SrdClass | null>(() => {
    const pc = this.pc();
    if (pc === null) {
      return null;
    }
    return this.catalogService.catalog()?.classes.find((entry) => entry.id === pc.class.id) ?? null;
  });

  public readonly levelUpSubclasses = computed(() => {
    const characterClass = this.levelUpClass();
    const pc = this.pc();
    if (characterClass === null || pc === null) {
      return [];
    }
    return characterClass.subclasses.filter((entry) =>
      pc.class.subclassId === undefined || entry.id === pc.class.subclassId);
  });

  public readonly levelUpNeedsSubclass = computed(() => {
    const characterClass = this.levelUpClass();
    const pc = this.pc();
    return characterClass !== null
      && pc !== null
      && pc.class.subclassId === undefined
      && characterClass.subclassLevel <= pc.class.level + 1;
  });

  public readonly levelUpIsAsi = computed(() => {
    const characterClass = this.levelUpClass();
    const pc = this.pc();
    return characterClass !== null
      && pc !== null
      && characterClass.asiLevels.includes(pc.class.level + 1);
  });

  public readonly levelUpFeats = computed(() => {
    const pc = this.pc();
    return this.catalogService.catalog()?.feats.filter((feat) =>
      pc !== null && (feat.minLevel ?? 1) <= pc.class.level + 1) ?? [];
  });

  private readonly levelUpModel = signal<LevelUpFormState>({
    hpMethod: 'average',
    hpRoll: 6,
    subclass: '',
    asiPrimary: 'str',
    asiSecondary: 'con',
    asiSplit: false,
    feat: '',
  });

  public readonly levelUpForm = form(this.levelUpModel, (path) => {
    applyWhen(path.hpRoll, ({ valueOf }) => valueOf(path.hpMethod) === 'roll', (hpRoll) => {
      min(hpRoll, 1, { message: 'Il tiro deve essere almeno 1.' });
      max(hpRoll, () => this.pc()?.hitDice.die ?? 1, {
        message: () =>
          `Il tiro non può superare il dado vita (d${this.pc()?.hitDice.die ?? '—'}).`,
      });
    });
    required(path.subclass, {
      when: () => this.levelUpNeedsSubclass(),
      message: 'Scegli una sottoclasse.',
    });
  });

  public ngOnInit(): void {
    void this.load();
  }

  public setTab(tab: SheetTab): void {
    this.tab.set(tab);
  }

  public async saveNotes(): Promise<void> {
    const current = this.view();
    if (current === null || this.savingNotes()) {
      return;
    }
    this.savingNotes.set(true);
    this.notesSaved.set(false);
    try {
      await submit(this.notesForm, {
        action: async () => {
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
          return undefined;
        },
      });
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.savingNotes.set(false);
    }
  }

  public modifier(value: number): string {
    return formatModifier(abilityModifier(value));
  }

  public setXpDraft(event: Event): void {
    this.xpDraft.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public async onHpChange(change: CombatHpChange): Promise<void> {
    if (change.mode === 'temp') {
      await this.applyTempHp(change.amount);
      return;
    }
    const amount = Math.abs(change.amount);
    await this.changeHp(change.mode === 'damage' ? -amount : amount);
  }

  public async applyTempHp(amount: number): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    const hp = { ...view.statblock.hp, temp: Math.max(0, amount) };
    await this.withBusy(async () => {
      if (this.onMap()) {
        await this.sceneActions.send(this.campaignId(), this.combatSceneId() ?? '', {
          type: 'token.update',
          tokenId: this.tokenId() ?? '',
          patch: { hp },
        });
      } else if (this.pc() !== null) {
        await this.patch({ hp });
      }
      await this.reload();
    });
  }

  public async addCondition(condition: Condition): Promise<void> {
    const view = this.view();
    if (view === null || view.statblock.conditions.some((entry) => entry.name === condition.name)) {
      return;
    }
    await this.changeCondition(condition, 'add');
  }

  public async toggleCondition(condition: Condition): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    const active = view.statblock.conditions.some((entry) => entry.name === condition.name);
    await this.changeCondition(condition, active ? 'remove' : 'add');
  }

  private async changeCondition(condition: Condition, op: 'add' | 'remove'): Promise<void> {
    const view = this.view();
    const pc = this.pc();
    if (view === null) {
      return;
    }
    await this.withBusy(async () => {
      if (this.onMap()) {
        await this.sceneActions.send(this.campaignId(), this.combatSceneId() ?? '', {
          type: 'token.condition',
          tokenId: this.tokenId() ?? '',
          op,
          condition,
        });
      } else if (pc !== null) {
        await this.patch({
          conditions: op === 'add'
            ? [...view.statblock.conditions, condition]
            : view.statblock.conditions.filter((entry) => entry.name !== condition.name),
        });
      }
      await this.reload();
    });
  }

  public async changeDeathSave(kind: 'successes' | 'failures', delta: number): Promise<void> {
    const pc = this.pc();
    if (pc === null) {
      return;
    }
    const current = pc.deathSaves;
    await this.patch({
      deathSaves: {
        ...current,
        [kind]: Math.max(0, Math.min(3, current[kind] + delta)),
      },
    });
  }

  public async changeHitDice(delta: number): Promise<void> {
    const pc = this.pc();
    if (pc === null) {
      return;
    }
    await this.patch({
      hitDice: {
        ...pc.hitDice,
        used: Math.max(0, Math.min(pc.hitDice.total, pc.hitDice.used + delta)),
      },
    });
  }

  public async changeResource(resourceId: string, delta: number): Promise<void> {
    const pc = this.pc();
    if (pc === null) {
      return;
    }
    await this.patch({
      resources: pc.resources.map((resource) =>
        resource.id === resourceId
          ? { ...resource, used: Math.max(0, Math.min(resource.max, resource.used + delta)) }
          : resource),
    });
  }

  public async changeSlot(level: number, delta: number): Promise<void> {
    const pc = this.pc();
    if (pc === null) {
      return;
    }
    await this.patch({
      spells: {
        ...pc.spells,
        slots: pc.spells.slots.map((slot) =>
          slot.level === level
            ? { ...slot, used: Math.max(0, Math.min(slot.max, slot.used + delta)) }
            : slot),
      },
    });
  }

  public async changePactSlot(delta: number): Promise<void> {
    const pc = this.pc();
    const pact = pc?.spells.pactSlots;
    if (pc === null || pact === undefined) {
      return;
    }
    await this.patch({
      spells: {
        ...pc.spells,
        pactSlots: { ...pact, used: Math.max(0, Math.min(pact.max, pact.used + delta)) },
      },
    });
  }

  public async rest(type: 'short' | 'long'): Promise<void> {
    if (this.restBusy()) {
      return;
    }
    this.restBusy.set(true);
    try {
      await this.actorsApi.rest(this.campaignId(), { type, actorIds: [this.actorId()] });
      await this.reload();
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.restBusy.set(false);
    }
  }

  public async saveXp(): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    await this.withBusy(async () => {
      await this.actorsApi.patchActor(this.actorId(), { xp: this.xpDraft() });
      await this.reload();
    });
  }

  public async openLevelUp(): Promise<void> {
    const pc = this.pc();
    if (pc === null) {
      return;
    }
    await this.catalogService.load();
    this.levelUpOpen.set(true);
    this.levelUpError.set(null);
    this.levelUpPreview.set(null);
    this.levelUpForm().reset({
      hpMethod: 'average',
      hpRoll: Math.ceil(pc.hitDice.die / 2),
      subclass: pc.class.subclassId ?? this.levelUpSubclasses()[0]?.id ?? '',
      asiPrimary: 'str',
      asiSecondary: 'con',
      asiSplit: false,
      feat: '',
    });
    await this.previewLevelUp();
  }

  public async previewLevelUp(): Promise<void> {
    if (this.levelUpBusy()) {
      return;
    }
    this.levelUpBusy.set(true);
    this.levelUpError.set(null);
    try {
      await submit(this.levelUpForm, {
        action: async () => {
          const preview = await this.actorsApi.previewLevelUp(
            this.actorId(),
            this.levelUpInput(),
          );
          this.levelUpPreview.set(preview);
          return undefined;
        },
      });
    } catch (error) {
      this.levelUpError.set(this.messageFor(error));
    } finally {
      this.levelUpBusy.set(false);
    }
  }

  public async confirmLevelUp(): Promise<void> {
    if (this.levelUpBusy()) {
      return;
    }
    this.levelUpBusy.set(true);
    this.levelUpError.set(null);
    try {
      await submit(this.levelUpForm, {
        action: async () => {
          const result = await this.actorsApi.levelUp(this.actorId(), this.levelUpInput());
          this.view.set(result.sheet);
          this.levelUpOpen.set(false);
          return undefined;
        },
      });
    } catch (error) {
      this.levelUpError.set(this.messageFor(error));
    } finally {
      this.levelUpBusy.set(false);
    }
  }

  private levelUpInput(): LevelUpInput {
    const pc = this.pc();
    if (pc === null) {
      throw new Error('nessun personaggio');
    }
    const form = this.levelUpForm().value();
    const input: LevelUpInput = { hpMethod: form.hpMethod };
    if (input.hpMethod === 'roll') {
      input.hpRoll = form.hpRoll;
    }
    if (this.levelUpNeedsSubclass() && form.subclass !== '') {
      input.subclassId = form.subclass;
    } else if (pc.class.subclassId === undefined && form.subclass !== '') {
      input.subclassId = form.subclass;
    }
    if (this.levelUpIsAsi()) {
      if (form.feat !== '') {
        input.featId = form.feat;
      } else if (form.asiSplit) {
        input.abilityIncreases = [
          { source: 'asi', ability: form.asiPrimary, amount: 1 },
          { source: 'asi', ability: form.asiSecondary, amount: 1 },
        ];
      } else {
        input.abilityIncreases = [
          { source: 'asi', ability: form.asiPrimary, amount: 2 },
        ];
      }
    }
    return input;
  }

  private async changeHp(delta: number): Promise<void> {
    const view = this.view();
    if (view === null || delta === 0) {
      return;
    }
    await this.withBusy(async () => {
      if (this.onMap()) {
        await this.sceneActions.send(this.campaignId(), this.combatSceneId() ?? '', {
          type: 'token.hp',
          tokenId: this.tokenId() ?? '',
          delta,
        });
      } else if (this.pc() !== null) {
        const hp = view.statblock.hp;
        await this.patch({
          hp: { ...hp, current: Math.max(0, Math.min(hp.max, hp.current + delta)) },
        });
      } else {
        this.error.set('Il mostro non è in mappa: nessun punto ferita da modificare.');
      }
      await this.reload();
    });
  }

  private async patch(patch: {
    hp?: PcStatblock['hp'];
    conditions?: Condition[];
    deathSaves?: PcStatblock['deathSaves'];
    resources?: ResourcePool[];
    hitDice?: PcStatblock['hitDice'];
    spells?: PcStatblock['spells'];
  }): Promise<void> {
    const view = this.view();
    if (view === null || view.statblock.kind !== 'pc') {
      return;
    }
    try {
      const updated = await this.actorsApi.patchSheet(this.actorId(), {
        sheetVersion: view.sheetVersion,
        patch,
      });
      this.view.set(updated);
    } catch (error) {
      this.error.set(this.messageFor(error));
      await this.reload();
    }
  }

  private async withBusy(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public toggleEditMode(): void {
    this.editMode.update((value) => !value);
  }

  public setActorName(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  public async saveActorName(): Promise<void> {
    const name = this.nameDraft().trim();
    if (name === '') {
      return;
    }
    this.busy.set(true);
    try {
      await this.actorsApi.patchActor(this.actorId(), { name });
      await this.reload();
      this.editMode.set(false);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public async uploadPortrait(file: File): Promise<void> {
    this.portraitBusy.set(true);
    try {
      const asset = await this.assetsApi.upload(file);
      await this.actorsApi.patchActor(this.actorId(), {
        imageAssetId: asset.id,
        portrait: this.portrait(),
      });
      this.portraitUrl.set(asset.url);
      await this.reload();
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.portraitBusy.set(false);
    }
  }

  public onPortraitFocus(focus: PortraitFocus): void {
    this.portraitFocusX.set(focus.focusX);
    this.portraitFocusY.set(focus.focusY);
  }

  public setPortraitZoom(value: number): void {
    this.portraitZoom.set(Math.max(1, Math.min(3, value)));
  }

  public async savePortrait(): Promise<void> {
    if (this.portraitUrl() === null) {
      return;
    }
    try {
      await this.actorsApi.patchActor(this.actorId(), { portrait: this.portrait() });
    } catch (error) {
      this.error.set(this.messageFor(error));
    }
  }

  private portrait(): ActorPortrait {
    return {
      focusX: this.portraitFocusX(),
      focusY: this.portraitFocusY(),
      zoom: this.portraitZoom(),
    };
  }

  private async syncPortrait(): Promise<void> {
    const actor = this.view()?.actor;
    if (actor === undefined) {
      return;
    }
    this.nameDraft.set(actor.name);
    const portrait = actor.portrait ?? DEFAULT_ACTOR_PORTRAIT;
    this.portraitFocusX.set(portrait.focusX);
    this.portraitFocusY.set(portrait.focusY);
    this.portraitZoom.set(portrait.zoom);
    if (actor.imageAssetId === null) {
      this.portraitUrl.set(null);
      return;
    }
    try {
      const asset = await this.assetsApi.get(actor.imageAssetId);
      this.portraitUrl.set(asset.url);
    } catch {
      this.portraitUrl.set(null);
    }
  }

  private async reload(): Promise<void> {
    try {
      const view = await this.actorsApi.getSheet(this.actorId());
      this.view.set(view);
      this.xpDraft.set(view.actor.xp);
      await this.syncPortrait();
      this.error.set(null);
    } catch (error) {
      this.error.set(this.messageFor(error));
    }
  }

  public speedText(speed: SpeedLike): string {
    return formatSpeeds(speed, (feet) => this.units.formatDistance(feet));
  }

  public senseText(senses: SensesLike): string {
    return formatSenses(senses, (feet) => this.units.formatDistance(feet));
  }

  public spellRangeText(range: string): string {
    return this.units.formatText(range);
  }

  public itemRange(item: ResolvedItem | undefined): string | null {
    if (item?.data.category !== 'weapon' || item.data.range === undefined) {
      return null;
    }
    return this.units.formatRange(item.data.range.normal, item.data.range.long);
  }

  public attackRangeText(itemId: string): string | null {
    return this.itemRange(this.view()?.inventory.find((item) => item.id === itemId));
  }

  public formatRulesText(text: string): string {
    return this.units.formatText(text);
  }

  public async createPlayerLink(): Promise<void> {
    if (this.playerLinkBusy()) {
      return;
    }
    this.playerLinkBusy.set(true);
    this.playerLinkError.set(null);
    try {
      const result = await this.players.createLink(this.actorId());
      this.playerUrl.set(result.url);
      this.playerEditing.set(true);
      await this.copyPlayerLink();
    } catch (error) {
      this.playerLinkError.set(this.messageFor(error));
    } finally {
      this.playerLinkBusy.set(false);
    }
  }

  public async copyPlayerLink(): Promise<void> {
    const url = this.playerUrl();
    if (url === null) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      // La copia è un'utilità: se il browser la nega l'URL resta selezionabile.
    }
  }

  public async togglePlayerEditing(): Promise<void> {
    if (this.playerLinkBusy()) {
      return;
    }
    this.playerLinkBusy.set(true);
    try {
      const link = await this.players.setEditing(this.actorId(), !this.playerEditing());
      if (link !== null) {
        this.playerEditing.set(link.editingEnabled);
      }
    } catch (error) {
      this.playerLinkError.set(this.messageFor(error));
    } finally {
      this.playerLinkBusy.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [loaded, campaign] = await Promise.all([
        this.actorsApi.getSheet(this.actorId()),
        this.campaignsApi.get(this.campaignId()),
      ]);
      let view = loaded;
      this.campaign.set(campaign);
      this.combatSceneId.set(campaign.activeSceneId);
      if (campaign.activeSceneId !== null) {
        const snapshot = await this.campaignsApi.getSnapshot(campaign.activeSceneId);
        const token = snapshot.state.tokens.find((entry) => entry.actorId === this.actorId());
        this.tokenId.set(token?.id ?? null);
        if (token !== undefined && view.statblock.kind !== 'pc') {
          view = {
            ...view,
            statblock: { ...view.statblock, hp: token.hp, conditions: token.conditions },
          };
        }
      } else {
        this.tokenId.set(null);
      }
      this.view.set(view);
      this.notesForm().reset({ notes: view.actor.dmNotes ?? '' });
      this.xpDraft.set(view.actor.xp);
      await this.syncPortrait();
      if (view.statblock.kind === 'pc') {
        const link = await this.players.getLink(this.actorId());
        if (link !== null) {
          this.playerEditing.set(link.editingEnabled);
        }
      }
      this.error.set(null);
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.loading.set(false);
    }
  }

  private messageFor(error: unknown): string {
    return httpMessage(error, {
      fallback: 'Impossibile caricare la scheda.',
      byStatus: {
        404: 'Attore non trovato.',
        409: 'La scheda è stata modificata altrove: ricarica la pagina.',
        422: serverMessage(error) ?? 'Operazione non valida.',
      },
    });
  }
}
