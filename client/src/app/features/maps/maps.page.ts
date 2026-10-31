import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Campaign, MapSummary } from '@dnd-vtt/shared';
import { AssetService } from '../../core/asset.service';
import { CampaignService } from '../../core/campaign.service';
import { LastCampaignService } from '../../core/last-campaign.service';
import { MapService } from '../../core/map.service';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

@Component({
  selector: 'app-maps-page',
  imports: [Button, Dialog, RouterLink],
  templateUrl: './maps.page.html',
  styleUrl: './maps.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapsPage implements OnInit {
  private readonly campaignsApi = inject(CampaignService);
  private readonly mapsApi = inject(MapService);
  private readonly assets = inject(AssetService);
  private readonly lastCampaign = inject(LastCampaignService);
  private readonly router = inject(Router);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  public readonly loading = signal(true);
  public readonly busy = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly campaigns = signal<Campaign[]>([]);
  public readonly campaign = signal<Campaign | null>(null);
  public readonly maps = signal<MapSummary[]>([]);
  public readonly deleteTarget = signal<MapSummary | null>(null);

  public ngOnInit(): void {
    void this.load();
  }

  public async load(): Promise<void> {
    this.loading.set(true);
    try {
      const campaigns = await this.campaignsApi.list();
      this.campaigns.set(campaigns);
      const selected = campaigns.find((entry) => entry.id === this.lastCampaign.read())
        ?? campaigns[0]
        ?? null;
      this.campaign.set(selected);
      if (selected !== null) {
        this.lastCampaign.write(selected.id);
        this.maps.set(await this.mapsApi.list(selected.id));
      }
      this.error.set(null);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.loading.set(false);
    }
  }

  public async selectCampaign(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    const selected = this.campaigns().find((entry) => entry.id === id) ?? null;
    this.campaign.set(selected);
    if (selected === null) {
      this.maps.set([]);
      return;
    }
    this.lastCampaign.write(selected.id);
    this.busy.set(true);
    try {
      this.maps.set(await this.mapsApi.list(selected.id));
      this.error.set(null);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public openFilePicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  public async uploadMap(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const campaign = this.campaign();
    if (file === undefined || campaign === null) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const asset = await this.assets.upload(file);
      const map = await this.mapsApi.create(campaign.id, {
        name: file.name.replace(/\.[^.]+$/, '') || 'Nuova mappa',
        imageAssetId: asset.id,
      });
      await this.router.navigate(['/maps', map.id]);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public openEditor(map: MapSummary): void {
    void this.router.navigate(['/maps', map.id]);
  }

  public async duplicate(map: MapSummary): Promise<void> {
    this.busy.set(true);
    try {
      const copy = await this.mapsApi.duplicate(map.id);
      await this.load();
      await this.router.navigate(['/maps', copy.id]);
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public askDelete(map: MapSummary): void {
    this.deleteTarget.set(map);
  }

  public async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    this.deleteTarget.set(null);
    if (target === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.mapsApi.delete(target.id);
      this.maps.update((items) => items.filter((entry) => entry.id !== target.id));
    } catch (error) {
      this.error.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }
}

const messageFor = (error: unknown): string => {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401 || error.status === 403) {
      return 'Serve la password DM: accedi dalla console.';
    }
    return (error.error as { error?: { message?: string } } | null)?.error?.message
      ?? 'Operazione non riuscita.';
  }
  return 'Operazione non riuscita.';
};
