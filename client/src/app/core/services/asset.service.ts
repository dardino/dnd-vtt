import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Asset } from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly http = inject(HttpClient);
  /** Gli asset sono immutabili: una sola richiesta per id, condivisa tra i chiamanti. */
  private readonly cache = new Map<string, Promise<Asset>>();

  public async upload(file: File): Promise<Asset> {
    const form = new FormData();
    form.append('file', file);
    const asset = await firstValueFrom(this.http.post<Asset>('/api/v1/assets', form));
    this.cache.set(asset.id, Promise.resolve(asset));
    return asset;
  }

  public get(id: string): Promise<Asset> {
    const cached = this.cache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const request = firstValueFrom(this.http.get<Asset>(`/api/v1/assets/${id}`))
      .catch((error: unknown) => {
        this.cache.delete(id);
        throw error;
      });
    this.cache.set(id, request);
    return request;
  }
}
