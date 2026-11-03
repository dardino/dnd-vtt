import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Asset } from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly http = inject(HttpClient);

  public async upload(file: File): Promise<Asset> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(this.http.post<Asset>('/api/v1/assets', form));
  }

  public async get(id: string): Promise<Asset> {
    return firstValueFrom(this.http.get<Asset>(`/api/v1/assets/${id}`));
  }
}
