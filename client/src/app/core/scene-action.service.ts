import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ActionRequest,
  AppliedAction,
  ClearHistoryResult,
  GameAction,
  RedoResult,
  ResetFogResult,
  UndoResult,
} from '@dnd-vtt/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SceneActionService {
  private readonly http = inject(HttpClient);

  public async send(campaignId: string, sceneId: string, action: GameAction): Promise<AppliedAction> {
    const request: ActionRequest = {
      id: crypto.randomUUID(),
      clientId: `sheet-${crypto.randomUUID()}`,
      sceneId,
      action,
    };
    return firstValueFrom(
      this.http.post<AppliedAction>(`/api/v1/campaigns/${campaignId}/actions`, request),
    );
  }

  public async undo(campaignId: string, entryId: string): Promise<UndoResult> {
    return firstValueFrom(
      this.http.post<UndoResult>(`/api/v1/campaigns/${campaignId}/actions/undo`, { entryId }),
    );
  }

  public async redo(campaignId: string): Promise<RedoResult> {
    return firstValueFrom(
      this.http.post<RedoResult>(`/api/v1/campaigns/${campaignId}/actions/redo`, {}),
    );
  }

  public async clearHistory(campaignId: string): Promise<ClearHistoryResult> {
    return firstValueFrom(
      this.http.delete<ClearHistoryResult>(`/api/v1/campaigns/${campaignId}/actions`),
    );
  }

  public async resetFog(campaignId: string, sceneId: string): Promise<ResetFogResult> {
    return firstValueFrom(
      this.http.post<ResetFogResult>(
        `/api/v1/campaigns/${campaignId}/actions/reset-fog`,
        { sceneId },
      ),
    );
  }
}
