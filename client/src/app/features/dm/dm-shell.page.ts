import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Campaign, Scene, Actor } from '@dnd-vtt/shared';
import { AuthService } from '../../core/auth.service';
import { ActorService } from '../../core/actor.service';
import { CampaignService } from '../../core/campaign.service';
import { LastCampaignService } from '../../core/last-campaign.service';
import { SceneStore } from '../../core/scene.store';
import { ThemeService } from '../../core/theme.service';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

type ShellMode = 'loading' | 'login' | 'create' | 'choose' | 'ready' | 'error';

@Component({
  selector: 'app-dm-shell',
  imports: [Button, Dialog, RouterLink],
  templateUrl: './dm-shell.page.html',
  styleUrl: './dm-shell.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DmShellPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly campaignsApi = inject(CampaignService);
  private readonly actorsApi = inject(ActorService);
  private readonly lastCampaign = inject(LastCampaignService);
  private readonly router = inject(Router);
  public readonly theme = inject(ThemeService);
  public readonly sceneStore = inject(SceneStore);

  public readonly campaignId = input<string>();

  public readonly mode = signal<ShellMode>('loading');
  public readonly campaigns = signal<Campaign[]>([]);
  public readonly activeCampaign = signal<Campaign | null>(null);
  public readonly scenes = signal<Scene[]>([]);
  public readonly party = signal<Actor[]>([]);
  public readonly notice = signal<string | null>(null);
  public readonly busy = signal(false);

  public readonly password = signal('');
  public readonly newName = signal('');
  public readonly newDescription = signal('');
  public readonly newAdvancement = signal<'milestone' | 'xp'>('milestone');

  public readonly loginError = computed(() => this.auth.error());
  public readonly hasCampaigns = computed(() => this.campaigns().length > 0);

  public ngOnInit(): void {
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
      this.lastCampaign.write(campaign.id);
      this.mode.set('ready');
      this.notice.set(null);
      this.scenes.set(await this.campaignsApi.listScenes(campaign.id));
      this.party.set(await this.actorsApi.listByCampaign(campaign.id));
      if (campaign.activeSceneId !== null) {
        await this.sceneStore.load(campaign.activeSceneId);
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
      const scene = await this.campaignsApi.createScene(
        campaign.id,
        `Scena ${this.scenes().length + 1}`,
      );
      this.scenes.update((items) => [scene, ...items]);
      const refreshed = await this.campaignsApi.get(campaign.id);
      this.activeCampaign.set(refreshed);
      await this.sceneStore.load(scene.id);
    } catch (error) {
      this.notice.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public openCreate(): void {
    this.notice.set(null);
    this.mode.set('create');
  }

  public openChoose(): void {
    this.notice.set(null);
    this.mode.set('choose');
  }

  public closeChoose(): void {
    if (this.activeCampaign() !== null) {
      this.mode.set('ready');
    }
  }

  public closeCreate(): void {
    if (this.hasCampaigns()) {
      this.mode.set(this.activeCampaign() === null ? 'choose' : 'ready');
    }
  }

  public setTheme(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'light' || value === 'dark' || value === 'system') {
      this.theme.set(value);
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
  return 'Operazione non riuscita. Controlla il server e riprova.';
};
