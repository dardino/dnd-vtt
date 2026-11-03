import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fogBrushRadius,
  type Actor,
  type Scene,
  type SceneState,
} from '@dnd-vtt/shared';
import { ActionStore } from '../../core/action.store';
import { httpMessage } from '../../core/http-error';
import { MeasurementService } from '../../core/measurement.service';
import { Button } from '../../components/button/button';
import { ActorList } from './actor-list';
import { CampaignShellStore } from './campaign-shell.store';
import { actorSubtitle } from './dm-actor';
import { DmAuxStore } from './dm-aux.store';
import { DmCampaignStore } from './dm-campaign.store';
import { DmLayoutStore, type SidebarSectionId } from './dm-layout.store';
import { DmSessionStore } from './dm-session.store';
import { DmUiStore } from './dm-ui.store';
import { SceneFogStore } from './scene-fog.store';
import { SceneList } from './scene-list';
import { SceneTokensStore } from './scene-tokens.store';
import { SceneToolsStore } from './scene-tools.store';
import { SessionCard } from './session-card';
import { SidebarSection } from './sidebar-section';

/**
 * Pannello sinistro della console DM: dati campagna, scene, griglia, fog,
 * scenografia, attori e chat IA. Lo stato vive negli store; qui restano i
 * binding del template e gli adattatori degli eventi DOM.
 */
@Component({
  selector: 'app-dm-left-sidebar',
  imports: [
    ActorList,
    Button,
    RouterLink,
    SceneList,
    SessionCard,
    SidebarSection,
  ],
  templateUrl: './dm-left-sidebar.html',
  styleUrl: './dm-left-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmLeftSidebar {
  public readonly layout = inject(DmLayoutStore);
  public readonly shell = inject(CampaignShellStore);
  public readonly ui = inject(DmUiStore);
  public readonly session = inject(DmSessionStore);
  public readonly campaign = inject(DmCampaignStore);
  public readonly fog = inject(SceneFogStore);
  public readonly tokensStore = inject(SceneTokensStore);
  public readonly sceneTools = inject(SceneToolsStore);
  public readonly aux = inject(DmAuxStore);
  public readonly actions = inject(ActionStore);
  public readonly units = inject(MeasurementService);

  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');

  public readonly actorSubtitle = actorSubtitle;
  public readonly sceneDoors = this.fog.sceneDoors;
  public readonly sceneLights = this.fog.sceneLights;
  public readonly availableActors = computed<Actor[]>(() =>
    this.shell.party().filter((actor) => actor.kind !== 'pc'));

  public readonly readOnly = computed(() => this.actions.status() === 'read-only');

  public readonly fogBrushRadiusPx = computed(() =>
    fogBrushRadius(this.fog.grid()?.cellSizePx ?? 100, this.sceneTools.fogBrushCells()));

  public readonly fogBrushDiameterPx = computed(() =>
    Math.round(this.fogBrushRadiusPx() * 2));

  public toggleLeft(): void {
    this.layout.toggleLeft();
    this.layout.persistActive();
  }

  public toggleSection(section: SidebarSectionId): void {
    this.layout.toggleSection(section);
    this.layout.persistActive();
  }

  public async changeAdvancementMode(event: Event): Promise<void> {
    await this.campaign.changeAdvancementMode(event);
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

  public setIncludePrivateNotes(event: Event): void {
    this.aux.setIncludePrivateNotes((event.target as HTMLInputElement).checked);
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
      await this.campaign.enterCampaign(result.campaign.id);
      this.ui.setStatusMessage(
        `Importata: ${result.imported.scenes} scene, ${result.imported.actors} attori`,
      );
    } catch (error) {
      this.ui.setNotice(httpMessage(error, AUX_ERROR));
    }
  }

  public setFogSoftness(event: Event): void {
    this.sceneTools.setFogSoftness(Number((event.target as HTMLInputElement).value));
  }

  public setFogSnap(event: Event): void {
    this.sceneTools.setFogSnap((event.target as HTMLInputElement).checked);
  }

  public async changeGridType(event: Event): Promise<void> {
    await this.fog.changeGridType(this.campaign.activeScene(), event);
  }

  public async changeGridSize(event: Event): Promise<void> {
    await this.fog.changeGridSize(this.campaign.activeScene(), event);
  }

  public async toggleVision(event: Event): Promise<void> {
    await this.fog.toggleVision(
      this.campaign.activeScene(),
      (event.target as HTMLInputElement).checked,
    );
  }

  public async toggleDoor(
    door: SceneState['terrain']['walls'][number],
  ): Promise<void> {
    await this.fog.toggleDoor(this.campaign.activeScene(), door);
  }

  public async toggleLight(
    light: SceneState['terrain']['lights'][number],
  ): Promise<void> {
    await this.fog.toggleLight(this.campaign.activeScene(), light);
  }

  public revealAll(): void {
    this.fog.revealAll();
  }

  public hideAll(): void {
    this.fog.hideAll();
  }

  public async clearFogOverride(): Promise<void> {
    await this.fog.clearOverride(this.campaign.activeScene()?.id ?? null);
  }

  public async addActorToMap(actor: Actor): Promise<void> {
    const scene = this.campaign.activeScene();
    if (scene === null) {
      return;
    }
    await this.tokensStore.addActorToMap(scene, actor);
  }

  public onActorDragStart(event: DragEvent, actor: Actor): void {
    if (event.dataTransfer === null || this.readOnly()) {
      return;
    }
    event.dataTransfer.setData('application/x-dnd-vtt-actor', actor.id);
    event.dataTransfer.effectAllowed = 'copy';
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
}

const AUX_ERROR = {
  fallback: 'Operazione non riuscita. Controlla il server e riprova.',
  byStatus: {
    404: 'La campagna non esiste più.',
    401: 'Sessione scaduta: autentica di nuovo.',
    413: 'Il file supera il limite di upload.',
    415: 'Formato non supportato: usa PNG, JPEG o WebP.',
  },
} as const;
