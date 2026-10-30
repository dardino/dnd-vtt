import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreatePlayerLinkResult,
  PlayerLink,
  PlayerSheetPatch,
  PlayerSheetView,
} from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly http = inject(HttpClient);

  public async createLink(actorId: string): Promise<CreatePlayerLinkResult> {
    return firstValueFrom(
      this.http.post<CreatePlayerLinkResult>(`/api/v1/actors/${actorId}/player-link`, {}),
    );
  }

  public async getLink(actorId: string): Promise<PlayerLink | null> {
    const result = await firstValueFrom(
      this.http.get<{ link: PlayerLink | null }>(`/api/v1/actors/${actorId}/player-link`),
    );
    return result.link;
  }

  public async setEditing(actorId: string, editingEnabled: boolean): Promise<PlayerLink | null> {
    const result = await firstValueFrom(
      this.http.patch<{ link: PlayerLink | null }>(`/api/v1/actors/${actorId}/player-link`, {
        editingEnabled,
      }),
    );
    return result.link;
  }

  public async sheet(token: string): Promise<PlayerSheetView> {
    return firstValueFrom(this.http.get<PlayerSheetView>(`/api/v1/play/${token}/sheet`));
  }

  public async patch(token: string, input: PlayerSheetPatch): Promise<PlayerSheetView> {
    return firstValueFrom(
      this.http.patch<PlayerSheetView>(`/api/v1/play/${token}/sheet`, input),
    );
  }
}
