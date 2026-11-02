import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  SCENE_PRESETS,
  sceneDimensions,
  type Campaign,
  type MapSummary,
  type Orientation,
  type ResolutionPreset,
} from '@dnd-vtt/shared';
import { CampaignService } from '../../core/campaign.service';
import { LastCampaignService } from '../../core/last-campaign.service';
import { MapService } from '../../core/map.service';
import { httpMessage } from '../../core/http-error';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

interface PresetOption {
  value: ResolutionPreset;
  label: string;
}

const presetLabels: Record<ResolutionPreset, string> = {
  '720p': '720p',
  '1080p': '1080p',
  '1440p': '1440p',
  '4k': '4K',
  'ultrawide-720p': 'Ultrawide 720p',
  'ultrawide-1080p': 'Ultrawide 1080p',
  'ultrawide-1440p': 'Ultrawide 1440p',
  'ultrawide-4k': 'Ultrawide 4K',
};

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
  private readonly lastCampaign = inject(LastCampaignService);
  private readonly router = inject(Router);

  public readonly loading = signal(true);
  public readonly busy = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly campaigns = signal<Campaign[]>([]);
  public readonly campaign = signal<Campaign | null>(null);
  public readonly maps = signal<MapSummary[]>([]);
  public readonly deleteTarget = signal<MapSummary | null>(null);

  public readonly createOpen = signal(false);
  public readonly createError = signal<string | null>(null);
  public readonly draftName = signal('');
  public readonly draftPreset = signal<ResolutionPreset>('1080p');
  public readonly draftOrientation = signal<Orientation>('landscape');

  public readonly presets: readonly PresetOption[] = (
    Object.keys(SCENE_PRESETS) as ResolutionPreset[]
  ).map((value) => ({ value, label: presetLabels[value] }));

  public readonly portraitUnavailable = computed(
    () => SCENE_PRESETS[this.draftPreset()].portrait === null,
  );

  public readonly createResolution = computed(() =>
    sceneDimensions(this.draftPreset(), this.draftOrientation()),
  );

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

  public openCreateDialog(): void {
    if (this.campaign() === null) {
      return;
    }
    this.draftName.set('Nuova mappa');
    this.draftPreset.set('1080p');
    this.draftOrientation.set('landscape');
    this.createError.set(null);
    this.error.set(null);
    this.createOpen.set(true);
  }

  public onNameInput(event: Event): void {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  public onPresetChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const preset = this.presets.find((entry) => entry.value === value);
    if (preset !== undefined) {
      this.setPreset(preset.value);
    }
  }

  public setPreset(preset: ResolutionPreset): void {
    this.draftPreset.set(preset);
    if (SCENE_PRESETS[preset].portrait === null) {
      this.draftOrientation.set('landscape');
    }
  }

  public onOrientationChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'landscape' || value === 'portrait') {
      this.setOrientation(value);
    }
  }

  public setOrientation(orientation: Orientation): void {
    if (orientation === 'portrait' && this.portraitUnavailable()) {
      return;
    }
    this.draftOrientation.set(orientation);
  }

  public async createMap(): Promise<void> {
    const campaign = this.campaign();
    if (campaign === null || this.busy()) {
      return;
    }
    const name = this.draftName().trim() || 'Nuova mappa';
    this.busy.set(true);
    this.createError.set(null);
    try {
      const map = await this.mapsApi.create(campaign.id, {
        name,
        preset: this.draftPreset(),
        orientation: this.draftOrientation(),
      });
      this.createOpen.set(false);
      await this.router.navigate(['/maps', map.id]);
    } catch (error) {
      // L'errore resta nel dialog: il backdrop coprirebbe il banner della pagina.
      this.createError.set(messageFor(error));
    } finally {
      this.busy.set(false);
    }
  }

  public resolution(map: MapSummary): string {
    return `${map.widthPx}×${map.heightPx}`;
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

const messageFor = (error: unknown): string => httpMessage(error, {
  fallback: 'Operazione non riuscita.',
  useServerMessage: true,
  byStatus: {
    401: 'Serve la password DM: accedi dalla console.',
    403: 'Serve la password DM: accedi dalla console.',
  },
});
