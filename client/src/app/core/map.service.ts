import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateMap,
  CreateSceneFromMap,
  CreateSceneFromMapResult,
  Map,
  MapDocument,
  MapList,
  MapSummary,
} from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MapService {
  private readonly http = inject(HttpClient);

  public async list(campaignId: string): Promise<MapSummary[]> {
    const result = await firstValueFrom(
      this.http.get<MapList>(`/api/v1/campaigns/${campaignId}/maps`),
    );
    return result.items;
  }

  public async get(id: string): Promise<Map> {
    return firstValueFrom(this.http.get<Map>(`/api/v1/maps/${id}`));
  }

  public async create(campaignId: string, input: CreateMap): Promise<Map> {
    return firstValueFrom(
      this.http.post<Map>(`/api/v1/campaigns/${campaignId}/maps`, input),
    );
  }

  public async save(id: string, version: number, document: MapDocument): Promise<Map> {
    return firstValueFrom(
      this.http.put<Map>(`/api/v1/maps/${id}`, { version, document }),
    );
  }

  public async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/v1/maps/${id}`));
  }

  public async duplicate(id: string): Promise<Map> {
    return firstValueFrom(this.http.post<Map>(`/api/v1/maps/${id}/duplicate`, {}));
  }

  public async createScene(
    campaignId: string,
    input: CreateSceneFromMap,
  ): Promise<CreateSceneFromMapResult> {
    return firstValueFrom(
      this.http.post<CreateSceneFromMapResult>(
        `/api/v1/campaigns/${campaignId}/scenes/from-map`,
        input,
      ),
    );
  }
}
