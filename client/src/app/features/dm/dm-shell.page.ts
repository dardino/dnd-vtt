import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  type OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  abilityModifier,
  FOG_BRUSH_CELLS,
  fogBrushRadius,
  isTiledMap,
  snapTokenCell,
  sortInitiativeEntries,
  type Actor,
  type ActionLogEntry,
  type AppliedAction,
  type Campaign,
  type CampaignExport,
  type DiceRoll,
  type Drawing,
  type FogOp,
  type GameAction,
  type GridConfig,
  type InitiativeEntry,
  type MeasureResult,
  type MonsterStatblock,
  type ProgramState,
  type Scene,
  type SceneState,
  type Session,
  type Size,
  type TokenState,
} from '@dnd-vtt/shared';
import { ActionStore } from '../../core/action.store';
import { ActorService } from '../../core/actor.service';
import { AiService } from '../../core/ai.service';
import { AssetService } from '../../core/asset.service';
import { AuthService } from '../../core/auth.service';
import { CampaignService } from '../../core/campaign.service';
import { DiceStore } from '../../core/dice.store';
import { LastCampaignService } from '../../core/last-campaign.service';
import { ProgramService } from '../../core/program.service';
import { SceneActionService } from '../../core/scene-action.service';
import { SceneStore } from '../../core/scene.store';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';
import { DiceOverlayComponent } from '../dice/dice-overlay.component';
import {
  SceneCanvasComponent,
  type ActorDropEvent,
  type SceneMapImage,
  type SceneTool,
  type TokenMoveEvent,
} from '../scene/scene-canvas.component';

type ShellMode = 'loading' | 'login' | 'create' | 'choose' | 'ready' | 'error';
type CanvasTool = SceneTool;
type SidebarSection = 'campaign' | 'scenes' | 'grid' | 'fog' | 'actors' | 'ai' | 'tokens';

const DEFAULT_SECTIONS: Record<SidebarSection, boolean> = {
  campaign: true,
  scenes: true,
  grid: true,
  fog: true,
  actors: true,
  ai: true,
  tokens: true,
};

const SIZE_CELLS: Record<Size, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

const PANEL_STORAGE_PREFIX = 'dnd-vtt:panels:';

@Component({
  selector: 'app-dm-shell',
  imports: [Button, Dialog, RouterLink, SceneCanvasComponent, DiceOverlayComponent],
  templateUrl: './dm-shell.page.html',
  styleUrl: './dm-shell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmShellPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly campaignsApi = inject(CampaignService);
  private readonly actorsApi = inject(ActorService);
  private readonly assetsApi = inject(AssetService);
  private readonly lastCampaign = inject(LastCampaignService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  public readonly sceneStore = inject(SceneStore);
  public readonly actions = inject(ActionStore);
  public readonly dice = inject(DiceStore);
  private readonly sceneActions = inject(SceneActionService);
  private readonly programsApi = inject(ProgramService);
  private readonly ai = inject(AiService);

  private readonly canvas = viewChild<SceneCanvasComponent>('canvas');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly replaceInput = viewChild<ElementRef<HTMLInputElement>>('replaceInput');
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private presenceSocket: WebSocket | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceCampaignId: string | null = null;
  private presenceRetry = 1;

  public readonly campaignId = input<string>();

  public readonly mode = signal<ShellMode>('loading');
  public readonly campaigns = signal<Campaign[]>([]);
  public readonly activeCampaign = signal<Campaign | null>(null);
  public readonly scenes = signal<Scene[]>([]);
  public readonly party = signal<Actor[]>([]);
  public readonly activeScene = signal<Scene | null>(null);
  public readonly mapImage = signal<SceneMapImage | null>(null);
  public readonly notice = signal<string | null>(null);
  public readonly statusMessage = signal('Console pronta.');
  public readonly busy = signal(false);
  public readonly uploading = signal(false);
  public readonly replacing = signal(false);
  public readonly uploadError = signal<string | null>(null);
  public readonly replaceTarget = signal<Scene | null>(null);

  public readonly tool = signal<CanvasTool>('select');
  public readonly gridVisible = signal(true);
  public readonly fogSoftness = signal(0);
  public readonly fogBrushCells = FOG_BRUSH_CELLS;
  public readonly newSceneFog = signal<'hidden' | 'revealed'>('hidden');
  public readonly fogConfirm = signal<'reveal' | 'hide' | null>(null);
  public readonly programState = signal<ProgramState | null>(null);
  public readonly programVersion = signal(1);
  public readonly displayCode = signal<string | null>(null);
  public readonly programBusy = signal(false);
  public readonly connectedDisplays = signal(0);
  public readonly sessions = signal<Session[]>([]);
  public readonly activeSession = signal<Session | null>(null);
  public readonly sessionBusy = signal(false);
  public readonly aiEnabled = signal(false);
  public readonly aiMessage = signal('Chat IA non configurata.');
  public readonly aiText = signal('');
  public readonly aiBusy = signal(false);
  public readonly aiPreview = signal<MonsterStatblock | null>(null);
  public readonly aiName = signal('Mostro importato');
  public readonly zoom = signal(1);
  public readonly measureResult = signal<MeasureResult | null>(null);
  public readonly selectedTokenId = signal<string | null>(null);
  public readonly leftOpen = signal(true);
  public readonly rightOpen = signal(true);
  public readonly dockOpen = signal(true);
  public readonly dockTab = signal<'initiative' | 'dice' | 'actions'>('initiative');
  public readonly diceOpen = signal(false);
  public readonly sections = signal<Record<SidebarSection, boolean>>({ ...DEFAULT_SECTIONS });
  public readonly sessionSeconds = signal(0);

  public readonly password = signal('');
  public readonly newName = signal('');
  public readonly newDescription = signal('');
  public readonly newAdvancement = signal<'milestone' | 'xp'>('milestone');

  public readonly loginError = computed(() => this.auth.error());
  public readonly hasCampaigns = computed(() => this.campaigns().length > 0);
  public readonly snapshot = computed(() => this.sceneStore.snapshot());
  public readonly state = computed<SceneState | null>(() => this.sceneStore.snapshot()?.state ?? null);
  public readonly tokens = computed<TokenState[]>(() => this.state()?.tokens ?? []);
  public readonly grid = computed<GridConfig | null>(() => this.state()?.grid ?? null);
  public readonly fogBrushRadiusPx = computed(() =>
    fogBrushRadius(this.grid()?.cellSizePx ?? 100));

  public readonly fogBrushDiameterPx = computed(() =>
    Math.round(this.fogBrushRadiusPx() * 2));

  public readonly selectedToken = computed<TokenState | null>(() => {
    const id = this.selectedTokenId();
    return this.tokens().find((token) => token.id === id) ?? null;
  });

  public readonly initiative = computed(() => this.state()?.initiative ?? null);
  public readonly currentInitiative = computed<InitiativeEntry | null>(() => {
    const initiative = this.initiative();
    if (initiative === null || !initiative.active) {
      return null;
    }
    return initiative.entries[initiative.turnIndex] ?? null;
  });

  public readonly undoneActions = computed(() =>
    this.actions.history().filter((entry) => entry.status === 'undone').length);

  public readonly lastAppliedAction = computed<ActionLogEntry | null>(() => {
    const sceneId = this.activeScene()?.id;
    if (sceneId === undefined) {
      return null;
    }
    return this.actions.history()
      .find((entry) => entry.sceneId === sceneId && entry.status === 'applied') ?? null;
  });

  public readonly canUndo = computed(() =>
    !this.readOnly() && this.actions.pending() === 0 && this.lastAppliedAction() !== null);

  public readonly canRedo = computed(() =>
    !this.readOnly() && this.actions.pending() === 0 && this.undoneActions() > 0);

  public readonly syncLabel = computed(() => {
    const status = this.actions.status();
    if (status === 'pending') {
      return `pending ${this.actions.pending()}`;
    }
    return status;
  });

  public readonly readOnly = computed(() => this.actions.status() === 'read-only');
  public readonly slots = computed<(Actor | null)[]>(() => {
    const actors = this.party().filter((actor) => actor.kind === 'pc').slice(0, 10);
    return Array.from({ length: 10 }, (_, index) => actors[index] ?? null);
  });

  public readonly availableActors = computed<Actor[]>(() =>
    this.party().filter((actor) => actor.kind !== 'pc'));

  public readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  public readonly blackout = computed(() => this.programState()?.blackout === true);
  public readonly airLabel = computed(() => {
    if (this.mode() !== 'ready' || this.connectedDisplays() === 0) {
      return 'OFF AIR';
    }
    return this.blackout() ? 'BLACKOUT' : 'ON AIR';
  });

  public readonly displayUrl = computed(() => {
    const code = this.displayCode();
    return code === null ? null : `${location.origin}/display/${code}`;
  });

  public readonly measureLabel = computed(() => {
    const measure = this.measureResult();
    return measure === null ? '—' : `${measure.feet} ft`;
  });

  public readonly sessionLabel = computed(() => {
    const total = this.sessionSeconds();
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  });

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target !== null
      && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    ) {
      return;
    }
    if (document.querySelector('dialog[open]') !== null) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      void this.undoLast();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      void this.redoLastBatch();
    }
  };

  public ngOnInit(): void {
    window.addEventListener('keydown', this.onKeydown);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.onKeydown);
      this.stopSessionTimer();
      this.closePresence();
    });
    void this.start();
  }

  private async start(): Promise<void> {
    try {
      const role = await this.auth.refresh();
      if (role !== 'dm') {
        this.mode.set('login');
        return;
      }
      await this.openCampaign();
    } catch {
      this.mode.set('error');
    }
  }

  private async openCampaign(): Promise<void> {
    const campaigns = await this.campaignsApi.list();
    this.campaigns.set(campaigns);
    const requested = this.campaignId();
    const fromRoute = requested === undefined
      ? undefined
      : campaigns.find((campaign) => campaign.id === requested);
    if (requested !== undefined && fromRoute === undefined) {
      this.lastCampaign.clear();
      this.notice.set('La campagna richiesta non esiste più.');
    }
    const remembered = this.lastCampaign.read();
    const target = fromRoute ?? campaigns.find((campaign) => campaign.id === remembered);
    if (target !== undefined) {
      await this.enterCampaign(target.id);
      return;
    }
    this.mode.set(campaigns.length === 0 ? 'create' : 'choose');
  }

  public async enterCampaign(id: string): Promise<void> {
    this.busy.set(true);
    try {
      const campaign = await this.campaignsApi.get(id);
      this.activeCampaign.set(campaign);
      this.newSceneFog.set(campaign.fogDefault);
      this.lastCampaign.write(campaign.id);
      this.mode.set('ready');
      this.notice.set(null);
      this.restorePanels(campaign.id);
      const scenes = await this.campaignsApi.listScenes(campaign.id);
      this.scenes.set(scenes);
      this.party.set(await this.actorsApi.listByCampaign(campaign.id));
      await this.dice.load(campaign.id);
      const program = await this.programsApi.get(campaign.id);
      this.programState.set(program.state);
      this.programVersion.set(program.version);
      this.connectPresence(campaign.id);
      const sessions = await this.campaignsApi.listSessions(campaign.id);
      this.sessions.set(sessions);
      const ai = await this.ai.status();
      this.aiEnabled.set(ai.enabled);
      this.aiMessage.set(ai.message);
      const active = sessions.find((session) => session.endedAt === null) ?? null;
      this.activeSession.set(active);
      if (active !== null) {
        this.sessionSeconds.set(Math.max(0, Math.floor(
          (Date.now() - Date.parse(active.startedAt)) / 1000,
        )));
        this.startSessionTimer(false);
      } else {
        this.sessionSeconds.set(0);
        this.stopSessionTimer();
      }
      const target = scenes.find((scene) => scene.id === campaign.activeSceneId) ?? scenes[0];
      if (target !== undefined) {
        if (campaign.activeSceneId !== target.id) {
          const updated = await this.campaignsApi.patch(campaign.id, { activeSceneId: target.id });
          this.activeCampaign.set(updated);
        }
        await this.loadScene(target);
      } else {
        this.actions.stop();
        this.activeScene.set(null);
        this.mapImage.set(null);
      }
      if (this.campaignId() !== campaign.id) {
        await this.router.navigate(['/dm/campaigns', campaign.id], { replaceUrl: true });
      }
    } catch (error) {
      this.lastCampaign.clear();
      this.notice.set(messageFor(error));
      this.mode.set(this.campaigns().length === 0 ? 'create' : 'choose');
    } finally {
      this.busy.set(false);
    }
  }

  private async loadScene(scene: Scene): Promise<void> {
    this.activeScene.set(scene);
    this.selectedTokenId.set(null);
    this.measureResult.set(null);
    this.sceneStore.clear();
    await this.sceneStore.load(scene.id);
    const campaign = this.activeCampaign();
    if (campaign !== null) {
      this.actions.watch(campaign.id, scene.id);
      this.restorePanels(campaign.id);
    }
    await this.loadMapAsset(scene);
  }

  private async loadMapAsset(scene: Scene): Promise<void> {
    if (scene.imageAssetId === null) {
      this.mapImage.set(null);
      return;
    }
    try {
      const asset = await this.assetsApi.get(scene.imageAssetId);
      this.mapImage.set({
        url: asset.url,
        previewUrl: asset.previewUrl,
        hash: asset.hash,
        width: asset.width,
        height: asset.height,
        tiled: isTiledMap(asset.width, asset.height),
      });
    } catch {
      this.mapImage.set(null);
      this.notice.set('La mappa della scena non è disponibile.');
    }
  }

  public async submitLogin(event: Event): Promise<void> {
    event.preventDefault();
    this.busy.set(true);
    try {
      const ok = await this.auth.login(this.password());
      if (ok) {
        this.password.set('');
        await this.openCampaign();
      }
    } finally {
      this.busy.set(false);
    }
  }

  public async submitCampaign(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.newName().trim();
    if (name === '') {
      return;
    }
    this.busy.set(true);
    try {
      const created = await this.campaignsApi.create({
        name,
        description: this.newDescription().trim(),
        advancementMode: this.newAdvancement(),
        fogDefault: 'hidden',
      });
      this.campaigns.update((items) => [...items, created]);
      this.newName.set('');
      this.newDescription.set('');
      await this.enterCampaign(created.id);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public async createScene(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null) {
      return;
    }
    this.busy.set(true);
    try {
      const scene = await this.campaignsApi.createScene(campaign.id, {
        name: `Scena ${this.scenes().length + 1}`,
        widthPx: 1920,
        heightPx: 1080,
        fogBase: this.newSceneFog(),
      });
      this.scenes.update((items) => [scene, ...items]);
      const refreshed = await this.campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
      this.activeCampaign.set(refreshed);
      this.statusMessage.set(`Scena creata: ${scene.name}`);
      await this.loadScene(scene);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public async uploadMap(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined || this.activeCampaign() === null) {
      return;
    }
    this.uploading.set(true);
    this.uploadError.set(null);
    try {
      const asset = await this.assetsApi.upload(file);
      const name = file.name.replace(/\.[^.]+$/, '') || 'Mappa';
      const scene = await this.campaignsApi.createScene(this.activeCampaign()?.id ?? '', {
        name,
        widthPx: asset.width,
        heightPx: asset.height,
        imageAssetId: asset.id,
        fogBase: this.newSceneFog(),
      });
      this.scenes.update((items) => [scene, ...items]);
      const refreshed = await this.campaignsApi.patch(scene.campaignId, { activeSceneId: scene.id });
      this.activeCampaign.set(refreshed);
      this.statusMessage.set(`Mappa caricata: ${asset.width} × ${asset.height} px`);
      await this.loadScene(scene);
    } catch (error) {
      this.uploadError.set(messageFor(error));
    } finally {
      this.uploading.set(false);
    }
  }

  public openFilePicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  public startReplaceMap(scene: Scene): void {
    this.replaceTarget.set(scene);
    this.uploadError.set(null);
    this.replaceInput()?.nativeElement.click();
  }

  public async replaceMap(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const scene = this.replaceTarget();
    if (file === undefined || scene === null) {
      return;
    }
    this.replacing.set(true);
    this.uploadError.set(null);
    try {
      const asset = await this.assetsApi.upload(file);
      const updated = await this.campaignsApi.updateScene(scene.id, {
        imageAssetId: asset.id,
        widthPx: asset.width,
        heightPx: asset.height,
      });
      this.scenes.update((items) => items.map((entry) => (entry.id === updated.id ? updated : entry)));
      if (this.activeScene()?.id === updated.id) {
        this.activeScene.set(updated);
        await this.loadMapAsset(updated);
      }
      this.statusMessage.set(`Mappa sostituita: ${asset.width} × ${asset.height} px`);
    } catch (error) {
      this.uploadError.set(messageFor(error));
    } finally {
      this.replacing.set(false);
      this.replaceTarget.set(null);
    }
  }

  public async selectScene(scene: Scene): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null || scene.id === this.activeScene()?.id) {
      return;
    }
    this.statusMessage.set(`Scena: ${scene.name}`);
    try {
      const updated = await this.campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
      this.activeCampaign.set(updated);
      await this.loadScene(scene);
    } catch (error) {
      this.notice.set(messageFor(error));
    }
  }

  public async changeAdvancementMode(event: Event): Promise<void> {
    const campaign = this.activeCampaign();
    const mode = (event.target as HTMLSelectElement).value;
    if (campaign === null || (mode !== 'milestone' && mode !== 'xp')) {
      return;
    }
    try {
      const updated = await this.campaignsApi.patch(campaign.id, { advancementMode: mode });
      this.activeCampaign.set(updated);
      this.statusMessage.set(`Avanzamento: ${mode === 'xp' ? 'XP' : 'milestone'}`);
    } catch (error) {
      this.notice.set(messageFor(error));
    }
  }

  public setTool(tool: CanvasTool): void {
    this.tool.set(tool);
    if (tool !== 'measure') {
      this.measureResult.set(null);
    }
  }

  public toggleGrid(): void {
    this.gridVisible.update((value) => !value);
  }

  public zoomIn(): void {
    this.canvas()?.zoomBy(1.15);
  }

  public zoomOut(): void {
    this.canvas()?.zoomBy(1 / 1.15);
  }

  public fitMap(): void {
    this.canvas()?.fit();
  }

  public onCamera(camera: { scale: number }): void {
    this.zoom.set(camera.scale);
  }

  public onMeasured(measure: MeasureResult | null): void {
    this.measureResult.set(measure);
    if (measure !== null) {
      this.statusMessage.set(`Misura: ${measure.feet} ft (${measure.cells} celle)`);
    }
  }

  public setDockTab(tab: 'initiative' | 'dice' | 'actions'): void {
    this.dockTab.set(tab);
    this.dockOpen.set(true);
    const campaign = this.activeCampaign();
    if (campaign === null) {
      return;
    }
    if (tab === 'dice') {
      void this.dice.load(campaign.id);
    }
    if (tab === 'actions') {
      void this.actions.refreshHistory(campaign.id);
    }
  }

  public openDice(): void {
    this.diceOpen.set(true);
  }

  public onDiceRolled(roll: DiceRoll): void {
    this.statusMessage.set(`Tiro: ${roll.total} (${roll.formula})`);
  }

  public async rollInitiative(): Promise<void> {
    const campaign = this.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    const entries: InitiativeEntry[] = [];
    for (const token of this.tokens()) {
      const actor = this.party().find((entry) => entry.id === token.actorId);
      const tiebreak = actor === undefined ? 0 : abilityModifier(actor.statblock.abilities.dex);
      const formula = tiebreak === 0 ? '1d20' : `1d20${tiebreak > 0 ? '+' : ''}${tiebreak}`;
      const roll = await this.dice.roll(campaign.id, {
        formula,
        mode: 'normal',
        visibility: 'dm',
        sceneId: scene.id,
        tokenId: token.id,
      });
      entries.push({
        id: crypto.randomUUID(),
        tokenId: token.id,
        label: token.label,
        value: roll?.total ?? 10 + tiebreak,
        tiebreak,
        hidden: !token.visible,
        defeated: false,
      });
    }
    if (entries.length === 0) {
      this.statusMessage.set('Nessun token in mappa per l’iniziativa.');
      return;
    }
    await this.setInitiative(sortInitiativeEntries(entries), true, 1, 0);
    this.statusMessage.set('Iniziativa tirata dal server.');
  }

  public async addTokenToInitiative(token: TokenState): Promise<void> {
    const initiative = this.initiative();
    if (initiative === null || initiative.entries.some((entry) => entry.tokenId === token.id)) {
      return;
    }
    const actor = this.party().find((entry) => entry.id === token.actorId);
    const tiebreak = actor === undefined ? 0 : abilityModifier(actor.statblock.abilities.dex);
    const entries = sortInitiativeEntries([
      ...initiative.entries,
      {
        id: crypto.randomUUID(),
        tokenId: token.id,
        label: token.label,
        value: 10 + tiebreak,
        tiebreak,
        hidden: !token.visible,
        defeated: false,
      },
    ]);
    await this.setInitiative(entries, initiative.active, initiative.round, initiative.turnIndex);
  }

  public async updateInitiativeValue(entryId: string, event: Event): Promise<void> {
    const initiative = this.initiative();
    const value = Number((event.target as HTMLInputElement).value);
    if (initiative === null || !Number.isFinite(value)) {
      return;
    }
    const entries = initiative.entries.map((entry) =>
      entry.id === entryId ? { ...entry, value: Math.trunc(value) } : entry);
    await this.setInitiative(entries, initiative.active, initiative.round, initiative.turnIndex);
  }

  public async sortInitiative(): Promise<void> {
    const initiative = this.initiative();
    if (initiative === null) {
      return;
    }
    await this.setInitiative(sortInitiativeEntries(initiative.entries), initiative.active, initiative.round, 0);
  }

  public async nextInitiativeTurn(): Promise<void> {
    await this.sendAction({ type: 'initiative.next' });
  }

  public async endInitiative(): Promise<void> {
    const initiative = this.initiative();
    if (initiative === null) {
      return;
    }
    await this.setInitiative(initiative.entries, false, 0, 0);
    this.statusMessage.set('Iniziativa terminata.');
  }

  public async changeTokenHp(token: TokenState, delta: number): Promise<void> {
    this.statusMessage.set(`${token.label}: ${delta > 0 ? '+' : ''}${delta} PF`);
    await this.sendAction({ type: 'token.hp', tokenId: token.id, delta });
  }

  public tokenHp(tokenId: string): string {
    const token = this.tokens().find((entry) => entry.id === tokenId);
    return token === undefined ? '—' : `${token.hp.current}/${token.hp.max}`;
  }

  public tokenCount(actorId: string): number {
    return this.tokens().filter((token) => token.actorId === actorId).length;
  }

  public async undoLast(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null) {
      return;
    }
    await this.actions.refreshHistory(campaign.id);
    const entry = this.lastAppliedAction();
    if (entry === null) {
      return;
    }
    await this.undoThrough(entry.id);
  }

  public async undoThrough(entryId: string): Promise<void> {
    const campaign = this.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    try {
      const result = await this.sceneActions.undo(campaign.id, entryId);
      await this.sceneStore.load(scene.id);
      await this.actions.refreshHistory(campaign.id);
      this.statusMessage.set(`${result.undone} azioni annullate.`);
    } catch {
      this.statusMessage.set('Annullamento non riuscito.');
    }
  }

  public async redoLastBatch(): Promise<void> {
    const campaign = this.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    try {
      const result = await this.sceneActions.redo(campaign.id);
      await this.sceneStore.load(scene.id);
      await this.actions.refreshHistory(campaign.id);
      this.statusMessage.set(`${result.redone} azioni ripristinate.`);
    } catch {
      this.statusMessage.set('Nessuna azione da ripetere.');
    }
  }

  private async setInitiative(
    entries: InitiativeEntry[],
    active: boolean,
    round: number,
    turnIndex: number,
  ): Promise<void> {
    await this.sendAction({
      type: 'initiative.set',
      initiative: {
        active,
        round,
        turnIndex: Math.min(turnIndex, Math.max(0, entries.length - 1)),
        entries,
      },
    });
  }

  public async onTokenMoved(event: TokenMoveEvent): Promise<void> {
    this.statusMessage.set(`Token spostato in (${event.x}, ${event.y})`);
    await this.sendAction({ type: 'token.move', tokenId: event.tokenId, x: event.x, y: event.y });
  }

  public async onActorDropped(event: ActorDropEvent): Promise<void> {
    const actor = this.party().find((entry) => entry.id === event.actorId);
    if (actor === undefined) {
      return;
    }
    await this.spawnActorToken(actor, event.pointX, event.pointY);
  }

  public async addActorToMap(actor: Actor): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.spawnActorToken(actor, scene.widthPx / 2, scene.heightPx / 2);
  }

  private async spawnActorToken(actor: Actor, pointX: number, pointY: number): Promise<void> {
    const scene = this.activeScene();
    const grid = this.grid();
    if (scene === null || grid === null) {
      return;
    }
    if (actor.kind === 'pc') {
      const existing = this.tokens().find((token) => token.actorId === actor.id);
      if (existing !== undefined) {
        this.selectedTokenId.set(existing.id);
        this.canvas()?.focusToken(existing.id);
        this.statusMessage.set(`${actor.name} è già in mappa.`);
        return;
      }
    }
    const size = SIZE_CELLS[actor.statblock.size];
    const cell = snapTokenCell(grid, { x: pointX, y: pointY }, size);
    const hp = actor.hp ?? { current: 1, max: 1, temp: 0 };
    const token: TokenState = {
      id: crypto.randomUUID(),
      actorId: actor.id,
      label: actor.name,
      x: cell.x,
      y: cell.y,
      size,
      rotation: 0,
      elevation: 0,
      hp,
      conditions: [...actor.statblock.conditions],
      visible: true,
      owner: 'dm',
    };
    this.selectedTokenId.set(token.id);
    this.statusMessage.set(`Token aggiunto: ${actor.name}`);
    await this.sendAction({ type: 'token.add', token });
  }

  public onTokenSelected(tokenId: string | null): void {
    this.selectedTokenId.set(tokenId);
  }

  public async toggleTokenVisibility(token: TokenState): Promise<void> {
    this.statusMessage.set(`${token.label}: ${token.visible ? 'nascosto' : 'visibile'}`);
    await this.sendAction({
      type: 'token.update',
      tokenId: token.id,
      patch: { visible: !token.visible },
    });
  }

  public async removeToken(token: TokenState): Promise<void> {
    this.statusMessage.set(`${token.label}: rimosso`);
    const applied = await this.sendAction({ type: 'token.remove', tokenId: token.id });
    if (applied !== null && this.selectedTokenId() === token.id) {
      this.selectedTokenId.set(null);
    }
  }

  public centerToken(token: TokenState): void {
    this.selectedTokenId.set(token.id);
    this.canvas()?.focusToken(token.id);
  }

  public async changeGridType(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    const grid = this.grid();
    if (grid === null || (value !== 'square' && value !== 'hex')) {
      return;
    }
    await this.sendAction({ type: 'grid.update', grid: { ...grid, type: value } });
    this.statusMessage.set(value === 'hex' ? 'Griglia esagonale odd-r' : 'Griglia quadrata');
  }

  public async changeGridSize(event: Event): Promise<void> {
    const value = Number((event.target as HTMLInputElement).value);
    const grid = this.grid();
    if (grid === null || !Number.isFinite(value)) {
      return;
    }
    const cellSizePx = Math.max(16, Math.min(400, Math.round(value)));
    await this.sendAction({ type: 'grid.update', grid: { ...grid, cellSizePx } });
    this.statusMessage.set(`Cella: ${cellSizePx} px`);
  }

  public setNewSceneFog(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'hidden' || value === 'revealed') {
      this.newSceneFog.set(value);
    }
  }

  public setFogSoftness(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.fogSoftness.set(Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 0);
  }

  public async onFogApplied(op: FogOp): Promise<void> {
    await this.sendAction({ type: 'fog.apply', op });
    this.statusMessage.set(op.op === 'reveal' ? 'Fog: area rivelata' : 'Fog: area nascosta');
  }

  public async onDrawingAdded(drawing: Drawing): Promise<void> {
    await this.sendAction({ type: 'drawing.add', drawing });
    this.statusMessage.set('Disegno aggiunto');
  }

  public revealAll(): void {
    this.fogConfirm.set('reveal');
  }

  public hideAll(): void {
    this.fogConfirm.set('hide');
  }

  public async confirmFogChange(): Promise<void> {
    const mode = this.fogConfirm();
    this.fogConfirm.set(null);
    if (mode === null) {
      return;
    }
    if (mode === 'reveal') {
      await this.sendAction({ type: 'fog.replace', base: 'revealed', ops: [] });
      this.statusMessage.set('Fog: tutta la mappa rivelata');
    } else {
      await this.sendAction({ type: 'fog.replace', base: 'hidden', ops: [] });
      this.statusMessage.set('Fog: tutta la mappa nascosta');
    }
  }

  public cancelFogChange(): void {
    this.fogConfirm.set(null);
  }

  public exportPng(): void {
    this.canvas()?.exportPng();
  }

  public async openScreen(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null || this.programBusy()) {
      return;
    }
    this.programBusy.set(true);
    try {
      const display = await this.programsApi.createDisplay(campaign.id, {
        label: 'Schermo giocatori',
      });
      this.displayCode.set(display.code);
      window.open(`/display/${display.code}`, '_blank');
      this.statusMessage.set(`Schermo aperto: ${display.code}`);
    } catch (error) {
      this.statusMessage.set(messageFor(error));
    } finally {
      this.programBusy.set(false);
    }
  }

  public async takeScene(): Promise<void> {
    const campaign = this.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null || this.programBusy()) {
      return;
    }
    this.programBusy.set(true);
    try {
      const current = await this.programsApi.get(campaign.id);
      const state: ProgramState = {
        ...current.state,
        base: {
          ...current.state.base,
          content: {
            type: 'map',
            sceneId: scene.id,
            viewport: { x: scene.widthPx / 2, y: scene.heightPx / 2, zoom: 1 },
            fog: true,
            cameraLocked: false,
          },
        },
        updatedAt: new Date().toISOString(),
      };
      const updated = await this.programsApi.put(campaign.id, current.version, state);
      this.programState.set(updated.state);
      this.programVersion.set(updated.version);
      this.statusMessage.set(`In onda: ${scene.name}`);
    } catch (error) {
      this.statusMessage.set(messageFor(error));
    } finally {
      this.programBusy.set(false);
    }
  }

  public async toggleBlackout(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null || this.programBusy()) {
      return;
    }
    this.programBusy.set(true);
    try {
      const current = await this.programsApi.get(campaign.id);
      const state: ProgramState = {
        ...current.state,
        blackout: !current.state.blackout,
        updatedAt: new Date().toISOString(),
      };
      const updated = await this.programsApi.put(campaign.id, current.version, state);
      this.programState.set(updated.state);
      this.programVersion.set(updated.version);
      this.statusMessage.set(updated.state.blackout ? 'Schermo in blackout' : 'Schermo riacceso');
    } catch (error) {
      this.statusMessage.set(messageFor(error));
    } finally {
      this.programBusy.set(false);
    }
  }

  public onActorDragStart(event: DragEvent, actor: Actor): void {
    if (event.dataTransfer === null || this.readOnly()) {
      return;
    }
    event.dataTransfer.setData('application/x-dnd-vtt-actor', actor.id);
    event.dataTransfer.effectAllowed = 'copy';
  }

  public selectActor(actor: Actor): void {
    const token = this.tokens().find((entry) => entry.actorId === actor.id);
    if (token !== undefined) {
      this.centerToken(token);
    } else {
      this.statusMessage.set(`${actor.name}: trascina lo slot sulla mappa per schierarlo.`);
    }
  }

  public actorSubtitle(actor: Actor): string {
    if (actor.statblock.kind === 'pc') {
      return `${actor.statblock.class.id} · livello ${actor.statblock.class.level}`;
    }
    if (actor.statblock.kind === 'monster') {
      return `${actor.statblock.creatureType} · CR ${actor.statblock.cr}`;
    }
    return `NPC · ${actor.statblock.creatureType}`;
  }

  public hpRatio(actor: Actor): number {
    if (actor.hp === null || actor.hp.max <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, actor.hp.current / actor.hp.max));
  }

  public toggleLeft(): void {
    this.leftOpen.update((value) => !value);
    this.persistPanels();
  }

  public toggleSection(section: SidebarSection): void {
    this.sections.update((current) => ({ ...current, [section]: !current[section] }));
    this.persistPanels();
  }

  public isSectionOpen(section: SidebarSection): boolean {
    return this.sections()[section];
  }

  public toggleRight(): void {
    this.rightOpen.update((value) => !value);
    this.persistPanels();
  }

  public toggleDock(): void {
    this.dockOpen.update((value) => !value);
    this.persistPanels();
  }

  public async syncNow(): Promise<void> {
    await this.actions.syncNow();
    this.statusMessage.set('Stato riallineato dal server.');
  }

  public async analyzeStatblock(): Promise<void> {
    const campaign = this.activeCampaign();
    const text = this.aiText().trim();
    if (campaign === null || text === '' || this.aiBusy()) {
      return;
    }
    this.aiBusy.set(true);
    try {
      const result = await this.ai.parseStatblock(campaign.id, text);
      this.aiPreview.set(result.statblock);
      this.statusMessage.set('Statblock analizzato: controlla e crea il mostro.');
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.aiBusy.set(false);
    }
  }

  public async createParsedMonster(): Promise<void> {
    const campaign = this.activeCampaign();
    const statblock = this.aiPreview();
    if (campaign === null || statblock === null || this.aiBusy()) {
      return;
    }
    this.aiBusy.set(true);
    try {
      const actor = await this.actorsApi.createActor({
        campaignId: campaign.id,
        kind: 'monster',
        name: this.aiName().trim() === '' ? 'Mostro importato' : this.aiName().trim(),
        statblock,
      });
      this.party.update((items) => [...items, actor]);
      this.aiPreview.set(null);
      this.aiText.set('');
      this.statusMessage.set(`Creato: ${actor.name}`);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.aiBusy.set(false);
    }
  }

  public setAiText(event: Event): void {
    this.aiText.set((event.target as HTMLTextAreaElement).value);
  }

  public setAiName(event: Event): void {
    this.aiName.set((event.target as HTMLInputElement).value);
  }

  public async startSession(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null || this.sessionBusy()) {
      return;
    }
    this.sessionBusy.set(true);
    try {
      const session = await this.campaignsApi.startSession(campaign.id);
      this.activeSession.set(session);
      this.sessions.update((items) => [session, ...items.filter((entry) => entry.id !== session.id)]);
      this.sessionSeconds.set(0);
      this.startSessionTimer(false);
      this.statusMessage.set(`Sessione ${session.number} avviata`);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.sessionBusy.set(false);
    }
  }

  public async stopSession(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null || this.sessionBusy()) {
      return;
    }
    this.sessionBusy.set(true);
    try {
      const session = await this.campaignsApi.stopSession(campaign.id);
      this.activeSession.set(null);
      this.sessions.update((items) => items.map((entry) => (entry.id === session.id ? session : entry)));
      this.stopSessionTimer();
      this.statusMessage.set(`Sessione ${session.number} terminata`);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.sessionBusy.set(false);
    }
  }

  public async exportCampaign(): Promise<void> {
    const campaign = this.activeCampaign();
    if (campaign === null) {
      return;
    }
    try {
      const bundle = await this.campaignsApi.exportCampaign(campaign.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${campaign.name.replaceAll(/[^\w-]+/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.statusMessage.set('Campagna esportata');
    } catch (error) {
      this.notice.set(messageFor(error));
    }
  }

  public openImportPicker(): void {
    this.importInput()?.nativeElement.click();
  }

  public async importCampaign(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) {
      return;
    }
    try {
      const bundle = JSON.parse(await file.text()) as CampaignExport;
      const result = await this.campaignsApi.importCampaign(bundle);
      this.campaigns.update((items) => [...items, result.campaign]);
      await this.enterCampaign(result.campaign.id);
      this.statusMessage.set(
        `Importata: ${result.imported.scenes} scene, ${result.imported.actors} attori`,
      );
    } catch (error) {
      this.notice.set(messageFor(error));
    }
  }

  public openCreate(): void {
    this.notice.set(null);
    this.mode.set('create');
  }

  public openChoose(): void {
    this.notice.set(null);
    this.closePresence();
    this.mode.set('choose');
  }

  public closeChoose(): void {
    const campaign = this.activeCampaign();
    if (campaign !== null) {
      this.mode.set('ready');
      this.connectPresence(campaign.id);
    }
  }

  public closeCreate(): void {
    if (this.hasCampaigns()) {
      this.mode.set(this.activeCampaign() === null ? 'choose' : 'ready');
    }
  }

  public updatePassword(event: Event): void {
    this.password.set(readValue(event));
  }

  public updateNewName(event: Event): void {
    this.newName.set(readValue(event));
  }

  public updateNewDescription(event: Event): void {
    this.newDescription.set(readValue(event));
  }

  public updateNewAdvancement(event: Event): void {
    this.newAdvancement.set(readValue(event) === 'xp' ? 'xp' : 'milestone');
  }

  private async sendAction(action: GameAction): Promise<AppliedAction | null> {
    const scene = this.activeScene();
    if (scene === null) {
      return null;
    }
    return this.actions.send(scene.id, action);
  }

  private restorePanels(campaignId: string): void {
    this.leftOpen.set(true);
    this.rightOpen.set(true);
    this.dockOpen.set(true);
    this.sections.set({ ...DEFAULT_SECTIONS });
    const stored = localStorage.getItem(`${PANEL_STORAGE_PREFIX}${campaignId}`);
    if (stored === null) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        left?: boolean;
        right?: boolean;
        dock?: boolean;
        sections?: Record<string, unknown>;
      };
      this.leftOpen.set(parsed.left ?? true);
      this.rightOpen.set(parsed.right ?? true);
      this.dockOpen.set(parsed.dock ?? true);
      const sections = { ...DEFAULT_SECTIONS };
      for (const key of Object.keys(DEFAULT_SECTIONS) as SidebarSection[]) {
        const value = parsed.sections?.[key];
        if (typeof value === 'boolean') {
          sections[key] = value;
        }
      }
      this.sections.set(sections);
    } catch {
      // Preferenza corrotta: si torna ai pannelli aperti senza bloccare la console.
    }
  }

  private persistPanels(): void {
    const campaign = this.activeCampaign();
    if (campaign === null) {
      return;
    }
    localStorage.setItem(
      `${PANEL_STORAGE_PREFIX}${campaign.id}`,
      JSON.stringify({
        left: this.leftOpen(),
        right: this.rightOpen(),
        dock: this.dockOpen(),
        sections: this.sections(),
      }),
    );
  }

  private connectPresence(campaignId: string): void {
    this.closePresence();
    this.presenceCampaignId = campaignId;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
      `${protocol}//${location.host}/ws?role=dm&campaignId=${encodeURIComponent(campaignId)}`,
    );
    this.presenceSocket = socket;
    socket.addEventListener('open', () => {
      this.presenceRetry = 1;
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string;
          payload?: { displays?: number };
        };
        if (
          (message.type === 'hello' || message.type === 'presence.updated')
          && typeof message.payload?.displays === 'number'
        ) {
          this.connectedDisplays.set(message.payload.displays);
        }
      } catch {
        // Un messaggio malformato non deve interrompere la console.
      }
    });
    socket.addEventListener('close', () => {
      if (this.presenceSocket !== socket) {
        return;
      }
      this.presenceSocket = null;
      this.connectedDisplays.set(0);
      if (this.presenceCampaignId !== campaignId) {
        return;
      }
      const delay = Math.min(30_000, this.presenceRetry * 1000);
      this.presenceRetry = Math.min(30, this.presenceRetry * 2);
      this.presenceTimer = setTimeout(() => this.connectPresence(campaignId), delay);
    });
  }

  private closePresence(): void {
    this.presenceCampaignId = null;
    if (this.presenceTimer !== null) {
      clearTimeout(this.presenceTimer);
      this.presenceTimer = null;
    }
    const socket = this.presenceSocket;
    this.presenceSocket = null;
    socket?.close();
    this.connectedDisplays.set(0);
  }

  private startSessionTimer(reset = true): void {
    this.stopSessionTimer();
    if (reset) {
      this.sessionSeconds.set(0);
    }
    this.sessionTimer = setInterval(() => {
      this.sessionSeconds.update((value) => value + 1);
    }, 1000);
  }

  private stopSessionTimer(): void {
    if (this.sessionTimer !== null) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
  }
}

const readValue = (event: Event): string =>
  (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;

const messageFor = (error: unknown): string => {
  if (error instanceof HttpErrorResponse && error.status === 404) {
    return 'La campagna non esiste più.';
  }
  if (error instanceof HttpErrorResponse && error.status === 401) {
    return 'Sessione scaduta: autentica di nuovo.';
  }
  if (error instanceof HttpErrorResponse && error.status === 413) {
    return 'Il file supera il limite di upload.';
  }
  if (error instanceof HttpErrorResponse && error.status === 415) {
    return 'Formato non supportato: usa PNG, JPEG o WebP.';
  }
  return 'Operazione non riuscita. Controlla il server e riprova.';
};
