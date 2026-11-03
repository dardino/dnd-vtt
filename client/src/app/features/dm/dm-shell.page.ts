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
import type { Subscription } from 'rxjs';
import {
  abilityModifier,
  DEFAULT_ACTOR_PORTRAIT,
  defaultBackgroundTransform,
  SIZE_CELLS,
  computeVisionGrid,
  fogBrushRadius,
  gridDrawingWidth,
  isTiledMap,
  newId,
  snapTokenCell,
  sortInitiativeEntries,
  tokenCenterCell,
  type Actor,
  type ActionLogEntry,
  type AppliedAction,
  type CampaignExport,
  type DiceRoll,
  type Drawing,
  type FogOp,
  type GameAction,
  type GridConfig,
  type InitiativeEntry,
  type MapDocument,
  type MapSummary,
  type MeasureResult,
  type MonsterStatblock,
  type PublicDoor,
  type Scene,
  type SceneState,
  type TokenState,
  type VisionGrid,
  type VisionSource,
} from '@dnd-vtt/shared';
import { ActionStore } from '../../core/action.store';
import { ActorService } from '../../core/actor.service';
import { AiService } from '../../core/ai.service';
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
import { Dialog } from '../../components/dialog/dialog';
import { DiceOverlayComponent } from '../dice/dice-overlay.component';
import { ActorList } from './actor-list';
import { CampaignShellStore } from './campaign-shell.store';
import { AuthSessionsPanel } from './auth-sessions-panel';
import { RegiaStore, type ScreenSummary } from './regia.store';
import { SceneList } from './scene-list';
import { SceneToolbar } from './scene-toolbar';
import { SceneToolsStore } from './scene-tools.store';
import { ScreenList } from './screen-list';
import { ScreenPreviewComponent } from './screen-preview.component';
import { SessionCard } from './session-card';
import { SidebarSection } from './sidebar-section';
import {
  SceneCanvasComponent,
  type ActorDropEvent,
  type ActorPortraitThumb,
  type SceneMapImage,
  type TokenMoveEvent,
} from '../scene/scene-canvas.component';

type ShellMode = 'loading' | 'login' | 'create' | 'choose' | 'ready' | 'error';
type SidebarSectionId = 'campaign' | 'scenes' | 'grid' | 'fog' | 'scenography' | 'actors' | 'ai' | 'screens' | 'devices' | 'tokens';

const DEFAULT_SECTIONS: Record<SidebarSectionId, boolean> = {
  campaign: true,
  scenes: true,
  grid: true,
  fog: true,
  scenography: true,
  actors: true,
  ai: true,
  screens: true,
  devices: true,
  tokens: true,
};

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

const PANEL_STORAGE_PREFIX = 'dnd-vtt:panels:';

@Component({
  selector: 'app-dm-shell',
  imports: [
    ActorList,
    Button,
    Dialog,
    RouterLink,
    SceneCanvasComponent,
    SceneList,
    SceneToolbar,
    DiceOverlayComponent,
    ScreenList,
    ScreenPreviewComponent,
    SessionCard,
    SidebarSection,
    AuthSessionsPanel,
  ],
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
  public readonly units = inject(MeasurementService);
  public readonly sceneTools = inject(SceneToolsStore);
  public readonly regia = inject(RegiaStore);
  public readonly shell = inject(CampaignShellStore);
  private readonly sceneActions = inject(SceneActionService);
  private readonly mapsApi = inject(MapService);
  private readonly ai = inject(AiService);
  private readonly realtime = inject(RealtimeService);

  private readonly canvas = viewChild<SceneCanvasComponent>('canvas');
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private presenceSubscription: Subscription | null = null;

  public readonly campaignId = input<string>();

  public readonly mode = signal<ShellMode>('loading');
  public readonly activeScene = signal<Scene | null>(null);
  public readonly backgroundTransform = computed(
    () => this.activeScene()?.backgroundTransform ?? defaultBackgroundTransform,
  );

  public readonly mapImage = signal<SceneMapImage | null>(null);
  public readonly notice = signal<string | null>(null);
  public readonly statusMessage = signal('Console pronta.');
  public readonly busy = signal(false);

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
  public readonly sessionBusy = signal(false);
  public readonly aiEnabled = signal(false);
  public readonly aiMessage = signal('Chat IA non configurata.');
  public readonly aiText = signal('');
  public readonly aiBusy = signal(false);
  public readonly aiPreview = signal<MonsterStatblock | null>(null);
  public readonly aiName = signal('Mostro importato');
  public readonly zoom = signal(1);
  public readonly selectedTokenId = signal<string | null>(null);
  public readonly leftOpen = signal(true);
  public readonly rightOpen = signal(true);
  public readonly dockOpen = signal(true);
  public readonly dockTab = signal<'initiative' | 'dice' | 'actions'>('initiative');
  public readonly diceOpen = signal(false);
  public readonly sections = signal<Record<SidebarSectionId, boolean>>({ ...DEFAULT_SECTIONS });
  public readonly sessionSeconds = signal(0);

  public readonly password = signal('');
  public readonly includePrivateNotes = signal(false);
  public readonly newName = signal('');
  public readonly newDescription = signal('');
  public readonly newAdvancement = signal<'milestone' | 'xp'>('milestone');

  public readonly loginError = computed(() => this.auth.error());
  public readonly hasCampaigns = computed(() => this.shell.campaigns().length > 0);
  public readonly snapshot = computed(() => this.sceneStore.snapshot());
  public readonly state = computed<SceneState | null>(() => this.sceneStore.snapshot()?.state ?? null);
  public readonly tokens = computed<TokenState[]>(() => this.state()?.tokens ?? []);
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

  public readonly initiative = computed(() => this.state()?.initiative ?? null);
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

  public portraitFor(actor: Actor): ActorPortraitThumb | null {
    if (actor.imageAssetId === null) {
      return null;
    }
    const url = this.shell.actorAssetUrls()[actor.imageAssetId];
    if (url === undefined) {
      return null;
    }
    return { url, ...(actor.portrait ?? DEFAULT_ACTOR_PORTRAIT) };
  }

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
      this.stopSessionTimer();
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
      const campaign = await this.shell.selectCampaign(id);
      this.sceneTools.resetVolatile();
      this.newSceneFog.set(campaign.fogDefault);
      this.lastCampaign.write(campaign.id);
      this.notice.set(null);
      this.restorePanels(campaign.id);
      const scenes = await this.shell.loadScenes(campaign.id);
      await this.shell.loadActors(campaign.id);
      await this.regia.loadScreens(campaign.id);
      await this.dice.load(campaign.id);
      await this.regia.loadProgram(campaign.id);
      this.realtime.connectDm(campaign.id);
      await this.shell.loadSessions(campaign.id);
      const ai = await this.ai.status();
      this.aiEnabled.set(ai.enabled);
      this.aiMessage.set(ai.message);
      const active = this.shell.activeSession();
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
      this.notice.set(messageFor(error));
      this.mode.set(this.shell.campaigns().length === 0 ? 'create' : 'choose');
    } finally {
      this.busy.set(false);
    }
  }

  private async loadScene(scene: Scene): Promise<void> {
    this.activeScene.set(scene);
    this.selectedTokenId.set(null);
    this.sceneTools.setMeasure(null);
    this.sceneStore.clear();
    await this.sceneStore.load(scene.id);
    const campaign = this.shell.activeCampaign();
    if (campaign !== null) {
      this.actions.start(campaign.id, scene.id);
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
        width: scene.widthPx,
        height: scene.heightPx,
        imageWidth: asset.width,
        imageHeight: asset.height,
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
      this.shell.addCampaign(created);
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
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    this.busy.set(true);
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
      this.statusMessage.set(`Scena creata: ${scene.name}`);
      await this.loadScene(scene);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public async selectScene(scene: Scene): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null || scene.id === this.activeScene()?.id) {
      return;
    }
    this.statusMessage.set(`Scena: ${scene.name}`);
    try {
      const updated = await this.campaignsApi.patch(campaign.id, { activeSceneId: scene.id });
      this.shell.setActiveCampaign(updated);
      await this.loadScene(scene);
    } catch (error) {
      this.notice.set(messageFor(error));
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
      this.notice.set(messageFor(error));
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
      this.notice.set(null);
    } catch (error) {
      this.notice.set(messageFor(error));
    }
  }

  public closePrepare(): void {
    this.prepareMap.set(null);
    this.prepareDoc.set(null);
    this.prepareAssignments.set({});
  }

  public setPrepareName(event: Event): void {
    this.prepareName.set((event.target as HTMLInputElement).value);
  }

  public setAssignment(actorId: string, event: Event): void {
    const startId = (event.target as HTMLSelectElement).value;
    this.prepareAssignments.update((current) => {
      const next = { ...current };
      if (startId === '') {
        delete next[actorId];
      } else {
        next[actorId] = startId;
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
      this.statusMessage.set(`Scena avviata: ${map.name}`);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.prepareBusy.set(false);
    }
  }

  public async toggleDoor(wall: SceneState['terrain']['walls'][number]): Promise<void> {
    if (wall.kind !== 'door') {
      return;
    }
    await this.sendAction({
      type: 'terrain.door',
      wallId: wall.id,
      state: wall.door === 'open' ? 'closed' : 'open',
    });
  }

  public async toggleLight(light: SceneState['terrain']['lights'][number]): Promise<void> {
    await this.sendAction({ type: 'terrain.light', lightId: light.id, enabled: !light.enabled });
  }

  public async toggleVision(event: Event): Promise<void> {
    await this.sendAction({
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
      this.statusMessage.set(`Avanzamento: ${mode === 'xp' ? 'XP' : 'milestone'}`);
    } catch (error) {
      this.notice.set(messageFor(error));
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
    this.zoom.set(camera.scale);
  }

  public onMeasured(measure: MeasureResult | null): void {
    this.sceneTools.setMeasure(measure);
    if (measure !== null) {
      this.statusMessage.set(
        `Misura: ${this.units.formatDistance(measure.feet)} (${measure.cells} celle)`,
      );
    }
  }

  public setDockTab(tab: 'initiative' | 'dice' | 'actions'): void {
    this.dockTab.set(tab);
    this.dockOpen.set(true);
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
    this.statusMessage.set(`Tiro: ${roll.total} (${roll.formula})`);
  }

  public async rollInitiative(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    const scene = this.activeScene();
    if (campaign === null || scene === null) {
      return;
    }
    const entries: InitiativeEntry[] = [];
    for (const token of this.tokens()) {
      const actor = this.shell.party().find((entry) => entry.id === token.actorId);
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
        id: newId(),
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
    const actor = this.shell.party().find((entry) => entry.id === token.actorId);
    const tiebreak = actor === undefined ? 0 : abilityModifier(actor.statblock.abilities.dex);
    const entries = sortInitiativeEntries([
      ...initiative.entries,
      {
        id: newId(),
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
    await this.setInitiative(
      sortInitiativeEntries(initiative.entries),
      initiative.active,
      initiative.round,
      0,
    );
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
      this.statusMessage.set(`${result.undone} azioni annullate.`);
    } catch {
      this.statusMessage.set('Annullamento non riuscito.');
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
    await this.sendAction({
      type: 'token.move',
      tokenId: event.tokenId,
      x: event.x,
      y: event.y,
      ...(event.force === true ? { force: true } : {}),
    });
  }

  public async onActorDropped(event: ActorDropEvent): Promise<void> {
    const actor = this.shell.party().find((entry) => entry.id === event.actorId);
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
      id: newId(),
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
    if (this.activeScene()?.mapId) {
      this.notice.set('Griglia bloccata: modificala dall’editor della mappa.');
      return;
    }
    const value = (event.target as HTMLSelectElement).value;
    const grid = this.grid();
    if (grid === null || (value !== 'square' && value !== 'hex')) {
      return;
    }
    await this.sendAction({ type: 'grid.update', grid: { ...grid, type: value } });
    this.statusMessage.set(value === 'hex' ? 'Griglia esagonale odd-r' : 'Griglia quadrata');
  }

  public async changeGridSize(event: Event): Promise<void> {
    if (this.activeScene()?.mapId) {
      this.notice.set('Griglia bloccata: modificala dall’editor della mappa.');
      return;
    }
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
    this.sceneTools.setFogSoftness(Number((event.target as HTMLInputElement).value));
  }

  public setFogSnap(event: Event): void {
    this.sceneTools.setFogSnap((event.target as HTMLInputElement).checked);
  }

  public setBrushCells(event: Event): void {
    this.sceneTools.setBrushCells(Number((event.target as HTMLInputElement).value));
  }

  public setPencilTenths(event: Event): void {
    this.sceneTools.setPencilTenths(Number((event.target as HTMLInputElement).value));
  }

  public openSettings(): void {
    this.settingsOpen.set(true);
  }

  public closeSettings(): void {
    this.settingsOpen.set(false);
  }

  public setMeasurementUnit(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.units.set(value === 'metric' ? 'metric' : 'imperial');
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
      this.statusMessage.set(`History svuotata: ${result.cleared} azioni rimosse.`);
    } catch (error) {
      this.notice.set(messageFor(error));
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
      this.statusMessage.set(`FOG ripristinata: ${result.cleared} azioni fog rimosse.`);
    } catch (error) {
      this.notice.set(messageFor(error));
    }
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
    if (this.fogOverrideActive()) {
      await this.sendAction({ type: 'fog.override', override: mode });
      this.statusMessage.set(mode === 'reveal' ? 'Fog: rivela tutto' : 'Fog: nascondi tutto');
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

  public async clearFogOverride(): Promise<void> {
    await this.sendAction({ type: 'fog.override', override: 'none' });
    this.statusMessage.set('Fog: torna alla visione automatica');
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
      this.statusMessage.set(`Schermo aperto: ${display.code}`);
    } catch (error) {
      this.statusMessage.set(messageFor(error));
    }
  }

  public takeScene(): void {
    const online = this.regia.screens();
    if (online.length === 0) {
      this.notice.set('Nessuno schermo online: apri uno schermo prima di mandare in onda.');
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
      this.statusMessage.set(`In onda su ${display.code}: ${scene.name}`);
    } catch (error) {
      this.statusMessage.set(messageFor(error));
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
      this.statusMessage.set(updated.state.blackout ? 'Schermo in blackout' : 'Schermo riacceso');
    } catch (error) {
      this.statusMessage.set(messageFor(error));
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

  public toggleSection(section: SidebarSectionId): void {
    const opening = !this.sections()[section];
    this.sections.update((current) => ({ ...current, [section]: !current[section] }));
    this.persistPanels();
    if (opening && section === 'screens') {
      const campaign = this.shell.activeCampaign();
      if (campaign !== null) {
        void this.regia.loadScreens(campaign.id);
      }
    }
  }

  public isSectionOpen(section: SidebarSectionId): boolean {
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
    const campaign = this.shell.activeCampaign();
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
    const campaign = this.shell.activeCampaign();
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
      this.shell.addActor(actor);
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
    const campaign = this.shell.activeCampaign();
    if (campaign === null || this.sessionBusy()) {
      return;
    }
    this.sessionBusy.set(true);
    try {
      const session = await this.shell.startSession(campaign.id);
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
    const campaign = this.shell.activeCampaign();
    if (campaign === null || this.sessionBusy()) {
      return;
    }
    this.sessionBusy.set(true);
    try {
      const session = await this.shell.stopSession(campaign.id);
      this.stopSessionTimer();
      this.statusMessage.set(`Sessione ${session.number} terminata`);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.sessionBusy.set(false);
    }
  }

  public async exportCampaign(): Promise<void> {
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    try {
      const bundle = await this.campaignsApi.exportCampaign(campaign.id, this.includePrivateNotes());
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
      this.shell.addCampaign(result.campaign);
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

  public updatePassword(event: Event): void {
    this.password.set(readValue(event));
  }

  public setIncludePrivateNotes(event: Event): void {
    this.includePrivateNotes.set((event.target as HTMLInputElement).checked);
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
    let stored: string | null;
    try {
      stored = localStorage.getItem(`${PANEL_STORAGE_PREFIX}${campaignId}`);
    } catch {
      return;
    }
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
      for (const key of Object.keys(DEFAULT_SECTIONS) as SidebarSectionId[]) {
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
    const campaign = this.shell.activeCampaign();
    if (campaign === null) {
      return;
    }
    try {
      localStorage.setItem(
        `${PANEL_STORAGE_PREFIX}${campaign.id}`,
        JSON.stringify({
          left: this.leftOpen(),
          right: this.rightOpen(),
          dock: this.dockOpen(),
          sections: this.sections(),
        }),
      );
    } catch {
      // localStorage può essere disabilitato: i pannelli restano validi per la sessione.
    }
  }

  public zoomScreen(event: WheelEvent): void {
    event.preventDefault();
    this.regia.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  public resetScreenView(): void {
    this.regia.resetView();
  }

  public startScreenPan(event: PointerEvent): void {
    if (this.regia.screenViewport() === null) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.regia.startPan(event.clientX, event.clientY);
  }

  public moveScreenPan(event: PointerEvent): void {
    this.regia.movePan(
      event.clientX,
      event.clientY,
      (event.currentTarget as HTMLElement).getBoundingClientRect(),
    );
  }

  public endScreenPan(): void {
    this.regia.endPan();
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

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
    413: 'Il file supera il limite di upload.',
    415: 'Formato non supportato: usa PNG, JPEG o WebP.',
  },
});
