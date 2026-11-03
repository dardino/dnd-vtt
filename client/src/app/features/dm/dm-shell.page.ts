import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  type OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import {
  DEFAULT_ACTOR_PORTRAIT,
  defaultBackgroundTransform,
  computeVisionGrid,
  fogBrushRadius,
  gridDrawingWidth,
  tokenCenterCell,
  type Actor,
  type DiceRoll,
  type Drawing,
  type FogOp,
  type MapSummary,
  type MeasureResult,
  type PublicDoor,
  type Scene,
  type SceneState,
  type TokenState,
  type VisionGrid,
  type VisionSource,
} from '@dnd-vtt/shared';
import { ActionStore } from '../../core/action.store';
import { AuthService } from '../../core/auth.service';
import { CampaignService } from '../../core/campaign.service';
import { httpMessage } from '../../core/http-error';
import { DiceStore } from '../../core/dice.store';
import { MeasurementService } from '../../core/measurement.service';
import { RealtimeService } from '../../core/realtime.service';
import { SceneStore } from '../../core/scene.store';
import { Button } from '../../components/button/button';
import { DiceOverlayComponent } from '../dice/dice-overlay.component';
import { ActorList } from './actor-list';
import { CampaignShellStore } from './campaign-shell.store';
import { AuthSessionsPanel } from './auth-sessions-panel';
import { CharacterSlots } from './character-slots';
import { ChooseCampaignDialog } from './choose-campaign-dialog';
import {
  CreateCampaignDialog,
  type CreateCampaignValues,
} from './create-campaign-dialog';
import { DmAuxStore } from './dm-aux.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmDock, type DockTab } from './dm-dock';
import { DmLayoutStore, type SidebarSectionId } from './dm-layout.store';
import { DmSessionStore } from './dm-session.store';
import { DmStatusbar } from './dm-statusbar';
import { DmUiStore } from './dm-ui.store';
import { FogConfirmDialog } from './fog-confirm-dialog';
import { LoginDialog } from './login-dialog';
import { MapPickerDialog } from './map-picker-dialog';
import { MapSettingsDialog } from './map-settings-dialog';
import {
  PrepareSceneDialog,
  type PrepareSceneAssignment,
} from './prepare-scene-dialog';
import { RegiaStore, type ScreenSummary } from './regia.store';
import { SceneList } from './scene-list';
import { SceneFogStore } from './scene-fog.store';
import { SceneToolbar } from './scene-toolbar';
import { SceneTokensStore } from './scene-tokens.store';
import { SceneToolsStore } from './scene-tools.store';
import { ScreenList } from './screen-list';
import { ScreenViewerDialog } from './screen-viewer-dialog';
import { SessionCard } from './session-card';
import { SidebarSection } from './sidebar-section';
import { TakeTargetDialog } from './take-target-dialog';
import { TokenList } from './token-list';
import {
  SceneCanvasComponent,
  type ActorDropEvent,
  type ActorPortraitThumb,
  type TokenMoveEvent,
} from '../scene/scene-canvas.component';

@Component({
  selector: 'app-dm-shell',
  imports: [
    ActorList,
    AuthSessionsPanel,
    Button,
    CharacterSlots,
    ChooseCampaignDialog,
    CreateCampaignDialog,
    DmDock,
    DmStatusbar,
    FogConfirmDialog,
    LoginDialog,
    MapPickerDialog,
    MapSettingsDialog,
    PrepareSceneDialog,
    RouterLink,
    SceneCanvasComponent,
    SceneList,
    SceneToolbar,
    DiceOverlayComponent,
    ScreenList,
    ScreenViewerDialog,
    SessionCard,
    SidebarSection,
    TakeTargetDialog,
    TokenList,
  ],
  templateUrl: './dm-shell.page.html',
  styleUrl: './dm-shell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmShellPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly campaignsApi = inject(CampaignService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly sceneStore = inject(SceneStore);
  public readonly actions = inject(ActionStore);
  public readonly dice = inject(DiceStore);
  public readonly units = inject(MeasurementService);
  public readonly sceneTools = inject(SceneToolsStore);
  public readonly tokensStore = inject(SceneTokensStore);
  public readonly fog = inject(SceneFogStore);
  public readonly regia = inject(RegiaStore);
  public readonly shell = inject(CampaignShellStore);
  public readonly layout = inject(DmLayoutStore);
  public readonly ui = inject(DmUiStore);
  public readonly session = inject(DmSessionStore);
  public readonly aux = inject(DmAuxStore);
  public readonly campaign = inject(DmCampaignStore);
  private readonly realtime = inject(RealtimeService);

  private readonly canvas = viewChild<SceneCanvasComponent>('canvas');
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');
  public readonly focusEffect = effect(() => {
    const tokenId = this.tokensStore.focusRequest();
    const canvas = this.canvas();
    if (tokenId !== null && canvas !== undefined) {
      canvas.focusToken(tokenId);
      this.tokensStore.consumeFocus();
    }
  });

  private presenceSubscription: Subscription | null = null;

  public readonly campaignId = input<string>();

  public readonly mode = this.campaign.mode;
  public readonly activeScene = this.campaign.activeScene;
  public readonly backgroundTransform = computed(
    () => this.activeScene()?.backgroundTransform ?? defaultBackgroundTransform,
  );

  public readonly mapImage = this.campaign.mapImage;
  public readonly notice = this.ui.notice;
  public readonly statusMessage = this.ui.statusMessage;
  public readonly busy = this.ui.busy;

  public readonly settingsOpen = this.campaign.settingsOpen;
  public readonly newSceneFog = this.campaign.newSceneFog;
  public readonly fogConfirm = this.fog.fogConfirm;
  public readonly fogOverrideActive = this.fog.fogOverrideActive;

  public readonly takeTargetOpen = signal(false);
  public readonly maps = this.campaign.maps;
  public readonly mapPickerOpen = this.campaign.mapPickerOpen;
  public readonly mapsLoading = this.campaign.mapsLoading;
  public readonly prepareMap = this.campaign.prepareMap;
  public readonly prepareDoc = this.campaign.prepareDoc;
  public readonly prepareName = this.campaign.prepareName;
  public readonly prepareAssignments = this.campaign.prepareAssignments;
  public readonly prepareBusy = this.campaign.prepareBusy;
  public readonly sessionBusy = this.session.sessionBusy;
  public readonly aiEnabled = this.aux.aiEnabled;
  public readonly aiMessage = this.aux.aiMessage;
  public readonly aiText = this.aux.aiText;
  public readonly aiBusy = this.aux.aiBusy;
  public readonly aiPreview = this.aux.aiPreview;
  public readonly aiName = this.aux.aiName;
  public readonly zoom = this.ui.zoom;
  public readonly selectedTokenId = this.ui.selectedTokenId;
  public readonly leftOpen = this.layout.leftOpen;
  public readonly rightOpen = this.layout.rightOpen;
  public readonly dockOpen = this.layout.dockOpen;
  public readonly dockTab = this.layout.dockTab;
  public readonly diceOpen = this.campaign.diceOpen;
  public readonly sections = this.layout.sections;

  public readonly includePrivateNotes = this.aux.includePrivateNotes;

  public readonly loginError = computed(() => this.auth.error());
  public readonly hasCampaigns = computed(() => this.shell.campaigns().length > 0);
  public readonly snapshot = computed(() => this.sceneStore.snapshot());
  public readonly state = this.fog.state;
  public readonly tokens = this.tokensStore.tokens;
  public readonly grid = this.fog.grid;
  public readonly sceneDoors = this.fog.sceneDoors;

  public readonly sceneLights = this.fog.sceneLights;
  public readonly partyPcs = computed(() => this.shell.party().filter((actor) => actor.kind === 'pc'));
  public readonly startOptions = computed(() => this.prepareDoc()?.playerStarts ?? []);
  public readonly dmDoors = computed<PublicDoor[]>(() =>
    (this.state()?.terrain.walls ?? [])
      .filter((wall) => wall.kind === 'door')
      .map((wall) => ({
        id: wall.id,
        a: wall.a,
        b: wall.b,
        state: wall.door === 'open' ? 'open' : 'closed',
      })));

  public readonly visionGrid = computed<VisionGrid | null>(() => {
    const state = this.state();
    const scene = this.activeScene();
    if (state === null || scene === null || !state.terrain.visionEnabled || state.grid.type !== 'square') {
      return null;
    }
    const actors = this.shell.party();
    const sources: VisionSource[] = state.tokens.flatMap((token) => {
      const actor = token.actorId === undefined
        ? undefined
        : actors.find((entry) => entry.id === token.actorId);
      if (actor === undefined || (actor.kind !== 'pc' && token.owner !== 'players')) {
        return [];
      }
      const senses = actor.statblock.senses;
      return [{
        cell: tokenCenterCell(token),
        ...(senses.darkvision === undefined ? {} : { darkvision: senses.darkvision }),
        ...(senses.blindsight === undefined ? {} : { blindsight: senses.blindsight }),
        ...(senses.truesight === undefined ? {} : { truesight: senses.truesight }),
        ...(senses.tremorsense === undefined ? {} : { tremorsense: senses.tremorsense }),
        ...(token.light === undefined ? {} : { light: token.light }),
      }];
    });
    return computeVisionGrid({
      widthPx: scene.widthPx,
      heightPx: scene.heightPx,
      grid: state.grid,
      terrain: state.terrain,
      sources,
    });
  });

  public readonly fogBrushRadiusPx = computed(() =>
    fogBrushRadius(this.grid()?.cellSizePx ?? 100, this.sceneTools.fogBrushCells()));

  public readonly fogBrushDiameterPx = computed(() =>
    Math.round(this.fogBrushRadiusPx() * 2));

  public readonly pencilWidthPx = computed(() =>
    gridDrawingWidth(this.grid()?.cellSizePx ?? 70, this.sceneTools.pencilTenths() / 10));

  public readonly selectedToken = computed<TokenState | null>(() => {
    const id = this.selectedTokenId();
    return this.tokens().find((token) => token.id === id) ?? null;
  });

  public readonly initiative = this.tokensStore.initiative;
  public readonly undoneActions = this.fog.undoneActions;

  public readonly lastAppliedAction = this.fog.lastAppliedAction;

  public readonly canUndo = this.fog.canUndo;

  public readonly canRedo = this.fog.canRedo;

  public readonly syncLabel = computed(() => {
    const status = this.actions.status();
    if (status === 'pending') {
      return `pending ${this.actions.pending()}`;
    }
    return status;
  });

  public readonly readOnly = computed(() => this.actions.status() === 'read-only');
  public readonly slots = computed<(Actor | null)[]>(() => {
    const actors = this.shell.party().filter((actor) => actor.kind === 'pc').slice(0, 10);
    return Array.from({ length: 10 }, (_, index) => actors[index] ?? null);
  });

  public readonly availableActors = computed<Actor[]>(() =>
    this.shell.party().filter((actor) => actor.kind !== 'pc'));

  public readonly actorPortraits = computed<Record<string, ActorPortraitThumb>>(() => {
    const urls = this.shell.actorAssetUrls();
    const portraits: Record<string, ActorPortraitThumb> = {};
    for (const actor of this.shell.party()) {
      if (actor.imageAssetId === null) {
        continue;
      }
      const url = urls[actor.imageAssetId];
      if (url === undefined) {
        continue;
      }
      const portrait = actor.portrait ?? DEFAULT_ACTOR_PORTRAIT;
      portraits[actor.id] = { url, ...portrait };
    }
    return portraits;
  });

  public readonly portraitFor = (actor: Actor): ActorPortraitThumb | null => {
    if (actor.imageAssetId === null) {
      return null;
    }
    const url = this.shell.actorAssetUrls()[actor.imageAssetId];
    if (url === undefined) {
      return null;
    }
    return { url, ...(actor.portrait ?? DEFAULT_ACTOR_PORTRAIT) };
  };

  public readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  public readonly blackout = computed(() => this.regia.programState()?.blackout === true);
  public readonly airLabel = computed(() => {
    if (this.mode() !== 'ready' || this.regia.connectedDisplays() === 0) {
      return 'OFF AIR';
    }
    return this.blackout() ? 'BLACKOUT' : 'ON AIR';
  });

  public readonly measureLabel = computed(() => {
    const measure = this.sceneTools.measure();
    return measure === null ? '—' : this.units.formatDistance(measure.feet);
  });

  public readonly sessionLabel = this.session.sessionLabel;

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
    this.ui.reset();
    this.campaign.reset();
    this.sceneTools.resetVolatile();
    window.addEventListener('keydown', this.onKeydown);
    this.presenceSubscription = this.realtime.presence$.subscribe((presence) => {
      this.regia.setConnectedDisplays(presence.displays);
      const campaign = this.shell.activeCampaign();
      if (campaign !== null) {
        void this.regia.loadScreens(campaign.id);
      }
    });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.onKeydown);
      this.session.stopTimer();
      this.regia.dispose();
      this.presenceSubscription?.unsubscribe();
      this.presenceSubscription = null;
      this.realtime.disconnect();
    });
    void this.campaign.start(this.campaignId());
  }

  public async enterCampaign(id: string): Promise<void> {
    await this.campaign.enterCampaign(id, this.campaignId());
  }

  public async login(password: string): Promise<void> {
    this.ui.setBusy(true);
    try {
      const ok = await this.auth.login(password);
      if (ok) {
        await this.campaign.openCampaign(this.campaignId());
      }
    } finally {
      this.ui.setBusy(false);
    }
  }

  public async createCampaign(values: CreateCampaignValues): Promise<void> {
    await this.campaign.createCampaign(values);
  }

  public async createScene(): Promise<void> {
    await this.campaign.createScene();
  }

  public async selectScene(scene: Scene): Promise<void> {
    await this.campaign.selectScene(scene);
  }

  public async openMapPicker(): Promise<void> {
    await this.campaign.openMapPicker();
  }

  public closeMapPicker(): void {
    this.campaign.closeMapPicker();
  }

  public async chooseMap(map: MapSummary): Promise<void> {
    await this.campaign.chooseMap(map);
  }

  public closePrepare(): void {
    this.campaign.closePrepare();
  }

  public applyAssignment(change: PrepareSceneAssignment): void {
    this.campaign.applyAssignment(change);
  }

  public async startPreparedMap(): Promise<void> {
    await this.campaign.startPreparedMap();
  }

  public async toggleDoor(wall: SceneState['terrain']['walls'][number]): Promise<void> {
    await this.fog.toggleDoor(this.activeScene(), wall);
  }

  public async toggleLight(light: SceneState['terrain']['lights'][number]): Promise<void> {
    await this.fog.toggleLight(this.activeScene(), light);
  }

  public async toggleVision(event: Event): Promise<void> {
    await this.fog.toggleVision(
      this.activeScene(),
      (event.target as HTMLInputElement).checked,
    );
  }

  public async changeAdvancementMode(event: Event): Promise<void> {
    const campaign = this.shell.activeCampaign();
    const mode = (event.target as HTMLSelectElement).value;
    if (campaign === null || (mode !== 'milestone' && mode !== 'xp')) {
      return;
    }
    try {
      const updated = await this.campaignsApi.patch(campaign.id, { advancementMode: mode });
      this.shell.setActiveCampaign(updated);
      this.ui.setStatusMessage(`Avanzamento: ${mode === 'xp' ? 'XP' : 'milestone'}`);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    }
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
    this.ui.setZoom(camera.scale);
  }

  public onMeasured(measure: MeasureResult | null): void {
    this.sceneTools.setMeasure(measure);
    if (measure !== null) {
      this.ui.setStatusMessage(
        `Misura: ${this.units.formatDistance(measure.feet)} (${measure.cells} celle)`,
      );
    }
  }

  private persistLayout(): void {
    const campaign = this.shell.activeCampaign();
    if (campaign !== null) {
      this.layout.persist(campaign.id);
    }
  }

  public setDockTab(tab: DockTab): void {
    this.layout.setDockTab(tab);
    this.persistLayout();
    const campaign = this.shell.activeCampaign();
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
    this.ui.setStatusMessage(`Tiro: ${roll.total} (${roll.formula})`);
  }

  public async rollInitiative(): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.rollInitiative(scene);
  }

  public async updateInitiativeValue(entryId: string, event: Event): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.updateInitiativeValue(scene, entryId, event);
  }

  public async sortInitiative(): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.sortInitiative(scene);
  }

  public async nextInitiativeTurn(): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.nextTurn(scene);
  }

  public async endInitiative(): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.endInitiative(scene);
  }

  public async changeTokenHp(token: TokenState, delta: number): Promise<void> {
    await this.tokensStore.changeTokenHp(this.activeScene()?.id ?? null, token, delta);
  }

  public readonly tokenHp = this.tokensStore.tokenHp;

  public async undoLast(): Promise<void> {
    await this.fog.undoLast(this.activeScene());
  }

  public async undoThrough(entryId: string): Promise<void> {
    await this.fog.undoThrough(this.activeScene(), entryId);
  }

  public async redoLastBatch(): Promise<void> {
    await this.fog.redoLastBatch(this.activeScene());
  }

  public async onTokenMoved(event: TokenMoveEvent): Promise<void> {
    await this.tokensStore.onTokenMoved(this.activeScene()?.id ?? null, event);
  }

  public async onActorDropped(event: ActorDropEvent): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.onActorDropped(scene, event);
  }

  public async addActorToMap(actor: Actor): Promise<void> {
    const scene = this.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.addActorToMap(scene, actor);
  }

  public onTokenSelected(tokenId: string | null): void {
    this.tokensStore.select(tokenId);
  }

  public async toggleTokenVisibility(token: TokenState): Promise<void> {
    await this.tokensStore.toggleVisibility(this.activeScene()?.id ?? null, token);
  }

  public async removeToken(token: TokenState): Promise<void> {
    await this.tokensStore.remove(this.activeScene()?.id ?? null, token);
  }

  public centerToken(token: TokenState): void {
    this.tokensStore.select(token.id);
    this.tokensStore.focusRequest.set(token.id);
  }

  public async changeGridType(event: Event): Promise<void> {
    await this.fog.changeGridType(this.activeScene(), event);
  }

  public async changeGridSize(event: Event): Promise<void> {
    await this.fog.changeGridSize(this.activeScene(), event);
  }

  public setFogSoftness(event: Event): void {
    this.sceneTools.setFogSoftness(Number((event.target as HTMLInputElement).value));
  }

  public setFogSnap(event: Event): void {
    this.sceneTools.setFogSnap((event.target as HTMLInputElement).checked);
  }

  public openSettings(): void {
    this.settingsOpen.set(true);
  }

  public closeSettings(): void {
    this.settingsOpen.set(false);
  }

  public async clearHistory(): Promise<void> {
    if (await this.fog.clearHistory()) {
      this.settingsOpen.set(false);
    }
  }

  public async resetFog(): Promise<void> {
    if (await this.fog.resetFog(this.activeScene()?.id ?? null)) {
      this.settingsOpen.set(false);
    }
  }

  public async onFogApplied(op: FogOp): Promise<void> {
    await this.fog.onFogApplied(this.activeScene()?.id ?? null, op);
  }

  public async onDrawingAdded(drawing: Drawing): Promise<void> {
    await this.fog.onDrawingAdded(this.activeScene()?.id ?? null, drawing);
  }

  public revealAll(): void {
    this.fog.revealAll();
  }

  public hideAll(): void {
    this.fog.hideAll();
  }

  public async confirmFogChange(): Promise<void> {
    await this.fog.confirm(this.activeScene());
  }

  public async clearFogOverride(): Promise<void> {
    await this.fog.clearOverride(this.activeScene()?.id ?? null);
  }

  public cancelFogChange(): void {
    this.fog.cancel();
  }

  public exportPng(): void {
    this.canvas()?.exportPng();
  }

  public async openScreen(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null || this.regia.busy()) {
      return;
    }
    try {
      const display = await this.regia.createDisplay(campaign.id);
      window.open(`/display/${display.code}`, '_blank');
      this.ui.setStatusMessage(`Schermo aperto: ${display.code}`);
    } catch (error) {
      this.ui.setStatusMessage(messageFor(error));
    }
  }

  public takeScene(): void {
    const online = this.regia.screens();
    if (online.length === 0) {
      this.ui.setNotice('Nessuno schermo online: apri uno schermo prima di mandare in onda.');
      return;
    }
    if (online.length === 1 && online[0] !== undefined) {
      void this.takeSceneTo(online[0]);
      return;
    }
    this.takeTargetOpen.set(true);
  }

  public async takeSceneTo(summary: ScreenSummary): Promise<void> {
    const campaign = this.shell.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null || this.regia.busy()) {
      return;
    }
    this.takeTargetOpen.set(false);
    const startView = this.sceneStore.snapshot()?.state.startView;
    try {
      const display = await this.regia.takeSceneTo(
        campaign.id,
        scene,
        summary,
        startView,
      );
      this.ui.setStatusMessage(`In onda su ${display.code}: ${scene.name}`);
    } catch (error) {
      this.ui.setStatusMessage(messageFor(error));
    }
  }

  public async toggleBlackout(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null || this.regia.busy()) {
      return;
    }
    try {
      const updated = await this.regia.putProgram(campaign.id, (state) => ({
        ...state,
        blackout: !state.blackout,
        updatedAt: new Date().toISOString(),
      }));
      this.ui.setStatusMessage(updated.state.blackout ? 'Schermo in blackout' : 'Schermo riacceso');
    } catch (error) {
      this.ui.setStatusMessage(messageFor(error));
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
      this.ui.setStatusMessage(`${actor.name}: trascina lo slot sulla mappa per schierarlo.`);
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
    this.layout.toggleLeft();
    this.persistLayout();
  }

  public toggleSection(section: SidebarSectionId): void {
    const opening = this.layout.toggleSection(section);
    this.persistLayout();
    if (opening && section === 'screens') {
      const campaign = this.shell.activeCampaign();
      if (campaign !== null) {
        void this.regia.loadScreens(campaign.id);
      }
    }
  }

  public isSectionOpen(section: SidebarSectionId): boolean {
    return this.layout.sections()[section];
  }

  public toggleRight(): void {
    this.layout.toggleRight();
    this.persistLayout();
  }

  public toggleDock(): void {
    this.layout.toggleDock();
    this.persistLayout();
  }

  public async syncNow(): Promise<void> {
    await this.actions.syncNow();
    this.ui.setStatusMessage('Stato riallineato dal server.');
  }

  public async analyzeStatblock(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    await this.aux.analyze(campaign.id);
  }

  public async createParsedMonster(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    await this.aux.createMonster(campaign.id);
  }

  public setAiText(event: Event): void {
    this.aux.setText((event.target as HTMLTextAreaElement).value);
  }

  public setAiName(event: Event): void {
    this.aux.setName((event.target as HTMLInputElement).value);
  }

  public async exportCampaign(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    await this.aux.export(campaign.id);
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
      const result = await this.aux.import(file);
      this.shell.addCampaign(result.campaign);
      await this.enterCampaign(result.campaign.id);
      this.ui.setStatusMessage(
        `Importata: ${result.imported.scenes} scene, ${result.imported.actors} attori`,
      );
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    }
  }

  public openCreate(): void {
    this.ui.setNotice(null);
    this.mode.set('create');
  }

  public openChoose(): void {
    this.ui.setNotice(null);
    this.realtime.disconnect();
    this.regia.setConnectedDisplays(0);
    this.regia.closeScreenDialog();
    this.mode.set('choose');
  }

  public closeChoose(): void {
    const campaign = this.shell.activeCampaign();
    if (campaign !== null) {
      this.mode.set('ready');
      this.realtime.connectDm(campaign.id);
    }
  }

  public closeCreate(): void {
    if (this.hasCampaigns()) {
      this.mode.set(this.shell.activeCampaign() === null ? 'choose' : 'ready');
    }
  }

  public setIncludePrivateNotes(event: Event): void {
    this.aux.setIncludePrivateNotes((event.target as HTMLInputElement).checked);
  }
}

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
    413: 'Il file supera il limite di upload.',
    415: 'Formato non supportato: usa PNG, JPEG o WebP.',
  },
});
