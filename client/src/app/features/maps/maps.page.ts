import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  SCENE_PRESETS,
  sceneDimensions,
  type Campaign,
  type MapSummary,
  type Orientation,
  type ResolutionPreset,
} from '@dnd-vtt/shared';
import { CampaignService } from '../../core/services/campaign.service';
import { LastCampaignService } from '../../core/services/last-campaign.service';
import { MapService } from '../../core/services/map.service';
import { httpMessage } from '../../core/api/http-error';
import { Button } from '../../components/button/button';
import { Dialog } from '../../components/dialog/dialog';

interface PresetOption {
  value: ResolutionPreset;
  label: string;
}

interface CreateMapFormModel {
  name: string;
  preset: ResolutionPreset;
  orientation: Orientation;
}

/** Stesso limite di `createMapSchema.name` in `@dnd-vtt/shared`. */
const NAME_MAX_LENGTH = 120;

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
  imports: [Button, Dialog, FormField, RouterLink],
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

  private readonly createModel = signal<CreateMapFormModel>({
    name: 'Nuova mappa',
    preset: '1080p',
    orientation: 'landscape',
  });

  public readonly createForm = form(this.createModel, (path) => {
    required(path.name, { message: 'Inserisci un nome per la mappa.' });
    maxLength(path.name, NAME_MAX_LENGTH, {
      message: `Il nome non può superare ${NAME_MAX_LENGTH} caratteri.`,
    });
    validate(path.name, ({ value }) => value() === '' || value().trim().length > 0
      ? null
      : { kind: 'blank', message: 'Inserisci un nome per la mappa.' });
    validate(path.preset, ({ value }) => Object.hasOwn(SCENE_PRESETS, value())
      ? null
      : { kind: 'preset', message: 'Scegli un preset valido.' });
    validate(path.orientation, ({ value, valueOf }) => {
      if (value() !== 'portrait') {
        return null;
      }
      const preset = SCENE_PRESETS[valueOf(path.preset)];
      return preset?.portrait === null
        ? { kind: 'orientation', message: 'I preset ultrawide esistono solo in orizzontale.' }
        : null;
    });
  });

  // Alias scrivibili dei campi: i test e i chiamanti esistenti continuano a usare i signal.
  public readonly draftName = this.createForm.name().value;
  public readonly draftPreset = this.createForm.preset().value;
  public readonly draftOrientation = this.createForm.orientation().value;

  public readonly presets: readonly PresetOption[] = (
    Object.keys(SCENE_PRESETS) as ResolutionPreset[]
  ).map((value) => ({ value, label: presetLabels[value] }));

  public readonly portraitUnavailable = computed(
    () => SCENE_PRESETS[this.draftPreset()].portrait === null,
  );

  public readonly createResolution = computed(() =>
    sceneDimensions(this.draftPreset(), this.draftOrientation()),
  );

  public constructor() {
    // Anche un cambio preset via `[formField]` deve riallineare l'orientamento.
    effect(() => {
      if (this.portraitUnavailable() && this.draftOrientation() === 'portrait') {
        this.draftOrientation.set('landscape');
      }
    });
  }

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
    this.createForm().reset({
      name: 'Nuova mappa',
      preset: '1080p',
      orientation: 'landscape',
    });
    this.createError.set(null);
    this.error.set(null);
    this.createOpen.set(true);
  }

  public setPreset(preset: ResolutionPreset): void {
    this.draftPreset.set(preset);
    if (SCENE_PRESETS[preset].portrait === null) {
      this.draftOrientation.set('landscape');
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
    this.busy.set(true);
    this.createError.set(null);
    try {
      await submit(this.createForm, {
        action: async () => {
          const map = await this.mapsApi.create(campaign.id, {
            name: this.draftName().trim(),
            preset: this.draftPreset(),
            orientation: this.draftOrientation(),
          });
          this.createOpen.set(false);
          await this.router.navigate(['/maps', map.id]);
          return undefined;
        },
      });
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
