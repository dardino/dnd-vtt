import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  type WritableSignal,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import {
  type Actor,
  type DiceRoll,
  type MeasureResult,
} from '@dnd-vtt/shared';
import { ActionStore } from '../../core/stores/action.store';
import { AuthService } from '../../core/auth/auth.service';
import { DiceStore } from '../../core/stores/dice.store';
import { MeasurementService } from '../../core/ui/measurement.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SceneStore } from '../../core/stores/scene.store';
import { Button } from '../../components/button/button';
import { DiceOverlayComponent } from '../dice/dice-overlay.component';
import { CampaignShellStore } from './campaign-shell.store';
import { CharacterSlots } from './character-slots';
import { ChooseCampaignDialog } from './choose-campaign-dialog';
import { CreateCampaignDialog } from './create-campaign-dialog';
import { actorSubtitle, hpRatio } from './dm-actor';
import { DmCampaignStore } from './dm-campaign.store';
import { DmCanvasController } from './dm-canvas.controller';
import { DmDock, type DockTab } from './dm-dock';
import { DmLayoutStore } from './dm-layout.store';
import { DmLeftSidebar } from './dm-left-sidebar';
import { DmKeyboardController } from './dm-keyboard.controller';
import { DmRightSidebar } from './dm-right-sidebar';
import { DmScreensStore } from './dm-screens.store';
import { DmSessionStore } from './dm-session.store';
import { DmStatusbar } from './dm-statusbar';
import { DmUiStore } from './dm-ui.store';
import { DmViewStore } from './dm-view.store';
import { FogConfirmDialog } from './fog-confirm-dialog';
import { LoginDialog } from './login-dialog';
import { MapPickerDialog } from './map-picker-dialog';
import { MapSettingsDialog } from './map-settings-dialog';
import { PrepareSceneDialog } from './prepare-scene-dialog';
import { RegiaStore } from './regia.store';
import { SceneFogStore } from './scene-fog.store';
import { SceneToolbar } from './scene-toolbar';
import { SceneTokensStore } from './scene-tokens.store';
import { SceneToolsStore } from './scene-tools.store';
import { ScreenViewerDialog } from './screen-viewer-dialog';
import { TakeTargetDialog } from './take-target-dialog';
import { SceneCanvasComponent } from '../scene/scene-canvas.component';

@Component({
  selector: 'app-dm-shell',
  imports: [
    Button,
    CharacterSlots,
    ChooseCampaignDialog,
    CreateCampaignDialog,
    DmDock,
    DmLeftSidebar,
    DmRightSidebar,
    DmStatusbar,
    FogConfirmDialog,
    LoginDialog,
    MapPickerDialog,
    MapSettingsDialog,
    PrepareSceneDialog,
    RouterLink,
    SceneCanvasComponent,
    SceneToolbar,
    DiceOverlayComponent,
    ScreenViewerDialog,
    TakeTargetDialog,
  ],
  templateUrl: './dm-shell.page.html',
  styleUrl: './dm-shell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmShellPage implements OnInit {
  private readonly auth = inject(AuthService);
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
  public readonly campaign = inject(DmCampaignStore);
  public readonly screens = inject(DmScreensStore);
  public readonly canvasController = inject(DmCanvasController);
  public readonly view = inject(DmViewStore);
  private readonly keyboard = inject(DmKeyboardController);
  private readonly realtime = inject(RealtimeService);

  private readonly canvas = viewChild<SceneCanvasComponent>('canvas');

  public constructor() {
    const detachCanvas = this.canvasController.attach(() => this.canvas());
    this.destroyRef.onDestroy(detachCanvas);
  }

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
  public readonly backgroundTransform = this.view.backgroundTransform;

  public readonly mapImage = this.campaign.mapImage;
  public readonly notice = this.ui.notice;
  public readonly statusMessage = this.ui.statusMessage;
  public readonly busy = this.ui.busy;

  public readonly settingsOpen = this.campaign.settingsOpen;
  public readonly fogConfirm = this.fog.fogConfirm;
  public readonly fogOverrideActive = this.fog.fogOverrideActive;

  /**
   * Alias scrivibile usato dal dialogo "Manda in onda": la signal dello store
   * è scrivibile a runtime, il tipo pubblico la espone come sola lettura.
   */
  public readonly takeTargetOpen
    = this.screens.takeTargetOpen as WritableSignal<boolean>;

  public readonly maps = this.campaign.maps;
  public readonly mapPickerOpen = this.campaign.mapPickerOpen;
  public readonly mapsLoading = this.campaign.mapsLoading;
  public readonly prepareMap = this.campaign.prepareMap;
  public readonly prepareDoc = this.campaign.prepareDoc;
  public readonly prepareName = this.campaign.prepareName;
  public readonly prepareAssignments = this.campaign.prepareAssignments;
  public readonly prepareBusy = this.campaign.prepareBusy;
  public readonly zoom = this.ui.zoom;
  public readonly selectedTokenId = this.ui.selectedTokenId;
  public readonly leftOpen = this.layout.leftOpen;
  public readonly rightOpen = this.layout.rightOpen;
  public readonly dockOpen = this.layout.dockOpen;
  public readonly dockTab = this.layout.dockTab;
  public readonly diceOpen = this.campaign.diceOpen;

  public readonly loginError = this.view.loginError;
  public readonly hasCampaigns = this.view.hasCampaigns;
  public readonly snapshot = this.view.snapshot;
  public readonly state = this.fog.state;
  public readonly tokens = this.tokensStore.tokens;
  public readonly grid = this.fog.grid;
  public readonly partyPcs = this.view.partyPcs;
  public readonly startOptions = this.view.startOptions;
  public readonly dmDoors = this.view.dmDoors;

  public readonly visionGrid = this.view.visionGrid;

  public readonly fogBrushRadiusPx = this.view.fogBrushRadiusPx;

  public readonly fogBrushDiameterPx = this.view.fogBrushDiameterPx;

  public readonly pencilWidthPx = this.view.pencilWidthPx;

  public readonly selectedToken = this.view.selectedToken;

  public readonly initiative = this.tokensStore.initiative;
  public readonly undoneActions = this.fog.undoneActions;

  public readonly lastAppliedAction = this.fog.lastAppliedAction;

  public readonly canUndo = this.fog.canUndo;

  public readonly canRedo = this.fog.canRedo;

  public readonly syncLabel = this.view.syncLabel;

  public readonly readOnly = this.view.readOnly;
  public readonly slots = this.view.slots;

  public readonly actorSubtitle = actorSubtitle;
  public readonly hpRatio = hpRatio;

  public readonly actorPortraits = this.view.actorPortraits;

  public readonly portraitFor = this.view.portraitFor;

  public readonly zoomLabel = this.view.zoomLabel;
  public readonly blackout = this.view.blackout;
  public readonly airLabel = this.view.airLabel;

  public readonly measureLabel = this.view.measureLabel;

  public readonly sessionLabel = this.session.sessionLabel;

  public ngOnInit(): void {
    this.ui.reset();
    this.campaign.reset();
    this.screens.reset();
    this.sceneTools.resetVolatile();
    this.keyboard.attach({
      undo: () => void this.fog.undoLast(this.activeScene()),
      redo: () => void this.fog.redoLastBatch(this.activeScene()),
      canUndo: () => this.canUndo(),
    });
    this.presenceSubscription = this.realtime.presence$.subscribe((presence) => {
      this.regia.setConnectedDisplays(presence.displays);
      const campaign = this.shell.activeCampaign();
      if (campaign !== null) {
        void this.regia.loadScreens(campaign.id);
      }
    });
    this.destroyRef.onDestroy(() => {
      this.keyboard.detach();
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

  public zoomIn(): void {
    this.canvasController.zoomIn();
  }

  public zoomOut(): void {
    this.canvasController.zoomOut();
  }

  public fitMap(): void {
    this.canvasController.fit();
  }

  public onCamera(camera: { scale: number }): void {
    this.canvasController.camera(camera);
  }

  public onMeasured(measure: MeasureResult | null): void {
    this.canvasController.measured(measure);
  }

  public setDockTab(tab: DockTab): void {
    this.layout.setDockTab(tab);
    this.layout.persistActive();
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

  public readonly tokenHp = this.tokensStore.tokenHp;

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

  public exportPng(): void {
    this.canvasController.exportPng();
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
      this.tokensStore.center(token);
    } else {
      this.ui.setStatusMessage(`${actor.name}: trascina lo slot sulla mappa per schierarlo.`);
    }
  }

  public toggleDock(): void {
    this.layout.toggleDock();
    this.layout.persistActive();
  }

  public async syncNow(): Promise<void> {
    await this.actions.syncNow();
    this.ui.setStatusMessage('Stato riallineato dal server.');
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
}
