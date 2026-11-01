import {
  Component,
  type OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  abilityModifier,
  conditionNameSchema,
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
  type ConditionName,
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
import { Dialog } from '../../components/dialog/dialog';

type SheetTab = 'combat' | 'abilities' | 'spells' | 'equipment' | 'features' | 'notes';

@Component({
  selector: 'app-actor-sheet',
  imports: [RouterLink, Dialog],
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
  public readonly notesDraft = signal('');
  public readonly nameDraft = signal('');
  public readonly editMode = signal(false);
  public readonly portraitUrl = signal<string | null>(null);
  public readonly portraitFocusX = signal(DEFAULT_ACTOR_PORTRAIT.focusX);
  public readonly portraitFocusY = signal(DEFAULT_ACTOR_PORTRAIT.focusY);
  public readonly portraitZoom = signal(DEFAULT_ACTOR_PORTRAIT.zoom);
  public readonly portraitBusy = signal(false);
  private portraitDragging = false;
  public readonly savingNotes = signal(false);
  public readonly notesSaved = signal(false);
  public readonly busy = signal(false);
  public readonly damageAmount = signal(5);
  public readonly healAmount = signal(5);
  public readonly tempAmount = signal(0);
  public readonly conditionToAdd = signal<ConditionName>('prone');
  public readonly conditionNames = conditionNameSchema.options;
  public readonly xpDraft = signal(0);
  public readonly levelUpOpen = signal(false);
  public readonly levelUpPreview = signal<LevelUpPreview | null>(null);
  public readonly levelUpError = signal<string | null>(null);
  public readonly levelUpBusy = signal(false);
  public readonly levelUpHpMethod = signal<'average' | 'roll'>('average');
  public readonly levelUpHpRoll = signal(6);
  public readonly levelUpSubclass = signal('');
  public readonly levelUpAsiPrimary = signal<Ability>('str');
  public readonly levelUpAsiSecondary = signal<Ability>('con');
  public readonly levelUpAsiSplit = signal(false);
  public readonly levelUpFeat = signal('');
  public readonly restBusy = signal(false);
  public readonly playerUrl = signal<string | null>(null);
  public readonly playerEditing = signal(true);
  public readonly playerLinkBusy = signal(false);
  public readonly playerLinkError = signal<string | null>(null);

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

  public setDamage(event: Event): void {
    this.damageAmount.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setHeal(event: Event): void {
    this.healAmount.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setTemp(event: Event): void {
    this.tempAmount.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setConditionToAdd(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if ((conditionNameSchema.options as string[]).includes(value)) {
      this.conditionToAdd.set(value as ConditionName);
    }
  }

  public setXpDraft(event: Event): void {
    this.xpDraft.set(Math.max(0, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public async damage(): Promise<void> {
    await this.changeHp(-Math.abs(this.damageAmount()));
  }

  public async heal(): Promise<void> {
    await this.changeHp(Math.abs(this.healAmount()));
  }

  public async applyTempHp(): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    const hp = { ...view.statblock.hp, temp: Math.max(0, this.tempAmount()) };
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

  public async addCondition(): Promise<void> {
    const name = this.conditionToAdd();
    const view = this.view();
    const pc = this.pc();
    if (view === null || view.statblock.conditions.some((condition) => condition.name === name)) {
      return;
    }
    const condition: Condition = { name };
    await this.withBusy(async () => {
      if (this.onMap()) {
        await this.sceneActions.send(this.campaignId(), this.combatSceneId() ?? '', {
          type: 'token.condition',
          tokenId: this.tokenId() ?? '',
          op: 'add',
          condition,
        });
      } else if (pc !== null) {
        await this.patch({ conditions: [...view.statblock.conditions, condition] });
      }
      await this.reload();
    });
  }

  public async removeCondition(condition: Condition): Promise<void> {
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
          op: 'remove',
          condition,
        });
      } else if (pc !== null) {
        await this.patch({
          conditions: view.statblock.conditions.filter((entry) => entry.name !== condition.name),
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
    this.levelUpHpMethod.set('average');
    this.levelUpHpRoll.set(Math.ceil(pc.hitDice.die / 2));
    this.levelUpSubclass.set(pc.class.subclassId ?? this.levelUpSubclasses()[0]?.id ?? '');
    this.levelUpFeat.set('');
    this.levelUpAsiSplit.set(false);
    this.levelUpAsiPrimary.set('str');
    this.levelUpAsiSecondary.set('con');
    await this.previewLevelUp();
  }

  public setLevelUpHpMethod(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'average' || value === 'roll') {
      this.levelUpHpMethod.set(value);
    }
  }

  public setLevelUpHpRoll(event: Event): void {
    this.levelUpHpRoll.set(Math.max(1, Math.trunc(Number((event.target as HTMLInputElement).value))));
  }

  public setLevelUpSubclass(event: Event): void {
    this.levelUpSubclass.set((event.target as HTMLSelectElement).value);
  }

  public setLevelUpAsiPrimary(event: Event): void {
    this.levelUpAsiPrimary.set((event.target as HTMLSelectElement).value as Ability);
  }

  public setLevelUpAsiSecondary(event: Event): void {
    this.levelUpAsiSecondary.set((event.target as HTMLSelectElement).value as Ability);
  }

  public setLevelUpAsiSplit(event: Event): void {
    this.levelUpAsiSplit.set((event.target as HTMLInputElement).checked);
  }

  public setLevelUpFeat(event: Event): void {
    this.levelUpFeat.set((event.target as HTMLSelectElement).value);
  }

  public async previewLevelUp(): Promise<void> {
    this.levelUpBusy.set(true);
    this.levelUpError.set(null);
    try {
      const preview = await this.actorsApi.previewLevelUp(this.actorId(), this.levelUpInput());
      this.levelUpPreview.set(preview);
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
      const result = await this.actorsApi.levelUp(this.actorId(), this.levelUpInput());
      this.view.set(result.sheet);
      this.levelUpOpen.set(false);
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
    const input: LevelUpInput = { hpMethod: this.levelUpHpMethod() };
    if (input.hpMethod === 'roll') {
      input.hpRoll = this.levelUpHpRoll();
    }
    if (this.levelUpNeedsSubclass() && this.levelUpSubclass() !== '') {
      input.subclassId = this.levelUpSubclass();
    } else if (pc.class.subclassId === undefined && this.levelUpSubclass() !== '') {
      input.subclassId = this.levelUpSubclass();
    }
    if (this.levelUpIsAsi()) {
      if (this.levelUpFeat() !== '') {
        input.featId = this.levelUpFeat();
      } else if (this.levelUpAsiSplit()) {
        input.abilityIncreases = [
          { source: 'asi', ability: this.levelUpAsiPrimary(), amount: 1 },
          { source: 'asi', ability: this.levelUpAsiSecondary(), amount: 1 },
        ];
      } else {
        input.abilityIncreases = [
          { source: 'asi', ability: this.levelUpAsiPrimary(), amount: 2 },
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

  public async uploadPortrait(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) {
      return;
    }
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

  public startPortraitDrag(event: PointerEvent): void {
    if (this.portraitUrl() === null) {
      return;
    }
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    this.portraitDragging = true;
    this.movePortrait(event);
  }

  public movePortrait(event: PointerEvent): void {
    if (!this.portraitDragging) {
      return;
    }
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.portraitFocusX.set(Math.max(0.02, Math.min(0.98, x)));
    this.portraitFocusY.set(Math.max(0.02, Math.min(0.98, y)));
  }

  public finishPortraitDrag(): void {
    if (!this.portraitDragging) {
      return;
    }
    this.portraitDragging = false;
    void this.savePortrait();
  }

  public setPortraitZoom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.portraitZoom.set(Math.max(1, Math.min(3, value)));
    }
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
      await navigator.clipboard?.writeText(result.url).catch(() => undefined);
    } catch (error) {
      this.playerLinkError.set(this.messageFor(error));
    } finally {
      this.playerLinkBusy.set(false);
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
      this.notesDraft.set(view.actor.dmNotes ?? '');
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
