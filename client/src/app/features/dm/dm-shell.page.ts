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
import { Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import {
  DEFAULT_ACTOR_PORTRAIT,
  defaultBackgroundTransform,
  computeVisionGrid,
  fogBrushRadius,
  gridDrawingWidth,
  isTiledMap,
  tokenCenterCell,
  type Actor,
  type ActionLogEntry,
  type DiceRoll,
  type Drawing,
  type FogOp,
  type GridConfig,
  type MapDocument,
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
import { AssetService } from '../../core/asset.service';
import { AuthService } from '../../core/auth.service';
import { CampaignService } from '../../core/campaign.service';
import { httpMessage } from '../../core/http-error';
import { DiceStore } from '../../core/dice.store';
import { MeasurementService } from '../../core/measurement.service';
import { LastCampaignService } from '../../core/last-campaign.service';
import { MapService } from '../../core/map.service';
import { RealtimeService } from '../../core/realtime.service';
import { SceneActionService } from '../../core/scene-action.service';
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
  type SceneMapImage,
  type TokenMoveEvent,
} from '../scene/scene-canvas.component';

type ShellMode = 'loading' | 'login' | 'create' | 'choose' | 'ready' | 'error';

const toMapDocument = (map: {
  name: string;
  imageAssetId: string | null;
  backgroundTransform: MapDocument['backgroundTransform'];
  widthPx: number;
  heightPx: number;
  grid: GridConfig;
  terrain: MapDocument['terrain'];
  spawns: MapDocument['spawns'];
  playerStarts: MapDocument['playerStarts'];
  startView?: MapDocument['startView'];
  fogBase: MapDocument['fogBase'];
  showDoorIcons: boolean;
  notes: string;
}): MapDocument => ({
  name: map.name,
  imageAssetId: map.imageAssetId,
  backgroundTransform: map.backgroundTransform,
  widthPx: map.widthPx,
  heightPx: map.heightPx,
  grid: map.grid,
  terrain: map.terrain,
  spawns: map.spawns,
  playerStarts: map.playerStarts,
  ...(map.startView === undefined ? {} : { startView: map.startView }),
  fogBase: map.fogBase,
  showDoorIcons: map.showDoorIcons,
  notes: map.notes,
});

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
  private readonly assetsApi = inject(AssetService);
  private readonly lastCampaign = inject(LastCampaignService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  public readonly sceneStore = inject(SceneStore);
  public readonly actions = inject(ActionStore);
  public readonly dice = inject(DiceStore);
  public readonly units = inject(MeasurementService);
  public readonly sceneTools = inject(SceneToolsStore);
  public readonly tokensStore = inject(SceneTokensStore);
  public readonly regia = inject(RegiaStore);
  public readonly shell = inject(CampaignShellStore);
  public readonly layout = inject(DmLayoutStore);
  public readonly ui = inject(DmUiStore);
  public readonly session = inject(DmSessionStore);
  public readonly aux = inject(DmAuxStore);
  private readonly sceneActions = inject(SceneActionService);
  private readonly mapsApi = inject(MapService);
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

  public readonly mode = signal<ShellMode>('loading');
  public readonly activeScene = signal<Scene | null>(null);
  public readonly backgroundTransform = computed(
    () => this.activeScene()?.backgroundTransform ?? defaultBackgroundTransform,
  );

  public readonly mapImage = signal<SceneMapImage | null>(null);
  public readonly notice = this.ui.notice;
  public readonly statusMessage = this.ui.statusMessage;
  public readonly busy = this.ui.busy;

  public readonly settingsOpen = signal(false);
  public readonly newSceneFog = signal<'hidden' | 'revealed'>('hidden');
  public readonly fogConfirm = signal<'reveal' | 'hide' | null>(null);
  public readonly fogOverrideActive = computed(() => this.state()?.terrain.visionEnabled === true
    && this.state()?.grid.type === 'square');

  public readonly takeTargetOpen = signal(false);
  public readonly maps = signal<MapSummary[]>([]);
  public readonly mapPickerOpen = signal(false);
  public readonly mapsLoading = signal(false);
  public readonly prepareMap = signal<MapSummary | null>(null);
  public readonly prepareDoc = signal<MapDocument | null>(null);
  public readonly prepareName = signal('');
  public readonly prepareAssignments = signal<Record<string, string>>({});
  public readonly prepareBusy = signal(false);
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
  public readonly diceOpen = signal(false);
  public readonly sections = this.layout.sections;

  public readonly includePrivateNotes = this.aux.includePrivateNotes;

  public readonly loginError = computed(() => this.auth.error());
  public readonly hasCampaigns = computed(() => this.shell.campaigns().length > 0);
  public readonly snapshot = computed(() => this.sceneStore.snapshot());
  public readonly state = computed<SceneState | null>(() => this.sceneStore.snapshot()?.state ?? null);
  public readonly tokens = this.tokensStore.tokens;
  public readonly grid = computed<GridConfig | null>(() => this.state()?.grid ?? null);
  public readonly sceneDoors = computed(() =>
    (this.state()?.terrain.walls ?? []).filter((wall) => wall.kind === 'door'));

  public readonly sceneLights = computed(() => this.state()?.terrain.lights ?? []);
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
      this.ui.reset();
      this.regia.dispose();
      this.presenceSubscription?.unsubscribe();
      this.presenceSubscription = null;
      this.realtime.disconnect();
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
    const campaigns = await this.shell.loadCampaigns();
    const requested = this.campaignId();
    const fromRoute = requested === undefined
      ? undefined
      : campaigns.find((campaign) => campaign.id === requested);
    if (requested !== undefined && fromRoute === undefined) {
      this.lastCampaign.clear();
      this.ui.setNotice('La campagna richiesta non esiste più.');
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
    this.ui.setBusy(true);
    try {
      const campaign = await this.shell.selectCampaign(id);
      this.sceneTools.resetVolatile();
      this.newSceneFog.set(campaign.fogDefault);
      this.lastCampaign.write(campaign.id);
      this.ui.setNotice(null);
      this.layout.restore(campaign.id);
      const scenes = await this.shell.loadScenes(campaign.id);
      await this.shell.loadActors(campaign.id);
      await this.regia.loadScreens(campaign.id);
      await this.dice.load(campaign.id);
      await this.regia.loadProgram(campaign.id);
      this.realtime.connectDm(campaign.id);
      await this.shell.loadSessions(campaign.id);
      await this.aux.load();
      const active = this.shell.activeSession();
      this.session.sync(active);
      const target = scenes.find((scene) => scene.id === campaign.activeSceneId) ?? scenes[0];
      if (target !== undefined) {
        if (campaign.activeSceneId !== target.id) {
          const updated = await this.campaignsApi.patch(campaign.id, { activeSceneId: target.id });
          this.shell.setActiveCampaign(updated);
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
      this.mode.set('ready');
    } catch (error) {
      this.lastCampaign.clear();
      this.ui.setNotice(messageFor(error));
      this.mode.set(this.shell.campaigns().length === 0 ? 'create' : 'choose');
    } finally {
      this.ui.setBusy(false);
    }
  }

  private async loadScene(scene: Scene): Promise<void> {
    this.activeScene.set(scene);
    this.ui.setSelectedTokenId(null);
    this.sceneTools.setMeasure(null);
    this.sceneStore.clear();
    await this.sceneStore.load(scene.id);
    const campaign = this.shell.activeCampaign();
    if (campaign !== null) {
      this.actions.start(campaign.id, scene.id);
      this.layout.restore(campaign.id);
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
        width: scene.widthPx,
        height: scene.heightPx,
        imageWidth: asset.width,
        imageHeight: asset.height,
        tiled: isTiledMap(asset.width, asset.height),
      });
    } catch {
      this.mapImage.set(null);
      this.ui.setNotice('La mappa della scena non è disponibile.');
    }
  }

  public async login(password: string): Promise<void> {
    this.ui.setBusy(true);
    try {
      const ok = await this.auth.login(password);
      if (ok) {
        await this.openCampaign();
      }
    } finally {
      this.ui.setBusy(false);
    }
  }

  public async createCampaign(values: CreateCampaignValues): Promise<void> {
    const name = values.name.trim();
    if (name === '') {
      return;
    }
    this.ui.setBusy(true);
    try {
      const created = await this.campaignsApi.create({
        name,
        description: values.description.trim(),
        advancementMode: values.advancementMode,
        fogDefault: 'hidden',
      });
      this.shell.addCampaign(created);
      await this.enterCampaign(created.id);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    } finally {
      this.ui.setBusy(false);
    }
  }

  public async createScene(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    this.ui.setBusy(true);
    try {
      const scene = await this.campaignsApi.createScene(campaign.id, {
        name: `Scena ${this.shell.scenes().length + 1}`,
        widthPx: 1920,
        heightPx: 1080,
        fogBase: this.newSceneFog(),
      });
      this.shell.prependScene(scene);
      const refreshed = await this.campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
      this.shell.setActiveCampaign(refreshed);
      this.ui.setStatusMessage(`Scena creata: ${scene.name}`);
      await this.loadScene(scene);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    } finally {
      this.ui.setBusy(false);
    }
  }

  public async selectScene(scene: Scene): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null || scene.id === this.activeScene()?.id) {
      return;
    }
    this.ui.setStatusMessage(`Scena: ${scene.name}`);
    try {
      const updated = await this.campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
      this.shell.setActiveCampaign(updated);
      await this.loadScene(scene);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    }
  }

  public async openMapPicker(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    this.mapsLoading.set(true);
    this.mapPickerOpen.set(true);
    try {
      this.maps.set(await this.mapsApi.list(campaign.id));
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    } finally {
      this.mapsLoading.set(false);
    }
  }

  public closeMapPicker(): void {
    this.mapPickerOpen.set(false);
  }

  public async chooseMap(map: MapSummary): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    try {
      const doc = await this.mapsApi.get(map.id);
      this.prepareMap.set(map);
      this.prepareDoc.set(toMapDocument(doc));
      this.prepareName.set(doc.name);
      const assignments: Record<string, string> = {};
      const starts = doc.playerStarts;
      this.partyPcs().forEach((actor, index) => {
        const start = starts[index];
        if (start !== undefined) {
          assignments[actor.id] = start.id;
        }
      });
      this.prepareAssignments.set(assignments);
      this.mapPickerOpen.set(false);
      this.ui.setNotice(null);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    }
  }

  public closePrepare(): void {
    this.prepareMap.set(null);
    this.prepareDoc.set(null);
    this.prepareAssignments.set({});
  }

  public applyAssignment(change: PrepareSceneAssignment): void {
    this.prepareAssignments.update((current) => {
      const next = { ...current };
      if (change.startId === '') {
        delete next[change.actorId];
      } else {
        next[change.actorId] = change.startId;
      }
      return next;
    });
  }

  public async startPreparedMap(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    const map = this.prepareMap();
    if (campaign === null || map === null || this.prepareBusy()) {
      return;
    }
    const assignments = this.prepareAssignments();
    this.prepareBusy.set(true);
    try {
      const result = await this.mapsApi.createScene(campaign.id, {
        mapId: map.id,
        name: this.prepareName().trim() || map.name,
        playerAssignments: Object.entries(assignments).map(([actorId, startId]) => ({
          actorId,
          startId,
        })),
      });
      const updated = await this.campaignsApi.get(campaign.id);
      this.shell.setActiveCampaign(updated);
      const scenes = await this.shell.loadScenes(campaign.id);
      const scene = scenes.find((entry) => entry.id === result.sceneId);
      this.closePrepare();
      if (scene !== undefined) {
        await this.loadScene(scene);
      }
      this.ui.setStatusMessage(`Scena avviata: ${map.name}`);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    } finally {
      this.prepareBusy.set(false);
    }
  }

  public async toggleDoor(wall: SceneState['terrain']['walls'][number]): Promise<void> {
    if (wall.kind !== 'door') {
      return;
    }
    await this.tokensStore.send(this.activeScene()?.id ?? null, {
      type: 'terrain.door',
      wallId: wall.id,
      state: wall.door === 'open' ? 'closed' : 'open',
    });
  }

  public async toggleLight(light: SceneState['terrain']['lights'][number]): Promise<void> {
    await this.tokensStore.send(
      this.activeScene()?.id ?? null,
      { type: 'terrain.light', lightId: light.id, enabled: !light.enabled },
    );
  }

  public async toggleVision(event: Event): Promise<void> {
    await this.tokensStore.send(this.activeScene()?.id ?? null, {
      type: 'terrain.vision',
      enabled: (event.target as HTMLInputElement).checked,
    });
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
    const campaign = this.shell.activeCampaign();
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
    const campaign = this.shell.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    try {
      const result = await this.sceneActions.undo(campaign.id, entryId);
      await this.sceneStore.load(scene.id);
      await this.actions.refreshHistory(campaign.id);
      this.ui.setStatusMessage(`${result.undone} azioni annullate.`);
    } catch {
      this.ui.setStatusMessage('Annullamento non riuscito.');
    }
  }

  public async redoLastBatch(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    try {
      const result = await this.sceneActions.redo(campaign.id);
      await this.sceneStore.load(scene.id);
      await this.actions.refreshHistory(campaign.id);
      this.ui.setStatusMessage(`${result.redone} azioni ripristinate.`);
    } catch {
      this.ui.setStatusMessage('Nessuna azione da ripetere.');
    }
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
    if (this.activeScene()?.mapId) {
      this.ui.setNotice('Griglia bloccata: modificala dall’editor della mappa.');
      return;
    }
    const value = (event.target as HTMLSelectElement).value;
    const grid = this.grid();
    if (grid === null || (value !== 'square' && value !== 'hex')) {
      return;
    }
    await this.tokensStore.send(
      this.activeScene()?.id ?? null,
      { type: 'grid.update', grid: { ...grid, type: value } },
    );
    this.ui.setStatusMessage(value === 'hex' ? 'Griglia esagonale odd-r' : 'Griglia quadrata');
  }

  public async changeGridSize(event: Event): Promise<void> {
    if (this.activeScene()?.mapId) {
      this.ui.setNotice('Griglia bloccata: modificala dall’editor della mappa.');
      return;
    }
    const value = Number((event.target as HTMLInputElement).value);
    const grid = this.grid();
    if (grid === null || !Number.isFinite(value)) {
      return;
    }
    const cellSizePx = Math.max(16, Math.min(400, Math.round(value)));
    await this.tokensStore.send(
      this.activeScene()?.id ?? null,
      { type: 'grid.update', grid: { ...grid, cellSizePx } },
    );
    this.ui.setStatusMessage(`Cella: ${cellSizePx} px`);
  }

  public setNewSceneFog(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'hidden' || value === 'revealed') {
      this.newSceneFog.set(value);
    }
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
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    try {
      const result = await this.sceneActions.clearHistory(campaign.id);
      await this.actions.refreshHistory(campaign.id);
      this.settingsOpen.set(false);
      this.ui.setStatusMessage(`History svuotata: ${result.cleared} azioni rimosse.`);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    }
  }

  public async resetFog(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    try {
      const result = await this.sceneActions.resetFog(campaign.id, scene.id);
      await this.sceneStore.load(scene.id);
      await this.actions.refreshHistory(campaign.id);
      this.settingsOpen.set(false);
      this.ui.setStatusMessage(`FOG ripristinata: ${result.cleared} azioni fog rimosse.`);
    } catch (error) {
      this.ui.setNotice(messageFor(error));
    }
  }

  public async onFogApplied(op: FogOp): Promise<void> {
    await this.tokensStore.send(this.activeScene()?.id ?? null, { type: 'fog.apply', op });
    this.ui.setStatusMessage(op.op === 'reveal' ? 'Fog: area rivelata' : 'Fog: area nascosta');
  }

  public async onDrawingAdded(drawing: Drawing): Promise<void> {
    await this.tokensStore.send(this.activeScene()?.id ?? null, { type: 'drawing.add', drawing });
    this.ui.setStatusMessage('Disegno aggiunto');
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
    if (this.fogOverrideActive()) {
      await this.tokensStore.send(
        this.activeScene()?.id ?? null,
        { type: 'fog.override', override: mode },
      );
      this.ui.setStatusMessage(mode === 'reveal' ? 'Fog: rivela tutto' : 'Fog: nascondi tutto');
      return;
    }
    if (mode === 'reveal') {
      await this.tokensStore.send(
        this.activeScene()?.id ?? null,
        { type: 'fog.replace', base: 'revealed', ops: [] },
      );
      this.ui.setStatusMessage('Fog: tutta la mappa rivelata');
    } else {
      await this.tokensStore.send(
        this.activeScene()?.id ?? null,
        { type: 'fog.replace', base: 'hidden', ops: [] },
      );
      this.ui.setStatusMessage('Fog: tutta la mappa nascosta');
    }
  }

  public async clearFogOverride(): Promise<void> {
    await this.tokensStore.send(this.activeScene()?.id ?? null, { type: 'fog.override', override: 'none' });
    this.ui.setStatusMessage('Fog: torna alla visione automatica');
  }

  public cancelFogChange(): void {
    this.fogConfirm.set(null);
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
