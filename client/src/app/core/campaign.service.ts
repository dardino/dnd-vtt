import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Campaign,
  CreateCampaign,
  CreateScene,
  Scene,
  SceneSnapshot,
  UpdateCampaign,
  UpdateScene,
} from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

export interface CampaignPage {
  items: Campaign[];
  nextCursor: string | null;
}

export interface ScenePage {
  items: Scene[];
  nextCursor: string | null;
}

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private readonly http = inject(HttpClient);

  public async list(limit = 200): Promise<Campaign[]> {
    const page = await firstValueFrom(
      this.http.get<CampaignPage>(`/api/v1/campaigns?limit=${limit}`),
    );
    return page.items;
  }

  public async get(id: string): Promise<Campaign> {
    return firstValueFrom(this.http.get<Campaign>(`/api/v1/campaigns/${id}`));
  }

  public async create(input: CreateCampaign): Promise<Campaign> {
    return firstValueFrom(this.http.post<Campaign>('/api/v1/campaigns', input));
  }

  public async listScenes(campaignId: string): Promise<Scene[]> {
    const page = await firstValueFrom(
      this.http.get<ScenePage>(`/api/v1/campaigns/${campaignId}/scenes?limit=200`),
    );
    return page.items;
  }

  public async createScene(
    campaignId: string,
    input: CreateScene | string,
  ): Promise<Scene> {
    const body = typeof input === 'string' ? { name: input } : input;
    return firstValueFrom(
      this.http.post<Scene>(`/api/v1/campaigns/${campaignId}/scenes`, body),
    );
  }

  public async patch(id: string, patch: UpdateCampaign): Promise<Campaign> {
    return firstValueFrom(this.http.patch<Campaign>(`/api/v1/campaigns/${id}`, patch));
  }

  public async updateScene(sceneId: string, patch: UpdateScene): Promise<Scene> {
    return firstValueFrom(this.http.patch<Scene>(`/api/v1/scenes/${sceneId}`, patch));
  }

  public async getSnapshot(sceneId: string): Promise<SceneSnapshot> {
    return firstValueFrom(this.http.get<SceneSnapshot>(`/api/v1/scenes/${sceneId}/snapshot`));
  }
}
